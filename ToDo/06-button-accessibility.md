# Plan: Button Accessibility Improvements

## Overview

Ensure all buttons have proper `cursor: pointer` styling and include appropriate accessibility attributes throughout the application.

## Current State

- Some buttons lack `cursor-pointer` class
- Inconsistent accessibility attributes across components
- Some interactive elements use `<div>` or `<span>` instead of `<button>`
- Missing or incomplete `aria-*` attributes

## Implementation Steps

### 1. Audit All Interactive Elements

Search for all clickable elements in the codebase:

```bash
# Find all onclick handlers
rg "onclick=" src/routes --include "*.svelte"

# Find all button elements
rg "<button" src/routes --include "*.svelte"

# Find divs/spans with click handlers (potential issues)
rg "(div|span).*onclick" src/routes --include "*.svelte"
```

### 2. Create Button Component

Create `src/lib/components/Button.svelte`:

```svelte
<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';

	interface $$Props extends HTMLButtonAttributes {
		variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
		size?: 'sm' | 'md' | 'lg';
		loading?: boolean;
	}

	export let variant: $$Props['variant'] = 'primary';
	export let size: $$Props['size'] = 'md';
	export let loading: $$Props['loading'] = false;
	export let disabled: boolean = false;
</script>

<button
	class="btn btn-{variant} btn-{size} cursor-pointer"
	class:loading
	disabled={disabled || loading}
	aria-busy={loading}
	{...$$restProps}
>
	{#if loading}
		<span class="spinner" aria-hidden="true"></span>
	{/if}
	<slot />
</button>

<style>
	.btn {
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.btn:focus-visible {
		outline: 2px solid var(--focus-ring-color, #3b82f6);
		outline-offset: 2px;
	}
</style>
```

### 3. Create IconButton Component

For icon-only buttons:

```svelte
<script lang="ts">
	export let label: string; // Required for accessibility
	export let icon: string;
</script>

<button class="icon-btn cursor-pointer" aria-label={label} title={label} {...$$restProps}>
	<slot />
</button>
```

### 4. Global CSS Updates

Add to `src/routes/layout.css`:

```css
/* Ensure all buttons and clickable elements have pointer cursor */
button,
[role='button'],
[type='button'],
[type='submit'],
[type='reset'],
a[href],
input[type='checkbox'],
input[type='radio'],
select,
.clickable {
	cursor: pointer;
}

/* Focus visible styles for accessibility */
:focus-visible {
	outline: 2px solid #3b82f6;
	outline-offset: 2px;
}

/* Disabled state */
button:disabled,
[aria-disabled='true'] {
	cursor: not-allowed;
	opacity: 0.5;
}
```

### 5. Fix Specific Components

#### Sidebar Tab Buttons (`steps/[stepId]/+page.svelte`)

```svelte
<!-- Before -->
<button
  class="flex-1 py-3 text-sm font-medium border-b-2 transition-colors"
  onclick={() => activeTab = 'guidance'}
>

<!-- After -->
<button
  class="flex-1 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer"
  onclick={() => activeTab = 'guidance'}
  aria-selected={activeTab === 'guidance'}
  role="tab"
>
```

#### Navigation Buttons

```svelte
<!-- Before -->
<a href="..." class="p-1.5 hover:bg-white rounded-md">

<!-- After -->
<a
  href="..."
  class="p-1.5 hover:bg-white rounded-md cursor-pointer"
  aria-label="Previous Step"
>
```

#### Resize Handles

```svelte
<!-- Before -->
<div class="diff-resizer-handle" onmousedown={startResizingDiff}></div>

<!-- After -->
<div
	class="diff-resizer-handle"
	role="separator"
	aria-orientation="vertical"
	aria-label="Resize diff panels"
	tabindex="0"
	onmousedown={startResizingDiff}
	onkeydown={handleResizeKeydown}
></div>
```

### 6. Accessibility Checklist per Component

For each button, verify:

- [ ] Has `cursor-pointer` (or inherited from CSS)
- [ ] Has `aria-label` if icon-only
- [ ] Has `disabled` state handling
- [ ] Has visible focus indicator
- [ ] Has appropriate `role` if not a `<button>`
- [ ] Has `title` for tooltip (optional but helpful)
- [ ] Can be activated via keyboard (Enter/Space)

### 7. Add Skip Links

Add skip-to-content link for keyboard users:

```svelte
<!-- In +layout.svelte or app.html -->
<a href="#main-content" class="skip-link"> Skip to main content </a>

<style>
	.skip-link {
		position: absolute;
		top: -40px;
		left: 0;
		padding: 8px;
		background: white;
		z-index: 100;
	}

	.skip-link:focus {
		top: 0;
	}
</style>
```

### 8. ARIA Live Regions

Add for dynamic content updates:

```svelte
<!-- For status messages -->
<div role="status" aria-live="polite" class="sr-only">
	{statusMessage}
</div>
```

## Files to Modify

- `src/lib/components/Button.svelte` (new)
- `src/lib/components/IconButton.svelte` (new)
- `src/routes/layout.css` (global styles)
- `src/routes/app/sessions/[sessionId]/+page.svelte`
- `src/routes/app/sessions/[sessionId]/steps/[stepId]/+page.svelte`
- `src/routes/app/sessions/[sessionId]/wrap-up/+page.svelte`
- `src/routes/app/repos/[installationId]/+page.svelte`
- `src/routes/app/+page.svelte`

## Testing

- Tab through all interactive elements
- Verify Enter/Space activates buttons
- Test with screen reader (VoiceOver, NVDA)
- Check color contrast ratios
- Verify focus indicators are visible
- Test disabled states

## Accessibility Tools

Use these tools for validation:

- axe DevTools browser extension
- Lighthouse accessibility audit
- WAVE browser extension

## Dependencies

- None - can be done incrementally
