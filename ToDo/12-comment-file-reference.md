# Plan: Fix File Reference in Comments

## Overview
Ensure that when adding a comment in the notes and comments section, the comment properly references the file it relates to when submitted to GitHub.

## Current State
- Comments added through the sidebar don't include file path information
- When submitting comments to GitHub, there's no context about which file the comment relates to
- The `draftComments` table has `path` field but it may not be populated for conversation-type comments
- Comments lose their context when submitted to GitHub PR

## Problem Analysis

Looking at the current code flow:

1. **Comment submission** (`steps/[stepId]/+page.svelte`):
```typescript
const res = await fetch(`/api/steps/${data.step.id}/draft-comments`, {
  method: 'POST',
  body: JSON.stringify({ 
    targetType: 'conversation',  // No file path sent!
    bodyMarkdown: commentContent 
  })
});
```

2. **API handler** (`api/steps/[stepId]/draft-comments/+server.ts`):
   - Likely doesn't extract file context from the step

3. **Submit review** (`api/sessions/[sessionId]/submit-review/+server.ts`):
   - May not include file context when posting to GitHub

## Implementation Steps

### 1. Update Comment Submission to Include Context
Modify `steps/[stepId]/+page.svelte`:

```typescript
async function submitComment() {
  if (!commentContent.trim()) return;
  isSubmittingComment = true;
  
  // Get file paths from current step
  const diffHunks = safeParse<any[]>(data.step.diffHunksJson, []);
  const filePaths = diffHunks.map(h => h.path);
  
  try {
    const res = await fetch(`/api/steps/${data.step.id}/draft-comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        targetType: 'conversation',
        bodyMarkdown: commentContent,
        // Include file context
        relatedFiles: filePaths,
        stepTitle: data.step.title
      })
    });
    // ...
  }
}
```

### 2. Update Draft Comments API
Modify `src/routes/api/steps/[stepId]/draft-comments/+server.ts`:

```typescript
export async function POST({ request, params, locals }) {
  const { stepId } = params;
  const body = await request.json();
  
  // Get step to access file context
  const step = await db.query.reviewSteps.findFirst({
    where: eq(reviewSteps.id, stepId)
  });
  
  const diffHunks = JSON.parse(step.diffHunksJson);
  const primaryFile = diffHunks[0]?.path || null;
  
  const comment = await db.insert(draftComments).values({
    id: uuidv4(),
    stepId,
    authorUserId: locals.user.id,
    status: 'draft',
    targetType: body.targetType,
    bodyMarkdown: body.bodyMarkdown,
    // Store file context
    path: primaryFile,
    // Store additional context as JSON in body if needed
    metadata: JSON.stringify({
      relatedFiles: diffHunks.map(h => h.path),
      stepTitle: step.title
    })
  });
  
  return json(comment);
}
```

### 3. Update Database Schema (if needed)
Add metadata field to store additional context:

```typescript
// src/lib/server/db/schema.ts
export const draftComments = sqliteTable('draft_comments', {
  // ... existing fields ...
  
  // Add metadata field for additional context
  metadata: text('metadata'), // JSON string
});
```

### 4. Format Comment Body with File Context
When the comment is submitted to GitHub, prepend file context:

```typescript
// In submit-review handler
function formatCommentWithContext(comment: DraftComment): string {
  const metadata = comment.metadata ? JSON.parse(comment.metadata) : {};
  
  let formattedBody = comment.bodyMarkdown;
  
  // Add file context header if it's a conversation comment
  if (comment.targetType === 'conversation' && metadata.relatedFiles?.length) {
    const filesHeader = metadata.relatedFiles.length === 1
      ? `**Re: \`${metadata.relatedFiles[0]}\`**`
      : `**Re: ${metadata.relatedFiles.map(f => `\`${f}\``).join(', ')}**`;
    
    formattedBody = `${filesHeader}\n\n${formattedBody}`;
  }
  
  return formattedBody;
}
```

### 5. Update UI to Show File Context
Show related file in the comment display:

```svelte
<!-- In Notes & Comments tab -->
{#each draftComments as comment}
  <li class="text-sm bg-blue-50 border border-blue-100 rounded-md p-3">
    <div class="flex justify-between items-center mb-1">
      {#if comment.path}
        <span class="text-xs font-mono text-blue-600">{comment.path}</span>
      {:else if comment.line}
        <span class="text-xs font-bold uppercase text-blue-700">Line {comment.line}</span>
      {:else}
        <span class="text-xs font-bold uppercase text-blue-700">General</span>
      {/if}
      <span class="text-[10px] text-gray-400">{comment.status}</span>
    </div>
    <div class="text-gray-800">{comment.bodyMarkdown}</div>
  </li>
{/each}
```

### 6. Allow User to Specify File
Add file selector to comment form:

```svelte
<div class="space-y-3 bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
  <!-- File selector for context -->
  <div>
    <label for="related-file" class="block text-[10px] font-bold text-gray-400 uppercase mb-1">
      Related File (optional)
    </label>
    <select 
      id="related-file"
      bind:value={selectedFile}
      class="w-full text-sm border-gray-300 rounded-md focus:ring-blue-500 py-1"
    >
      <option value="">All files in this step</option>
      {#each filePaths as path}
        <option value={path}>{path}</option>
      {/each}
    </select>
  </div>
  
  <div>
    <label for="comment" class="block text-[10px] font-bold text-gray-400 uppercase mb-1">
      Comment (Markdown)
    </label>
    <textarea 
      id="comment"
      bind:value={commentContent}
      placeholder="Write a comment for the PR..."
      class="w-full text-sm border-gray-300 rounded-md focus:ring-blue-500 min-h-[80px]"
    ></textarea>
  </div>
  <!-- ... buttons ... -->
</div>
```

### 7. Update Wrap-up Page Display
Show file context on the wrap-up page:

```svelte
{#each data.draftComments.filter(d => d.comment.status === 'draft') as { comment, step }}
  <li class="bg-amber-50 border border-amber-200 rounded-lg p-4">
    <div class="flex justify-between items-start mb-2">
      <div>
        <span class="text-xs font-bold uppercase text-amber-600">{step.title}</span>
        {#if comment.path}
          <span class="text-xs font-mono text-amber-500 ml-2">({comment.path})</span>
        {/if}
      </div>
      <span class="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
        {comment.targetType}
      </span>
    </div>
    <p class="text-sm text-amber-900 line-clamp-2">{comment.bodyMarkdown}</p>
  </li>
{/each}
```

## Files to Modify
- `src/routes/app/sessions/[sessionId]/steps/[stepId]/+page.svelte`
- `src/routes/api/steps/[stepId]/draft-comments/+server.ts`
- `src/routes/api/sessions/[sessionId]/submit-review/+server.ts`
- `src/routes/app/sessions/[sessionId]/wrap-up/+page.svelte`
- `src/lib/server/db/schema.ts` (optional metadata field)

## Testing
- Add a comment without selecting a file (should use step's files)
- Add a comment with a specific file selected
- Submit review and verify GitHub shows file context
- Test with single-file steps
- Test with multi-file steps (TODO #10)

## Dependencies
- Related to: TODO #10 (Steps grouping - multi-file context)
- Related to: TODO #13 (Remove notes section)
