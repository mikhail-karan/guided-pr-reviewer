# Plan: Remove Notes Section

## Overview

Remove the "Notes" section as it's redundant with the "Comments" functionality. Consolidate everything into draft PR comments.

## Current State

- Two separate sections: "Your Review Notes" and "Draft PR Comments"
- Notes are stored in `reviewerNotes` table
- Draft comments are stored in `draftComments` table
- Notes have `severity` field (nit, suggestion, concern, question)
- Notes are for internal use only (not submitted to GitHub)
- Comments are submitted to GitHub

## Analysis

### Current Data Models

**Reviewer Notes:**

```typescript
{
  id, stepId, authorUserId,
  severity: 'nit' | 'suggestion' | 'concern' | 'question',
  noteMarkdown,
  createdAt, updatedAt
}
```

**Draft Comments:**

```typescript
{
  id, stepId, authorUserId,
  status: 'draft' | 'publishing' | 'published' | 'failed',
  targetType: 'inline' | 'conversation',
  bodyMarkdown,
  path, commitSha, side, line, startLine, startSide,
  githubCommentId, githubReviewId, errorMessage,
  createdAt, updatedAt
}
```

### Migration Strategy

1. **Keep comments, remove notes** - simplest approach
2. **Merge notes into comments** - add internal-only flag to comments
3. **Convert notes to private comments** - notes become comments that aren't submitted

**Recommendation:** Option 2 - Add an `isPrivate` flag to comments. This preserves functionality while simplifying the UI.

## Implementation Steps

### 1. Update Draft Comments Schema

Add fields to support private notes:

```typescript
// src/lib/server/db/schema.ts
export const draftComments = sqliteTable('draft_comments', {
	// ... existing fields ...

	// Add private flag for internal notes
	isPrivate: integer('is_private', { mode: 'boolean' }).notNull().default(false),

	// Add severity for note-like features
	severity: text('severity') // 'nit' | 'suggestion' | 'concern' | 'question' | null
});
```

### 2. Create Database Migration

```sql
-- Add new columns
ALTER TABLE draft_comments ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0;
ALTER TABLE draft_comments ADD COLUMN severity TEXT;

-- Migrate existing notes to comments
INSERT INTO draft_comments (
  id, step_id, author_user_id, status, target_type, body_markdown,
  is_private, severity, created_at, updated_at
)
SELECT
  id, step_id, author_user_id, 'draft', 'conversation', note_markdown,
  1, severity, created_at, updated_at
FROM reviewer_notes;

-- After verification, drop notes table
-- DROP TABLE reviewer_notes;
```

### 3. Update API Endpoint

Modify `api/steps/[stepId]/draft-comments/+server.ts`:

```typescript
export async function POST({ request, params, locals }) {
	const body = await request.json();

	const comment = await db.insert(draftComments).values({
		id: uuidv4(),
		stepId: params.stepId,
		authorUserId: locals.user.id,
		status: 'draft',
		targetType: body.targetType,
		bodyMarkdown: body.bodyMarkdown,
		isPrivate: body.isPrivate || false,
		severity: body.severity || null
		// ... other fields
	});

	return json(comment);
}
```

### 4. Update Step Page UI

Replace two separate sections with unified comments:

```svelte
<!-- In Notes & Comments tab (now just Comments) -->
<div class="space-y-6 overflow-y-auto">
	<section>
		<h2 class="mb-4 text-sm font-bold tracking-wider text-gray-400 uppercase">Comments</h2>

		{#if draftComments.length === 0}
			<p class="text-sm text-gray-500 italic">No comments yet.</p>
		{:else}
			<ul class="space-y-4">
				{#each draftComments as comment}
					<li
						class="rounded-md p-3 text-sm {comment.isPrivate
							? 'border border-yellow-100 bg-yellow-50'
							: 'border border-blue-100 bg-blue-50'}"
					>
						<div class="mb-1 flex items-center justify-between">
							<div class="flex items-center gap-2">
								{#if comment.isPrivate}
									<span
										class="rounded bg-yellow-200 px-1.5 py-0.5 text-xs font-medium text-yellow-800"
										>Private</span
									>
								{/if}
								{#if comment.severity}
									<span class="text-xs font-bold text-gray-500 uppercase">{comment.severity}</span>
								{/if}
								{#if comment.line}
									<span class="text-xs text-blue-700">Line {comment.line}</span>
								{/if}
							</div>
							<span class="text-[10px] text-gray-400">
								{new Date(comment.createdAt).toLocaleTimeString()}
							</span>
						</div>
						<div class="text-gray-800">{comment.bodyMarkdown}</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>
```

### 5. Update Comment Form

Add private/severity options:

```svelte
{#if showCommentForm}
	<div class="space-y-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
		<!-- Comment type toggle -->
		<div class="flex gap-2">
			<button
				class="flex-1 rounded-md py-1.5 text-xs font-medium transition-colors {!isPrivateComment
					? 'bg-blue-100 text-blue-700'
					: 'bg-gray-100 text-gray-600'}"
				onclick={() => (isPrivateComment = false)}
			>
				PR Comment
			</button>
			<button
				class="flex-1 rounded-md py-1.5 text-xs font-medium transition-colors {isPrivateComment
					? 'bg-yellow-100 text-yellow-700'
					: 'bg-gray-100 text-gray-600'}"
				onclick={() => (isPrivateComment = true)}
			>
				Private Note
			</button>
		</div>

		<!-- Severity (only for private notes) -->
		{#if isPrivateComment}
			<div>
				<label class="mb-1 block text-[10px] font-bold text-gray-400 uppercase"> Type </label>
				<select bind:value={commentSeverity} class="w-full rounded-md border-gray-300 text-sm">
					<option value="">No label</option>
					<option value="nit">Nit</option>
					<option value="suggestion">Suggestion</option>
					<option value="concern">Concern</option>
					<option value="question">Question</option>
				</select>
			</div>
		{/if}

		<!-- Comment content -->
		<div>
			<label class="mb-1 block text-[10px] font-bold text-gray-400 uppercase">
				{isPrivateComment ? 'Note' : 'Comment'} (Markdown)
			</label>
			<textarea
				bind:value={commentContent}
				placeholder={isPrivateComment ? 'Write a private note...' : 'Write a comment for the PR...'}
				class="min-h-[80px] w-full rounded-md border-gray-300 text-sm"
			></textarea>
		</div>

		<div class="flex gap-2">
			<button
				onclick={submitComment}
				disabled={isSubmittingComment || !commentContent.trim()}
				class="flex-1 {isPrivateComment
					? 'bg-yellow-600 hover:bg-yellow-700'
					: 'bg-blue-600 hover:bg-blue-700'} rounded-md py-1.5 text-sm font-medium text-white transition disabled:opacity-50"
			>
				{isSubmittingComment ? 'Saving...' : isPrivateComment ? 'Save Note' : 'Save Comment'}
			</button>
			<button
				onclick={() => (showCommentForm = false)}
				class="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
			>
				Cancel
			</button>
		</div>
	</div>
{/if}
```

### 6. Update Wrap-up Page

Filter out private notes from GitHub submission:

```typescript
// In submit-review handler
const commentsToSubmit = draftComments.filter((c) => !c.isPrivate && c.status === 'draft');
```

Update wrap-up display to show private notes separately:

```svelte
<div class="mb-12 grid grid-cols-1 gap-8 md:grid-cols-2">
	<section>
		<h2 class="mb-4 text-xl font-semibold">Private Notes</h2>
		{#if privateNotes.length === 0}
			<p class="text-gray-500 italic">No private notes.</p>
		{:else}
			<!-- Display private notes -->
		{/if}
	</section>

	<section>
		<h2 class="mb-4 text-xl font-semibold">Comments to Submit</h2>
		{#if publicComments.length === 0}
			<p class="text-gray-500 italic">No comments to submit.</p>
		{:else}
			<!-- Display public comments -->
		{/if}
	</section>
</div>
```

### 7. Update Tab Label

Change "Notes & Comments" to just "Comments":

```svelte
<button
	class="flex-1 border-b-2 py-3 text-sm font-medium transition-colors ..."
	onclick={() => (activeTab = 'comments')}
>
	Comments
</button>
```

### 8. Remove Deprecated Code

After migration:

- Remove `reviewerNotes` table from schema
- Remove notes API endpoint (`api/steps/[stepId]/notes`)
- Remove notes-related code from components
- Update types

## Files to Modify

- `src/lib/server/db/schema.ts` (add fields, eventually remove notes table)
- `src/routes/api/steps/[stepId]/draft-comments/+server.ts`
- `src/routes/api/steps/[stepId]/notes/+server.ts` (remove)
- `src/routes/app/sessions/[sessionId]/steps/[stepId]/+page.svelte`
- `src/routes/app/sessions/[sessionId]/steps/[stepId]/+page.server.ts`
- `src/routes/app/sessions/[sessionId]/wrap-up/+page.svelte`
- `src/routes/app/sessions/[sessionId]/wrap-up/+page.server.ts`

## Migration Steps

1. Add new columns to `draft_comments` table
2. Create migration script to copy notes to comments
3. Update all UI and API code
4. Deploy and verify
5. Remove notes table and related code in follow-up

## Testing

- Create private notes, verify they don't appear in GitHub submission
- Create public comments, verify they submit correctly
- Test severity labels on private notes
- Verify wrap-up page shows correct categorization
- Test existing data migration

## Dependencies

- Related to: TODO #12 (File reference in comments)
