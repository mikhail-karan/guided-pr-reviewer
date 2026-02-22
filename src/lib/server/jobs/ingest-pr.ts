import { db } from '../db';
import * as table from '../db/schema';
import { eq } from 'drizzle-orm';
import { getAppOctokit } from '../auth/github';
import { addJob } from './queue';

export async function ingestPrJob(sessionId: string) {
	const session = await db
		.select({
			session: table.reviewSessions,
			pr: table.pullRequests,
			repo: table.repos,
			installation: table.githubInstallations
		})
		.from(table.reviewSessions)
		.innerJoin(table.pullRequests, eq(table.reviewSessions.pullRequestId, table.pullRequests.id))
		.innerJoin(table.repos, eq(table.pullRequests.repoId, table.repos.id))
		.innerJoin(
			table.githubInstallations,
			eq(table.repos.installationId, table.githubInstallations.id)
		)
		.where(eq(table.reviewSessions.id, sessionId))
		.get();

	if (!session) {
		throw new Error(`Session ${sessionId} not found`);
	}

	const octokit = getAppOctokit(session.installation.installationId);

	// 1. Fetch PR diff
	const { data: diff } = await octokit.pulls.get({
		owner: session.repo.owner,
		repo: session.repo.name,
		pull_number: session.pr.number,
		headers: {
			accept: 'application/vnd.github.v3.diff'
		}
	});

	// 2. Fetch changed files for metadata
	const { data: files } = await octokit.pulls.listFiles({
		owner: session.repo.owner,
		repo: session.repo.name,
		pull_number: session.pr.number
	});

	// For now, we'll store the raw diff and files info in a temporary way
	// or pass it to the next job. In this MVP, we'll trigger generate_steps.

	console.log(`Ingested PR for session ${sessionId}. Files changed: ${files.length}`);

	await addJob('generate_steps', {
		sessionId,
		diff: diff as unknown as string,
		files: files.map((f) => ({
			filename: f.filename,
			status: f.status,
			additions: f.additions,
			deletions: f.deletions,
			patch: f.patch
		}))
	});
}
