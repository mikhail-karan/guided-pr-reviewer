# Plan: Easier Access to Submit Review

## Overview

Make it easier to navigate to the final review submission stage from any point in the review process.

## Current State

- Submit review is only accessible from the wrap-up page (`/app/sessions/[sessionId]/wrap-up`)
- To get there, users must either:
  - Click through all steps and reach the end
  - Manually navigate via the checkmark icon on the last step
- No quick access from the session overview or step pages
- Users have to go "back to plan" and then to wrap-up

## Implementation Steps

### 1. Add "Finish Review" Button to Session Header

Update `sessions/[sessionId]/+page.svelte`:

```svelte
<div class="mb-8 flex items-center justify-between">
	<div class="flex items-center gap-4">
		<!-- existing back link and title -->
	</div>

	<div class="flex items-center gap-3">
		<!-- Existing config menu button -->

		<!-- NEW: Finish Review Button -->
		<a
			href="/app/sessions/{data.session.id}/wrap-up"
			class="flex cursor-pointer items-center gap-2 rounded-lg bg-green-600 px-4 py-2 font-medium text-white transition hover:bg-green-700"
		>
			<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
			</svg>
			Finish Review
		</a>
	</div>
</div>
```

### 2. Add Floating Action Button to Step View

Update `steps/[stepId]/+page.svelte`:

```svelte
<!-- Floating Finish Review Button -->
<div class="fixed right-6 bottom-6 z-50">
	<a
		href="/app/sessions/{data.session.id}/wrap-up"
		class="flex cursor-pointer items-center gap-2 rounded-full bg-green-600 px-4 py-3 text-white shadow-lg transition-all hover:bg-green-700 hover:shadow-xl"
		title="Finish and submit review"
	>
		<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
		</svg>
		<span class="font-medium">Finish Review</span>
	</a>
</div>
```

### 3. Add Quick Actions Dropdown in Step Header

Enhance the step navigation area:

```svelte
<div class="flex items-center gap-4">
	<!-- Step navigation arrows -->
	<div class="flex items-center rounded-lg bg-gray-100 p-1">
		<!-- Previous/Next step buttons -->
	</div>

	<div class="h-6 w-px bg-gray-200"></div>

	<!-- Quick Actions Dropdown -->
	<div class="relative">
		<button
			onclick={() => (showQuickActions = !showQuickActions)}
			class="flex cursor-pointer items-center gap-1 rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900"
		>
			<span>Quick Actions</span>
			<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
			</svg>
		</button>

		{#if showQuickActions}
			<div
				class="absolute right-0 z-20 mt-2 w-48 rounded-lg border border-gray-200 bg-white shadow-lg"
			>
				<a
					href="/app/sessions/{data.session.id}"
					class="block cursor-pointer px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
				>
					Back to Session Plan
				</a>
				<a
					href="/app/sessions/{data.session.id}/wrap-up"
					class="block cursor-pointer px-4 py-2 text-sm text-green-700 hover:bg-green-50"
				>
					Finish Review →
				</a>
				<hr class="my-1 border-gray-100" />
				<a
					href="/app/repos/{data.repo.installationId}/{data.repo.name}/prs"
					class="block cursor-pointer px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
				>
					All PRs
				</a>
			</div>
		{/if}
	</div>
</div>
```

### 4. Add Progress Indicator with Quick Access

Show review progress with link to wrap-up:

```svelte
<!-- In step page header or sidebar -->
<div class="mb-4 rounded-lg bg-gray-50 p-4">
	<div class="mb-2 flex items-center justify-between">
		<span class="text-sm font-medium text-gray-600">Review Progress</span>
		<span class="text-sm text-gray-500">{completedSteps}/{totalSteps} steps</span>
	</div>
	<div class="mb-3 h-2 w-full rounded-full bg-gray-200">
		<div
			class="h-2 rounded-full bg-blue-600 transition-all"
			style="width: {(completedSteps / totalSteps) * 100}%"
		></div>
	</div>
	<a
		href="/app/sessions/{data.session.id}/wrap-up"
		class="cursor-pointer text-sm font-medium text-green-600 hover:text-green-800"
	>
		Ready to submit? Finish review →
	</a>
</div>
```

### 5. Keyboard Shortcut

Add keyboard shortcut to jump to wrap-up:

```typescript
function handleKeydown(e: KeyboardEvent) {
	// Cmd/Ctrl + Enter to finish review
	if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
		e.preventDefault();
		window.location.href = `/app/sessions/${data.session.id}/wrap-up`;
	}
}

onMount(() => {
	window.addEventListener('keydown', handleKeydown);
	return () => window.removeEventListener('keydown', handleKeydown);
});
```

### 6. Add Tooltip with Shortcut Hint

Show keyboard shortcut in button tooltip:

```svelte
<a href="/app/sessions/{data.session.id}/wrap-up" title="Finish Review (⌘+Enter)" class="...">
	Finish Review
</a>
```

### 7. Add to Breadcrumb Navigation

Update the layout to include wrap-up in breadcrumbs:

```svelte
<nav class="mb-4 text-sm text-gray-500">
	<ol class="flex items-center gap-2">
		<li><a href="/app" class="hover:text-gray-700">Home</a></li>
		<li>/</li>
		<li><a href="/app/sessions/{sessionId}" class="hover:text-gray-700">Session</a></li>
		<li>/</li>
		<li class="text-gray-900">Step {stepNumber}</li>
		<li class="ml-auto">
			<a href="/app/sessions/{sessionId}/wrap-up" class="text-green-600 hover:text-green-800">
				Submit Review →
			</a>
		</li>
	</ol>
</nav>
```

## Files to Modify

- `src/routes/app/sessions/[sessionId]/+page.svelte` (add button)
- `src/routes/app/sessions/[sessionId]/steps/[stepId]/+page.svelte` (add FAB and dropdown)
- `src/routes/app/+layout.svelte` (optional breadcrumb)

## UI Considerations

- Button should be visible but not intrusive
- Green color to indicate positive "finish" action
- Consistent placement across all review pages
- Mobile-friendly floating button

## Accessibility

- All links should be keyboard accessible
- Include aria-labels for icon-only buttons
- Keyboard shortcut should be documented

## Testing

- Navigate to wrap-up from session page
- Navigate to wrap-up from any step page
- Test floating button visibility on scroll
- Test keyboard shortcut
- Test on mobile devices

## Dependencies

- None - UI navigation improvement
