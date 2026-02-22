# Plan: Show Complexity and Impact in Diff View

## Overview

Display step complexity and impact indicators directly in the diff view header, eliminating the need to navigate back to the session page to see this information.

## Current State

- Complexity (`S`, `M`, `L`) and risk tags (e.g., `high-impact`) are stored in `reviewSteps` table
- This info is only visible on the session overview page (`/app/sessions/[sessionId]`)
- The step detail page (`/app/sessions/[sessionId]/steps/[stepId]`) shows title but not complexity/impact
- Users must navigate back and forth to reference this information

## Implementation Steps

### 1. Add Data to Step Page

Verify `data.step` in `steps/[stepId]/+page.server.ts` includes:

- `complexity`: string ('S', 'M', 'L')
- `riskTags`: JSON string array

### 2. Update Header Section

Modify the header in `steps/[stepId]/+page.svelte`:

```svelte
<header
	class="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 py-3"
>
	<div class="flex items-center gap-4">
		<a href="/app/sessions/{data.session.id}" class="text-gray-500 hover:text-gray-800">
			<!-- Back arrow -->
		</a>
		<div>
			<div class="flex items-center gap-2">
				<h1 class="text-lg leading-tight font-bold">{data.step.title}</h1>
				<span class="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
					Step {data.currentStepNumber} of {data.totalSteps}
				</span>

				<!-- NEW: Complexity Badge -->
				<ComplexityBadge complexity={data.step.complexity} />

				<!-- NEW: Impact Tags -->
				{#each safeParse(data.step.riskTags, []) as tag}
					<ImpactTag {tag} />
				{/each}
			</div>
			<p class="text-xs text-gray-500">{data.repo.owner}/{data.repo.name} • PR #{data.pr.number}</p>
		</div>
	</div>
	<!-- ... rest of header -->
</header>
```

### 3. Create Complexity Badge Component

Create `src/lib/components/ComplexityBadge.svelte`:

```svelte
<script lang="ts">
	export let complexity: 'S' | 'M' | 'L';

	const config = {
		S: { label: 'Small', color: 'bg-green-100 text-green-700', icon: '◆' },
		M: { label: 'Medium', color: 'bg-yellow-100 text-yellow-700', icon: '◆◆' },
		L: { label: 'Large', color: 'bg-red-100 text-red-700', icon: '◆◆◆' }
	};
</script>

<span
	class="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium {config[complexity]
		.color}"
	title="Complexity: {config[complexity].label}"
>
	<span class="text-[8px]">{config[complexity].icon}</span>
	{complexity}
</span>
```

### 4. Create Impact Tag Component

Create `src/lib/components/ImpactTag.svelte`:

```svelte
<script lang="ts">
	export let tag: string;

	const tagConfig: Record<string, { color: string; icon: string }> = {
		'high-impact': { color: 'bg-red-50 text-red-600 border-red-200', icon: '⚠️' },
		security: { color: 'bg-purple-50 text-purple-600 border-purple-200', icon: '🔒' },
		performance: { color: 'bg-blue-50 text-blue-600 border-blue-200', icon: '⚡' },
		'breaking-change': { color: 'bg-orange-50 text-orange-600 border-orange-200', icon: '💥' }
	};

	const config = tagConfig[tag] || { color: 'bg-gray-50 text-gray-600 border-gray-200', icon: '#' };
</script>

<span class="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs {config.color}">
	<span>{config.icon}</span>
	{tag}
</span>
```

### 5. Add to Diff Panel Header

Also show in the diff panel header (inside the code viewer box):

```svelte
<div class="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2">
	<div class="flex items-center gap-2">
		<span class="font-mono text-xs text-gray-600">{data.step.title}</span>
		<ComplexityBadge complexity={data.step.complexity} size="sm" />
	</div>
	<!-- ... AI Explanations toggle, etc. -->
</div>
```

### 6. Add Quick Stats Summary

Consider adding a small stats bar showing:

```svelte
<div class="flex items-center gap-4 text-xs text-gray-500">
	<span>+{additions} / -{deletions} lines</span>
	<span>{fileCount} file(s)</span>
	<span>{hunkCount} hunk(s)</span>
</div>
```

This requires parsing `diffHunksJson` to extract stats.

### 7. Keyboard Shortcut Info

Add tooltip or small indicator showing keyboard shortcuts:

- Press `?` to show shortcuts
- `n` for next step
- `p` for previous step
- `g` + `s` to go back to session

## Files to Create/Modify

- `src/lib/components/ComplexityBadge.svelte` (new)
- `src/lib/components/ImpactTag.svelte` (new)
- `src/routes/app/sessions/[sessionId]/steps/[stepId]/+page.svelte` (update header)
- `src/routes/app/sessions/[sessionId]/steps/[stepId]/+page.server.ts` (verify data passed)

## Styling

Ensure badges are:

- Compact enough to not crowd the header
- Visually distinct but not distracting
- Consistent with existing UI patterns

## Accessibility

- Add appropriate `title` attributes for tooltips
- Ensure color is not the only indicator (add icons/text)
- Support keyboard navigation to badges for screen readers

## Testing

- Verify badges display correctly for all complexity levels
- Test with multiple risk tags
- Test responsive layout (header on smaller screens)
- Verify data is correctly passed from server to client

## Dependencies

- None - straightforward UI enhancement
