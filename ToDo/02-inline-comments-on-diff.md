# Plan: Inline Comments on Diff

## Overview
Allow users to leave inline comments directly on the diff view by clicking on specific lines, similar to GitHub's PR review interface.

## Current State
- Diff is rendered using `diff2html` in side-by-side mode
- Comments can only be added through the sidebar form as "conversation" type
- `draftComments` table already has fields for inline comments (`path`, `line`, `startLine`, `side`, `commitSha`)
- No UI mechanism to select lines or add comments directly on the diff

## Implementation Steps

### 1. Add Click Handlers to Diff Lines
Modify the diff rendering in `steps/[stepId]/+page.svelte`:

```typescript
// After rendering diff, add click listeners to line numbers
function addLineClickHandlers(container: HTMLElement, hunks: any[]) {
  const lineNumbers = container.querySelectorAll('.d2h-code-linenumber');
  lineNumbers.forEach((lineNum) => {
    lineNum.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest('tr');
      const lineInfo = extractLineInfo(row, hunks);
      openInlineCommentForm(lineInfo);
    });
  });
}
```

### 2. Create Line Selection UI
- Add hover state to line numbers (change cursor, background color)
- Show a "+" icon on hover like GitHub
- Support multi-line selection (shift+click or drag)

### 3. Create Inline Comment Form Component
Create `src/lib/components/InlineCommentForm.svelte`:

```svelte
<script lang="ts">
  export let path: string;
  export let line: number;
  export let startLine: number | null = null;
  export let side: 'LEFT' | 'RIGHT';
  export let commitSha: string;
  export let onSubmit: (comment: string) => void;
  export let onCancel: () => void;
</script>

<!-- Floating form positioned near the selected line -->
```

### 4. Update Draft Comments API
Modify `src/routes/api/steps/[stepId]/draft-comments/+server.ts`:
- Already supports inline fields, but verify proper handling
- Ensure `targetType: 'inline'` is properly set
- Validate that path, line, and side are provided for inline comments

### 5. Display Existing Inline Comments in Diff
- After rendering diff, inject existing draft comments at their line positions
- Show comment indicators (badges) on lines with comments
- Click to expand/collapse inline comments

### 6. Extract Line Metadata
Create utility function to extract line information from diff2html rows:

```typescript
interface LineInfo {
  path: string;
  line: number;
  startLine?: number;
  side: 'LEFT' | 'RIGHT';
  content: string;
}

function extractLineInfo(row: HTMLElement, hunks: any[]): LineInfo {
  // Parse line number from d2h-code-linenumber
  // Determine side from parent container
  // Get file path from hunk context
}
```

### 7. Keyboard Navigation
- Tab through diff lines
- Enter to open comment form
- Escape to close form

### 8. Visual Feedback
- Highlight selected line(s)
- Show comment thread indicator on lines with comments
- Animation when adding/removing comments

## Files to Create/Modify
- `src/lib/components/InlineCommentForm.svelte` (new)
- `src/lib/components/InlineCommentThread.svelte` (new)
- `src/routes/app/sessions/[sessionId]/steps/[stepId]/+page.svelte` (major changes)
- `src/routes/api/steps/[stepId]/draft-comments/+server.ts` (verify/update)

## Database Schema
Already supports inline comments:
```typescript
path: text('path'),
commitSha: text('commit_sha'),
side: text('side'), // LEFT, RIGHT
line: integer('line'),
startLine: integer('start_line'),
startSide: text('start_side'),
```

## UI/UX Considerations
- Form should appear inline, not in sidebar
- Multi-line comments should show line range
- Support markdown preview in comment form
- Show which lines have pending comments in the sidebar list

## Testing
- Test single-line comments on added/removed/unchanged lines
- Test multi-line selection
- Test comment persistence across page refreshes
- Test publishing inline comments to GitHub
- Test keyboard navigation

## Dependencies
- Depends on: None
- Related to: TODO #12 (file reference in comments)
