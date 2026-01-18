# Plan: Granular AI Inline Explanations

## Overview
Make AI explanations more granular so they can be shown inline with specific code changes, especially when there are multiple logical changes within a single hunk.

## Current State
- AI explanations are generated per hunk (one explanation per diff hunk)
- A single hunk might contain multiple unrelated changes
- Explanations are injected after hunk headers, not at specific line positions
- Data structure: `{ hunkIndex: number, path: string, lineRange: string, explanation: string }`

## Problem Statement
A hunk might contain:
```diff
@@ -10,15 +10,20 @@
+ import { newFeature } from './features';  // Change 1: New import
  
  function processData(data) {
-   return data.map(x => x * 2);
+   const validated = validateData(data);   // Change 2: Validation
+   return validated.map(x => x * 2);
  }

+ export function formatOutput(result) {    // Change 3: New function
+   return JSON.stringify(result);
+ }
```

Currently: One explanation for the entire hunk
Desired: Separate explanations for each logical change

## Implementation Steps

### 1. Update AI Explanation Data Structure

```typescript
interface GranularExplanation {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  side: 'LEFT' | 'RIGHT' | 'BOTH';
  changeType: 'addition' | 'removal' | 'modification' | 'context';
  explanation: string;
  importance: 'high' | 'medium' | 'low';
}
```

### 2. Update AI Prompt for Granular Analysis
Modify `src/lib/server/jobs/ai-guidance.ts`:

```typescript
const prompt = `
Analyze the following diff and provide granular explanations for each distinct change.

For each logical change (not just each line), provide:
- The specific line range it affects
- Whether it's an addition, removal, or modification
- A brief explanation of what this specific change does
- The importance level

Group related consecutive lines into single explanations when they form one logical change.

Return as JSON array:
[
  {
    "path": "src/file.ts",
    "startLine": 10,
    "endLine": 12,
    "side": "RIGHT",
    "changeType": "addition",
    "explanation": "Adds input validation before processing",
    "importance": "high"
  }
]
`;
```

### 3. Implement Change Detection Algorithm
Create `src/lib/utils/diff-analyzer.ts`:

```typescript
interface ChangeGroup {
  startLine: number;
  endLine: number;
  type: 'addition' | 'removal' | 'modification';
  lines: string[];
}

function groupLogicalChanges(patch: string): ChangeGroup[] {
  // Parse diff lines
  // Group consecutive additions/removals
  // Detect paired additions/removals as "modifications"
  // Return grouped changes
}
```

### 4. Update Explanation Injection Logic
Modify `injectAiExplanations` in `steps/[stepId]/+page.svelte`:

```typescript
function injectGranularExplanations(
  container: HTMLElement,
  explanations: GranularExplanation[]
) {
  explanations.forEach(explanation => {
    const targetRow = findLineRow(container, explanation.path, explanation.startLine, explanation.side);
    if (!targetRow) return;
    
    // Create compact inline explanation
    const explanationEl = createInlineExplanation(explanation);
    
    // Insert after the last line of this change group
    const endRow = findLineRow(container, explanation.path, explanation.endLine, explanation.side);
    endRow?.after(explanationEl);
  });
}
```

### 5. Create Compact Inline Explanation Component
Design a more compact explanation that fits between diff lines:

```html
<div class="granular-explanation">
  <span class="explanation-icon">💡</span>
  <span class="explanation-text">Adds input validation before processing</span>
  <button class="expand-btn" title="Show more details">▼</button>
</div>
```

### 6. Add Expand/Collapse Functionality
- Default: Show compact one-line summary
- On click: Expand to show full explanation
- On hover: Show tooltip with additional context

### 7. Filter/Toggle Controls
Add UI controls to filter explanations by:
- Importance level (high/medium/low)
- Change type (additions/removals/modifications)
- Specific files (when multiple files in one step)

### 8. Database Schema Update
Consider if `aiInlineExplanationsJson` schema needs updating:
- Current: Array of hunk-level explanations
- New: Array of line-level granular explanations
- Migration: Support both formats during transition

## Files to Create/Modify
- `src/lib/server/jobs/ai-guidance.ts` (update AI prompt)
- `src/lib/utils/diff-analyzer.ts` (new - change grouping logic)
- `src/lib/components/GranularExplanation.svelte` (new)
- `src/routes/app/sessions/[sessionId]/steps/[stepId]/+page.svelte` (update injection)
- `src/routes/layout.css` (add compact explanation styles)

## Styling Considerations

```css
.granular-explanation {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  margin: 2px 0;
  background: linear-gradient(to right, #f0f9ff 0%, #e0f2fe 100%);
  border-left: 2px solid #0ea5e9;
  font-size: 12px;
  border-radius: 0 4px 4px 0;
}

.granular-explanation.high-importance {
  border-left-color: #f59e0b;
  background: linear-gradient(to right, #fffbeb 0%, #fef3c7 100%);
}

.granular-explanation.expanded {
  flex-direction: column;
  align-items: flex-start;
  padding: 8px 12px;
}
```

## Testing
- Test with hunks containing single change
- Test with hunks containing multiple unrelated changes
- Test with large hunks (100+ lines)
- Test expand/collapse functionality
- Test filter controls
- Verify backward compatibility with existing explanations

## Performance Considerations
- Limit number of explanations per hunk (max 5-6)
- Lazy-load expanded content
- Consider debouncing hover events
- Cache parsed diff structure

## Dependencies
- Depends on: AI guidance regeneration capability
- Related to: TODO #3 (Risk line highlighting)
