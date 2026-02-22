import { codeToHtml } from 'shiki';
import { detectLanguage } from './language-detection';
import { getShikiTheme } from './shiki-theme';

/**
 * Highlight code lines in a diff2html rendered diff
 * @param container - The container element with the rendered diff
 * @param filePath - The file path to detect language from
 * @param theme - Shiki theme to use
 */
export async function highlightDiffCodeLines(
	container: HTMLElement,
	filePath: string,
	theme?: string
): Promise<void> {
	if (!theme) {
		theme = getShikiTheme();
	}
	if (typeof document === 'undefined') return; // Skip in SSR

	const language = detectLanguage(filePath);

	// Find all code line containers - diff2html uses .d2h-code-line-ctn for the actual code content
	const codeLineContainers = container.querySelectorAll('.d2h-code-line-ctn');

	if (codeLineContainers.length === 0) {
		// Fallback: try finding code lines directly
		const codeLines = container.querySelectorAll('.d2h-code-line');
		await highlightCodeLinesDirect(codeLines, language, theme);
		return;
	}

	// Process lines in batches to avoid blocking the UI
	const batchSize = 20;
	const containersArray = Array.from(codeLineContainers);

	for (let i = 0; i < containersArray.length; i += batchSize) {
		const batch = containersArray.slice(i, i + batchSize);

		await Promise.all(
			batch.map(async (codeCell) => {
				const codeText = codeCell.textContent || '';
				if (!codeText.trim()) return;

				try {
					// Highlight the code
					const highlighted = await codeToHtml(codeText, {
						lang: language,
						theme: theme
					});

					// Extract the code content from Shiki's output
					const tempDiv = document.createElement('div');
					tempDiv.innerHTML = highlighted;
					const codeElement = tempDiv.querySelector('code');
					if (!codeElement) return;

					// Get the inner HTML with syntax highlighting tokens
					// Shiki wraps content in <span class="line">, we want to preserve that structure
					let highlightedContent = codeElement.innerHTML;

					// If Shiki wrapped in a <span class="line">, extract just the inner spans
					const lineSpan = codeElement.querySelector('span.line');
					if (lineSpan) {
						highlightedContent = lineSpan.innerHTML;
					}

					// Replace the code cell content with highlighted version
					// Preserve any existing classes or attributes
					codeCell.innerHTML = highlightedContent;

					// Add shiki class for styling
					codeCell.classList.add('shiki-highlighted');

					// Copy styles from Shiki's pre element to maintain colors
					const preElement = tempDiv.querySelector('pre');
					if (preElement) {
						// Apply background color if present
						const bgColor = window.getComputedStyle(preElement).backgroundColor;
						if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
							codeCell.style.backgroundColor = bgColor;
						}
					}
				} catch (err) {
					console.error('Failed to highlight diff line:', err);
					// Keep original content on error
				}
			})
		);
	}
}

/**
 * Fallback method for highlighting code lines directly
 */
async function highlightCodeLinesDirect(
	codeLines: NodeListOf<Element>,
	language: string,
	theme: string
): Promise<void> {
	const batchSize = 20;
	const linesArray = Array.from(codeLines);

	for (let i = 0; i < linesArray.length; i += batchSize) {
		const batch = linesArray.slice(i, i + batchSize);

		await Promise.all(
			batch.map(async (lineElement) => {
				const codeText = lineElement.textContent || '';
				if (!codeText.trim()) return;

				try {
					const highlighted = await codeToHtml(codeText, {
						lang: language,
						theme: theme
					});

					const tempDiv = document.createElement('div');
					tempDiv.innerHTML = highlighted;
					const codeElement = tempDiv.querySelector('code');
					if (!codeElement) return;

					// Find the code content cell within this line
					const codeCell = lineElement.querySelector('.d2h-code-line-ctn') || lineElement;
					codeCell.innerHTML = codeElement.innerHTML;
					codeCell.classList.add('shiki-highlighted');
				} catch (err) {
					console.error('Failed to highlight diff line:', err);
				}
			})
		);
	}
}

/**
 * Highlight all code in a diff container for multiple files
 * @param container - The diff container element
 * @param hunks - Array of diff hunks with path information
 * @param theme - Shiki theme to use
 */
export async function highlightDiffContainer(
	container: HTMLElement,
	hunks: Array<{ path: string }>,
	theme?: string
): Promise<void> {
	if (!theme) {
		theme = getShikiTheme();
	}
	if (typeof document === 'undefined') return; // Skip in SSR

	// Group code lines by file path
	const fileDiffs = container.querySelectorAll('.d2h-file-wrapper');

	for (const fileDiff of Array.from(fileDiffs)) {
		// Find the file path from the diff header or use the first hunk's path
		const fileHeader = fileDiff.querySelector('.d2h-file-name');
		const filePath = fileHeader?.textContent?.trim() || hunks[0]?.path || '';

		if (!filePath) continue;

		// Extract actual file path (remove "a/" or "b/" prefix if present)
		const cleanPath = filePath.replace(/^[ab]\//, '').trim();

		await highlightDiffCodeLines(fileDiff as HTMLElement, cleanPath, theme);
	}
}
