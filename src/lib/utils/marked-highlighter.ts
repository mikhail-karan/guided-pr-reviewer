import { marked } from 'marked';
import { codeToHtml } from 'shiki';
import { getShikiTheme } from './shiki-theme';

/**
 * Configure marked with a custom code renderer that wraps code blocks
 * with data attributes for later highlighting
 */
marked.setOptions({
	breaks: true,
	gfm: true
});

// Store original code renderer
const originalCodeRenderer = marked.Renderer.prototype.code;

/**
 * Escape HTML to safely embed code in data attributes
 * Works in both browser and Node.js environments
 */
function escapeHtml(text: string): string {
	if (typeof document !== 'undefined') {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}
	// Fallback for SSR
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/**
 * Custom code renderer that wraps code blocks with data attributes
 * so they can be highlighted asynchronously
 */
marked.Renderer.prototype.code = function (code: string, language?: string) {
	// Generate a unique ID for this code block
	const id = `code-block-${Math.random().toString(36).substr(2, 9)}`;
	const lang = language || 'text';

	// Return a placeholder div that will be replaced with highlighted code
	// We use base64 encoding to safely store code in data attribute
	let encodedCode: string;
	if (typeof btoa !== 'undefined') {
		// Browser environment
		try {
			encodedCode = btoa(unescape(encodeURIComponent(code)));
		} catch {
			// Fallback if encoding fails
			encodedCode = btoa(code);
		}
	} else {
		// Node.js environment (SSR)
		encodedCode = Buffer.from(code, 'utf-8').toString('base64');
	}

	return `<div class="shiki-placeholder" data-shiki-id="${id}" data-shiki-lang="${lang}" data-shiki-code="${encodedCode}"></div>`;
};

/**
 * Process rendered markdown HTML to highlight code blocks
 * This should be called after rendering markdown, ideally in an effect or onMount
 * Only works in browser environment
 */
export async function highlightCodeBlocks(
	container: HTMLElement | string,
	theme?: string
): Promise<void> {
	if (!theme) {
		theme = getShikiTheme();
	}
	if (typeof document === 'undefined') return; // Skip in SSR

	const element =
		typeof container === 'string' ? (document.querySelector(container) as HTMLElement) : container;

	if (!element) {
		return;
	}

	const placeholders = element.querySelectorAll('.shiki-placeholder');

	for (const placeholder of Array.from(placeholders)) {
		const htmlElement = placeholder as HTMLElement;
		const encodedCode = htmlElement.getAttribute('data-shiki-code');
		const lang = htmlElement.getAttribute('data-shiki-lang') || 'text';

		if (!encodedCode) continue;

		try {
			// Decode base64 (matching the encoding: btoa(unescape(encodeURIComponent(code))))
			let code: string;
			if (typeof atob !== 'undefined') {
				try {
					code = decodeURIComponent(unescape(atob(encodedCode)));
				} catch {
					// Fallback if decoding fails
					code = atob(encodedCode);
				}
			} else {
				code = Buffer.from(encodedCode, 'base64').toString('utf-8');
			}

			const highlighted = await codeToHtml(code, {
				lang: lang,
				theme: theme
			});

			// Replace placeholder with highlighted code
			htmlElement.outerHTML = highlighted;
		} catch (err) {
			console.error('Failed to highlight code block:', err);
			// Fallback to plain code block
			try {
				let code: string;
				if (typeof atob !== 'undefined') {
					try {
						code = decodeURIComponent(unescape(atob(encodedCode)));
					} catch {
						code = atob(encodedCode);
					}
				} else {
					code = Buffer.from(encodedCode, 'base64').toString('utf-8');
				}
				htmlElement.outerHTML = `<pre><code>${escapeHtml(code)}</code></pre>`;
			} catch {
				htmlElement.outerHTML = '<pre><code>Error rendering code</code></pre>';
			}
		}
	}
}

/**
 * Parse markdown and return HTML with code block placeholders
 * Use highlightCodeBlocks() to process the placeholders
 */
export function parseMarkdown(markdown: string): string {
	return marked.parse(markdown) as string;
}
