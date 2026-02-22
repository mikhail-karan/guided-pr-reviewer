# Plan: Risk Line Highlighting in Guidance

## Overview

Make the Potential Risks section in the guidance panel interactive. When hovering over a risk, highlight the specific lines in the diff that are at risk.

## Current State

- AI guidance includes `risks` array with `description` field
- Risks are displayed as simple list items in the sidebar
- No connection between risks and specific lines in the diff
- Risk data structure doesn't include line references

## Implementation Steps

### 1. Update AI Guidance Schema

Modify the AI prompt and response parsing to include line references:

```typescript
interface Risk {
	description: string;
	severity: 'low' | 'medium' | 'high';
	affectedLines: {
		path: string;
		startLine: number;
		endLine: number;
		side: 'LEFT' | 'RIGHT' | 'BOTH';
	}[];
}
```

### 2. Update AI Guidance Generation

Modify `src/lib/server/jobs/ai-guidance.ts`:

```typescript
// Update prompt to request line references
const prompt = `
Analyze the following code changes and identify potential risks.
For each risk, specify:
- A clear description of the risk
- Severity level (low, medium, high)
- The specific file(s) and line number ranges affected

Return as JSON:
{
  "risks": [
    {
      "description": "...",
      "severity": "high",
      "affectedLines": [
        { "path": "src/file.ts", "startLine": 10, "endLine": 15, "side": "RIGHT" }
      ]
    }
  ]
}
`;
```

### 3. Create Risk Hover Component

Create `src/lib/components/RiskItem.svelte`:

```svelte
<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let risk: Risk;

	const dispatch = createEventDispatcher();

	function handleMouseEnter() {
		dispatch('highlight', risk.affectedLines);
	}

	function handleMouseLeave() {
		dispatch('unhighlight');
	}
</script>

<li
	class="risk-item"
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	class:high={risk.severity === 'high'}
	class:medium={risk.severity === 'medium'}
	class:low={risk.severity === 'low'}
>
	<span class="severity-badge">{risk.severity}</span>
	<span class="description">{risk.description}</span>
</li>
```

### 4. Implement Diff Line Highlighting

Add functions in `steps/[stepId]/+page.svelte`:

```typescript
let highlightedLines = $state<Set<string>>(new Set());

function highlightRiskLines(affectedLines: AffectedLine[]) {
	const diffContainer = document.querySelector('.diff-container');
	if (!diffContainer) return;

	affectedLines.forEach(({ path, startLine, endLine, side }) => {
		for (let line = startLine; line <= endLine; line++) {
			const lineKey = `${path}:${line}:${side}`;
			highlightedLines.add(lineKey);

			// Find and highlight the DOM element
			const lineEl = findLineElement(diffContainer, path, line, side);
			if (lineEl) {
				lineEl.classList.add('risk-highlight');
			}
		}
	});
}

function clearHighlights() {
	document.querySelectorAll('.risk-highlight').forEach((el) => {
		el.classList.remove('risk-highlight');
	});
	highlightedLines.clear();
}
```

### 5. Add Highlight Styles

Add to `src/routes/layout.css`:

```css
:global(.risk-highlight) {
	background-color: rgba(239, 68, 68, 0.2) !important;
	transition: background-color 0.2s ease;
}

:global(.risk-highlight.high) {
	background-color: rgba(239, 68, 68, 0.3) !important;
	border-left: 3px solid rgb(239, 68, 68);
}

:global(.risk-highlight.medium) {
	background-color: rgba(245, 158, 11, 0.2) !important;
	border-left: 3px solid rgb(245, 158, 11);
}

:global(.risk-highlight.low) {
	background-color: rgba(59, 130, 246, 0.15) !important;
	border-left: 3px solid rgb(59, 130, 246);
}
```

### 6. Add Click-to-Navigate Feature

When clicking on a risk:

- Scroll the diff to show the first affected line
- Apply persistent highlight until user clicks elsewhere or hovers on another risk

### 7. Migration Handling

- Existing sessions won't have line references in risks
- Gracefully handle missing `affectedLines` data
- Show risks without hover functionality if line data is unavailable

## Files to Create/Modify

- `src/lib/server/jobs/ai-guidance.ts` (update AI prompt and parsing)
- `src/lib/components/RiskItem.svelte` (new)
- `src/routes/app/sessions/[sessionId]/steps/[stepId]/+page.svelte` (add highlighting logic)
- `src/routes/layout.css` (add highlight styles)

## UI/UX Considerations

- Smooth animation for highlighting
- Clear visual distinction between severity levels
- Tooltip showing affected file(s) on hover
- Consider adding a "Show in diff" button for click action

## Testing

- Test with risks affecting single line
- Test with risks affecting multiple lines
- Test with risks affecting multiple files
- Test existing sessions without line data (graceful degradation)
- Test scroll-to-line functionality

## Dependencies

- Depends on: AI guidance regeneration capability (already exists)
- May require re-generating guidance for existing sessions to populate line data
