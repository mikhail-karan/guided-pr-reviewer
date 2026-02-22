# Plan: Improve Steps as Related Change Groups

## Overview

Redesign the concept of "steps" to be meaningful groups of related changes rather than one step per file. Steps should represent logical units of change that a reviewer would naturally review together.

## Current State

- Steps are generated 1:1 with files (`generate-steps.ts`)
- Each step contains diff hunks from a single file
- No intelligent grouping of related changes across files
- Step title is simply "Review {filename}"

## Desired Behavior

Steps should group related changes, for example:

- "Add user authentication" → includes changes to routes, middleware, and database
- "Refactor API error handling" → includes changes across multiple API files
- "Update styling" → includes CSS changes and component style updates

## Implementation Steps

### 1. Analyze PR for Logical Change Groups

Create `src/lib/server/jobs/analyze-changes.ts`:

```typescript
interface ChangeAnalysis {
	groups: ChangeGroup[];
}

interface ChangeGroup {
	id: string;
	title: string;
	description: string;
	category: 'feature' | 'bugfix' | 'refactor' | 'style' | 'test' | 'docs' | 'config';
	files: string[];
	complexity: 'S' | 'M' | 'L';
	riskTags: string[];
}

export async function analyzeChanges(
	files: GitHubFile[],
	prTitle: string,
	prBody: string
): Promise<ChangeAnalysis> {
	// Use AI to analyze and group files
}
```

### 2. Update AI Prompt for Grouping

Use AI to intelligently group files:

```typescript
const prompt = `
You are analyzing a pull request to group related changes for code review.

PR Title: ${prTitle}
PR Description: ${prBody}

Files changed:
${files.map((f) => `- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`).join('\n')}

Group these files into logical review steps. Each step should contain files that:
1. Implement a single feature or fix
2. Are closely related and should be reviewed together
3. Share a common purpose or module

Return JSON:
{
  "groups": [
    {
      "title": "Human-readable title describing this change",
      "description": "Brief explanation of what this group of changes does",
      "category": "feature|bugfix|refactor|style|test|docs|config",
      "files": ["path/to/file1.ts", "path/to/file2.ts"],
      "complexity": "S|M|L",
      "riskTags": ["high-impact", "security", etc]
    }
  ]
}

Guidelines:
- Keep groups focused (2-5 files typically)
- Don't create single-file groups unless the file is standalone
- Group related test files with their implementation
- Consider file paths and naming conventions
- Maximum 10 groups per PR
`;
```

### 3. Update Step Generation Job

Modify `src/lib/server/jobs/generate-steps.ts`:

```typescript
export async function generateStepsJob(
	sessionId: string,
	diff: string,
	files: any[],
	prTitle: string,
	prBody: string
) {
	// Analyze and group files
	const analysis = await analyzeChanges(files, prTitle, prBody);

	const steps = analysis.groups.map((group, index) => {
		// Collect diff hunks for all files in this group
		const groupDiffs = files
			.filter((f) => group.files.includes(f.filename))
			.map((f) => ({
				path: f.filename,
				patch: f.patch,
				status: f.status,
				additions: f.additions,
				deletions: f.deletions
			}));

		return {
			id: uuidv4(),
			sessionId,
			orderIndex: index,
			title: group.title,
			category: group.category,
			riskTags: JSON.stringify(group.riskTags),
			complexity: group.complexity,
			status: 'not_started',
			diffHunksJson: JSON.stringify(groupDiffs),
			createdAt: new Date(),
			updatedAt: new Date()
		};
	});

	for (const step of steps) {
		await db.insert(table.reviewSteps).values(step);
	}

	// Continue with AI guidance generation
	await addJob('generate_ai_guidance', { sessionId });
	for (const step of steps) {
		await addJob('build_context_pack', { stepId: step.id });
	}
}
```

### 4. Update Diff View for Multi-File Steps

Modify `steps/[stepId]/+page.svelte` to handle multiple files:

```svelte
<script>
	let diffHunks = $derived(safeParse<any[]>(data.step.diffHunksJson, []));
	let fileGroups = $derived(groupByFile(diffHunks));
	let activeFile = $state<string | null>(null);
</script>

<!-- File tabs or accordion for multi-file steps -->
<div class="file-tabs">
	{#each Object.keys(fileGroups) as filePath}
		<button
			class="file-tab"
			class:active={activeFile === filePath}
			onclick={() => (activeFile = filePath)}
		>
			{getFileName(filePath)}
			<span class="file-stats">
				+{fileGroups[filePath].additions}/-{fileGroups[filePath].deletions}
			</span>
		</button>
	{/each}
</div>

<!-- Or show all files in expandable sections -->
{#each Object.entries(fileGroups) as [filePath, hunks]}
	<div class="file-section">
		<div class="file-header">{filePath}</div>
		<div class="file-diff" bind:this={diffContainers[filePath]}>
			<!-- Render diff for this file -->
		</div>
	</div>
{/each}
```

### 5. Update Step Card on Session Page

Show files included in each step:

```svelte
<a href="/app/sessions/{data.session.id}/steps/{step.id}" class="step-card">
	<h3 class="font-bold">{step.title}</h3>
	<p class="text-sm text-gray-600">{step.category}</p>

	<!-- Show files in this step -->
	<div class="mt-2 flex flex-wrap gap-1">
		{#each getFilesFromStep(step) as file}
			<span class="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs">
				{getFileName(file)}
			</span>
		{/each}
	</div>

	<!-- Stats -->
	<div class="mt-2 text-xs text-gray-500">
		{getFilesFromStep(step).length} files · {getTotalChanges(step)} changes
	</div>
</a>
```

### 6. Add Manual Regrouping UI (Optional)

Allow users to manually adjust groupings:

```svelte
<button onclick={() => (showRegroupDialog = true)}> Adjust Groupings </button>

{#if showRegroupDialog}
	<dialog open>
		<h2>Reorganize Review Steps</h2>
		<!-- Drag-and-drop interface to move files between steps -->
		<!-- Or split/merge steps -->
	</dialog>
{/if}
```

### 7. Fallback for Simple PRs

For PRs with few files, keep simple 1:1 mapping:

```typescript
if (files.length <= 3) {
	// Simple PR - one step per file
	return files.map((file) => ({
		title: `Review ${file.filename}`,
		files: [file.filename]
		// ...
	}));
}
```

### 8. Update Context Pack Generation

Ensure context packs consider all files in a step:

```typescript
export async function buildContextPackJob(stepId: string) {
	const step = await getStep(stepId);
	const diffHunks = JSON.parse(step.diffHunksJson);

	// Get context for all files in the step
	const allFiles = diffHunks.map((h) => h.path);
	const contextItems = [];

	for (const file of allFiles) {
		const fileContext = await gatherFileContext(file);
		contextItems.push(...fileContext);
	}

	// Deduplicate and prioritize context items
	const prioritizedContext = prioritizeContext(contextItems);

	await saveContextPack(stepId, prioritizedContext);
}
```

## Database Changes

No schema changes needed - `diffHunksJson` already supports arrays of hunks from multiple files.

## Files to Create/Modify

- `src/lib/server/jobs/analyze-changes.ts` (new)
- `src/lib/server/jobs/generate-steps.ts` (major rewrite)
- `src/lib/server/jobs/build-context.ts` (update for multi-file)
- `src/routes/app/sessions/[sessionId]/+page.svelte` (show files per step)
- `src/routes/app/sessions/[sessionId]/steps/[stepId]/+page.svelte` (multi-file diff view)

## Testing

- Test with single-file PRs
- Test with small PRs (2-3 files)
- Test with large PRs (20+ files)
- Test with PRs that have clear logical groupings
- Test with PRs that have mixed/unclear groupings
- Verify context packs include relevant cross-file context

## Dependencies

- Requires AI integration for intelligent grouping
- Related to: TODO #4 (granular explanations should work with multi-file steps)
