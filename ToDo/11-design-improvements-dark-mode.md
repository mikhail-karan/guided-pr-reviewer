# Plan: Design Improvements and Dark Mode

## Overview

Modernize the UI design and add a dark mode option for better user experience, especially during long code review sessions.

## Current State

- Basic Tailwind CSS styling
- Light mode only
- Simple gray/blue color scheme
- Minimal visual polish
- No theming system

## Implementation Steps

### 1. Set Up Theming Infrastructure

Create `src/lib/stores/theme.ts`:

```typescript
import { writable } from 'svelte/store';
import { browser } from '$app/environment';

type Theme = 'light' | 'dark' | 'system';

function createThemeStore() {
	const defaultTheme: Theme = browser
		? (localStorage.getItem('theme') as Theme) || 'system'
		: 'system';

	const { subscribe, set, update } = writable<Theme>(defaultTheme);

	return {
		subscribe,
		setTheme: (theme: Theme) => {
			if (browser) {
				localStorage.setItem('theme', theme);
				applyTheme(theme);
			}
			set(theme);
		},
		toggle: () => {
			update((current) => {
				const next = current === 'dark' ? 'light' : 'dark';
				if (browser) {
					localStorage.setItem('theme', next);
					applyTheme(next);
				}
				return next;
			});
		}
	};
}

function applyTheme(theme: Theme) {
	const isDark =
		theme === 'dark' ||
		(theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

	document.documentElement.classList.toggle('dark', isDark);
}

export const theme = createThemeStore();
```

### 2. Update Tailwind Configuration

Update `tailwind.config.js`:

```javascript
export default {
	darkMode: 'class',
	theme: {
		extend: {
			colors: {
				// Custom color palette
				primary: {
					50: '#f0f9ff',
					100: '#e0f2fe',
					// ... full palette
					900: '#0c4a6e'
				},
				// Dark mode specific
				dark: {
					bg: '#0d1117',
					surface: '#161b22',
					border: '#30363d',
					text: '#c9d1d9',
					muted: '#8b949e'
				}
			},
			// Modern shadows
			boxShadow: {
				soft: '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
				glow: '0 0 15px rgba(59, 130, 246, 0.5)'
			}
		}
	}
};
```

### 3. Create CSS Custom Properties

Update `src/routes/layout.css`:

```css
@import 'tailwindcss';

:root {
	/* Light mode colors */
	--color-bg: #ffffff;
	--color-surface: #f9fafb;
	--color-surface-elevated: #ffffff;
	--color-border: #e5e7eb;
	--color-text: #111827;
	--color-text-muted: #6b7280;
	--color-primary: #3b82f6;
	--color-primary-hover: #2563eb;
	--color-success: #10b981;
	--color-warning: #f59e0b;
	--color-danger: #ef4444;

	/* Diff colors */
	--color-diff-add-bg: #dcfce7;
	--color-diff-add-border: #86efac;
	--color-diff-remove-bg: #fee2e2;
	--color-diff-remove-border: #fca5a5;
}

.dark {
	--color-bg: #0d1117;
	--color-surface: #161b22;
	--color-surface-elevated: #1c2128;
	--color-border: #30363d;
	--color-text: #c9d1d9;
	--color-text-muted: #8b949e;
	--color-primary: #58a6ff;
	--color-primary-hover: #79b8ff;
	--color-success: #3fb950;
	--color-warning: #d29922;
	--color-danger: #f85149;

	/* Diff colors - dark mode */
	--color-diff-add-bg: rgba(46, 160, 67, 0.15);
	--color-diff-add-border: #238636;
	--color-diff-remove-bg: rgba(248, 81, 73, 0.15);
	--color-diff-remove-border: #da3633;
}

/* Apply custom properties */
body {
	background-color: var(--color-bg);
	color: var(--color-text);
}
```

### 4. Create Theme Toggle Component

Create `src/lib/components/ThemeToggle.svelte`:

```svelte
<script lang="ts">
	import { theme } from '$lib/stores/theme';

	let currentTheme: string;
	theme.subscribe((t) => (currentTheme = t));
</script>

<button
	onclick={() => theme.toggle()}
	class="dark:hover:bg-dark-surface cursor-pointer rounded-lg p-2 transition-colors hover:bg-gray-100"
	aria-label="Toggle theme"
>
	{#if currentTheme === 'dark'}
		<svg class="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
			<path
				d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
			/>
		</svg>
	{:else}
		<svg class="h-5 w-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
			<path
				d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
			/>
		</svg>
	{/if}
</button>
```

### 5. Update Key Components for Dark Mode

#### Header/Navigation

```svelte
<header class="dark:bg-dark-surface dark:border-dark-border border-b border-gray-200 bg-white">
	<nav class="...">
		<!-- content -->
	</nav>
</header>
```

#### Cards

```svelte
<div
	class="dark:bg-dark-surface dark:border-dark-border shadow-soft rounded-xl border border-gray-200 bg-white"
>
	<!-- content -->
</div>
```

#### Buttons

```svelte
<button
	class="
  bg-primary-600 hover:bg-primary-700
  dark:bg-primary-500 dark:hover:bg-primary-400
  rounded-lg font-medium text-white
"
>
	Button
</button>
```

### 6. Modern UI Improvements

#### Rounded Corners & Shadows

```css
/* Softer, more modern card style */
.card {
	border-radius: 16px;
	box-shadow:
		0 4px 6px -1px rgba(0, 0, 0, 0.05),
		0 2px 4px -1px rgba(0, 0, 0, 0.03);
}

.card-elevated {
	box-shadow:
		0 10px 25px -5px rgba(0, 0, 0, 0.1),
		0 8px 10px -6px rgba(0, 0, 0, 0.05);
}
```

#### Glassmorphism Effects (Optional)

```css
.glass {
	background: rgba(255, 255, 255, 0.7);
	backdrop-filter: blur(10px);
	border: 1px solid rgba(255, 255, 255, 0.3);
}

.dark .glass {
	background: rgba(22, 27, 34, 0.8);
	border: 1px solid rgba(48, 54, 61, 0.5);
}
```

#### Improved Typography

```css
body {
	font-family:
		'Inter',
		-apple-system,
		BlinkMacSystemFont,
		sans-serif;
	font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
}

h1,
h2,
h3 {
	font-weight: 700;
	letter-spacing: -0.02em;
}
```

### 7. Update Diff Styling for Dark Mode

```css
/* Override diff2html styles for dark mode */
.dark :global(.d2h-file-header) {
	background: var(--color-surface-elevated);
	border-color: var(--color-border);
}

.dark :global(.d2h-code-line) {
	background: var(--color-surface);
	color: var(--color-text);
}

.dark :global(.d2h-ins) {
	background: var(--color-diff-add-bg);
	border-color: var(--color-diff-add-border);
}

.dark :global(.d2h-del) {
	background: var(--color-diff-remove-bg);
	border-color: var(--color-diff-remove-border);
}

.dark :global(.d2h-code-linenumber) {
	color: var(--color-text-muted);
	background: var(--color-surface);
}
```

### 8. Add Animations & Micro-interactions

```css
/* Subtle hover effects */
.interactive {
	transition:
		transform 0.15s ease,
		box-shadow 0.15s ease;
}

.interactive:hover {
	transform: translateY(-1px);
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

/* Button press effect */
button:active {
	transform: scale(0.98);
}

/* Smooth page transitions */
@keyframes fadeIn {
	from {
		opacity: 0;
		transform: translateY(4px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

.page-enter {
	animation: fadeIn 0.2s ease-out;
}
```

### 9. Color Code Syntax Highlighting for Dark Mode

Integrate with code highlighter component (TODO #1):

```typescript
// Use different Shiki themes based on mode
const codeTheme = isDark ? 'github-dark' : 'github-light';
```

### 10. Add Theme to User Preferences

Store theme preference in database for logged-in users:

```sql
ALTER TABLE user ADD COLUMN theme TEXT DEFAULT 'system';
```

## Files to Create/Modify

- `src/lib/stores/theme.ts` (new)
- `src/lib/components/ThemeToggle.svelte` (new)
- `tailwind.config.js` (update)
- `src/routes/layout.css` (major updates)
- `src/app.html` (add dark class script)
- All page components (add dark mode classes)

## Migration Strategy

1. Set up theming infrastructure first
2. Update layout.css with CSS custom properties
3. Add dark mode classes component by component
4. Test each component in both modes
5. Add theme toggle to UI
6. Test full application in both modes

## Testing

- Test all components in light mode
- Test all components in dark mode
- Test system preference detection
- Test theme persistence across sessions
- Test diff rendering in both modes
- Test code highlighting in both modes
- Test on different screen sizes

## Accessibility

- Ensure sufficient color contrast in both modes (WCAG AA minimum)
- Test with color blindness simulators
- Ensure focus states are visible in both modes

## Dependencies

- Depends on: TODO #1 (Code highlighter) for syntax highlighting themes
