/**
 * Get the appropriate Shiki theme based on the current color mode
 * @returns Shiki theme name
 */
export function getShikiTheme(): string {
	if (typeof document === 'undefined') {
		// SSR - default to high contrast light theme for better visibility
		return 'github-light';
	}

	// Check for dark mode class on html or body
	// This will be updated when dark mode is implemented
	const isDark = document.documentElement.classList.contains('dark') ||
		document.body.classList.contains('dark') ||
		window.matchMedia('(prefers-color-scheme: dark)').matches;

	return isDark ? 'github-dark' : 'github-light';
}

/**
 * Get both light and dark themes for theme switching support
 * @returns Object with light and dark theme names
 */
export function getShikiThemes() {
	return {
		light: 'github-light',
		dark: 'github-dark'
	};
}
