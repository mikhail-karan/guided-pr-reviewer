import { db } from '../db';
import * as table from '../db/schema';
import { eq } from 'drizzle-orm';
import { getAppOctokit } from '../auth/github';
import { ai, LLM_MODEL } from '../ai/client';

/**
 * Gathers codebase context for a repository by fetching key files
 * (README, dependency manifests, configs) and using the LLM to produce
 * a structured summary. The result is stored on repos.codebaseContextJson
 * and later injected into AI review prompts.
 */
export async function gatherRepoContextJob(repoId: string) {
	console.log(`Gathering codebase context for repo ${repoId}`);

	const repo = await db
		.select({
			repo: table.repos,
			installation: table.githubInstallations
		})
		.from(table.repos)
		.innerJoin(
			table.githubInstallations,
			eq(table.repos.installationId, table.githubInstallations.id)
		)
		.where(eq(table.repos.id, repoId))
		.get();

	if (!repo) {
		throw new Error(`Repo ${repoId} not found`);
	}

	// Skip if context already exists
	if (repo.repo.codebaseContextJson) {
		console.log(`Repo ${repoId} already has codebase context, skipping`);
		return;
	}

	const octokit = getAppOctokit(repo.installation.installationId);
	const owner = repo.repo.owner;
	const name = repo.repo.name;
	const defaultBranch = repo.repo.defaultBranch;

	const gatheredFiles: Array<{ path: string; content: string }> = [];
	let directoryTree = '';

	// 1. Fetch top-level directory tree
	try {
		const { data: tree } = await octokit.git.getTree({
			owner,
			repo: name,
			tree_sha: defaultBranch,
			recursive: 'true'
		});

		// Build a readable tree limited to first 2 directory levels
		const paths = tree.tree
			.filter((item) => item.path && item.type)
			.map((item) => ({
				path: item.path!,
				type: item.type as string
			}));

		const filteredPaths = paths.filter((p) => {
			const depth = p.path.split('/').length;
			// Show all top-level items and items 2 levels deep
			return depth <= 2;
		});

		directoryTree = filteredPaths
			.map((p) => `${p.type === 'tree' ? '📁' : '📄'} ${p.path}`)
			.join('\n');

		if (tree.truncated) {
			directoryTree += '\n... (tree truncated, large repository)';
		}
	} catch (err) {
		console.warn(`Failed to fetch directory tree for ${owner}/${name}:`, err);
	}

	// 2. Attempt to fetch key files
	const keyFiles = [
		// Documentation
		'README.md',
		'README',
		'CONTRIBUTING.md',
		'ARCHITECTURE.md',
		'docs/ARCHITECTURE.md',
		// JS/TS ecosystem
		'package.json',
		'tsconfig.json',
		'biome.json',
		'.eslintrc.json',
		'.eslintrc.js',
		'.prettierrc',
		'.prettierrc.json',
		// Python ecosystem
		'pyproject.toml',
		'requirements.txt',
		'setup.py',
		'setup.cfg',
		// Rust ecosystem
		'Cargo.toml',
		// Go ecosystem
		'go.mod',
		// Java/Kotlin ecosystem
		'build.gradle',
		'build.gradle.kts',
		'pom.xml',
		// Ruby ecosystem
		'Gemfile',
		// Docker & CI
		'Dockerfile',
		'docker-compose.yml',
		'docker-compose.yaml',
		'.github/workflows/ci.yml',
		'.github/workflows/ci.yaml'
	];

	for (const filePath of keyFiles) {
		try {
			const { data } = await octokit.repos.getContent({
				owner,
				repo: name,
				path: filePath,
				ref: defaultBranch
			});

			// getContent returns file content as base64 when it's a file
			if (!Array.isArray(data) && data.type === 'file' && data.content) {
				const content = Buffer.from(data.content, 'base64').toString('utf-8');
				// Limit individual file content to avoid token overflow
				const truncated =
					content.length > 5000 ? content.substring(0, 5000) + '\n... (truncated)' : content;
				gatheredFiles.push({ path: filePath, content: truncated });
			}
		} catch {
			// File doesn't exist, skip silently
		}
	}

	if (gatheredFiles.length === 0 && !directoryTree) {
		console.log(`No files or tree gathered for ${owner}/${name}, skipping context generation`);
		return;
	}

	// 3. Send to LLM for structured summary
	const filesSection = gatheredFiles
		.map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
		.join('\n\n');

	try {
		const response = await ai.chat.completions.create({
			model: LLM_MODEL,
			messages: [
				{
					role: 'system',
					content: `You are an expert software engineer analyzing a codebase. You ALWAYS respond in valid JSON.

The JSON must have this exact structure:
{
  "description": "A 2-3 sentence description of what this project does and its purpose.",
  "techStack": ["list", "of", "key", "technologies", "frameworks", "and", "languages"],
  "architecture": "A paragraph describing the architecture patterns, directory structure, and how the codebase is organized.",
  "conventions": "A paragraph describing coding conventions, linting/formatting rules, and style patterns observed.",
  "testingApproach": "A paragraph describing how testing is done (frameworks, patterns, coverage expectations). Say 'No testing information available.' if none found."
}

Be specific and concrete. Reference actual file names, packages, and patterns you see in the provided files. Do not make up information that isn't supported by the provided context.`
				},
				{
					role: 'user',
					content: `Analyze this codebase and provide a structured summary.

Repository: ${owner}/${name}
Default Branch: ${defaultBranch}

## Directory Structure
${directoryTree || 'Not available'}

## Key Files
${filesSection || 'No key files found'}`
				}
			],
			response_format: { type: 'json_object' }
		});

		const content = response.choices[0].message.content;
		if (content) {
			let contextJson: string;
			try {
				// Validate it's valid JSON
				const parsed = JSON.parse(content);
				// Add metadata
				parsed.gatheredAt = new Date().toISOString();
				contextJson = JSON.stringify(parsed);
			} catch {
				// Fallback: wrap raw content
				contextJson = JSON.stringify({
					description: content,
					techStack: [],
					architecture: '',
					conventions: '',
					testingApproach: '',
					gatheredAt: new Date().toISOString()
				});
			}

			await db
				.update(table.repos)
				.set({
					codebaseContextJson: contextJson,
					updatedAt: new Date()
				})
				.where(eq(table.repos.id, repoId));

			console.log(`Codebase context stored for repo ${owner}/${name}`);
		}
	} catch (err) {
		console.error(`Error generating codebase context for ${owner}/${name}:`, err);
		// Don't throw - this is an enhancement, not a requirement
	}
}
