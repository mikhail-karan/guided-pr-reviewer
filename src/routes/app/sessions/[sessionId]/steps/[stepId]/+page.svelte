<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import * as Diff2Html from 'diff2html';
	import 'diff2html/bundles/css/diff2html.min.css';
	import { marked } from 'marked';
	import { safeParse } from '$lib/utils';
	import CodeHighlighter from '$lib/components/CodeHighlighter.svelte';
	import { detectLanguage } from '$lib/utils/language-detection';
	import { parseMarkdown, highlightCodeBlocks } from '$lib/utils/marked-highlighter';
	import { highlightDiffContainer } from '$lib/utils/diff-highlighter';
	import { getShikiTheme } from '$lib/utils/shiki-theme';
	import type { PageData } from './$types';
	import type { DraftComment } from '$lib/server/db/schema';

	let { data }: { data: PageData } = $props();

	let notes = $state(data.notes);
	let draftComments = $state(data.draftComments);
	let chatMessages = $state((data as any).chatMessages || []);

	let diffContainer: HTMLElement;
	let activeTab = $state('guidance');
	let sidebarWidth = $state(400);
	let isResizing = $state(false);
	let diffSplitPercent = $state(50);
	let isResizingDiff = $state(false);
	let showAiExplanations = $state(true);
	let guidanceExpanded = $state(true);
	let chatExpanded = $state(true);
	let chatInput = $state('');
	let isStreaming = $state(false);
	let streamingMessageId = $state<string | null>(null);
	let chatContainer = $state<HTMLElement | null>(null);
	let chatError = $state<string | null>(null);

	// Inline comment state
	interface LineInfo {
		path: string;
		line: number;
		startLine: number | null;
		side: 'LEFT' | 'RIGHT';
		rowElement: HTMLElement;
	}
	let activeInlineComment = $state<LineInfo | null>(null);
	let inlineCommentFormContainer = $state<HTMLElement | null>(null);
	let selectionStartLine = $state<{ line: number; side: 'LEFT' | 'RIGHT'; path: string } | null>(
		null
	);

	// Get inline comments grouped by path and line
	let inlineComments = $derived(
		(draftComments as DraftComment[]).filter((c) => c.targetType === 'inline' && c.path && c.line)
	);

	function getCommentsForLine(path: string, line: number, side: string): DraftComment[] {
		return inlineComments.filter((c) => c.path === path && c.line === line && c.side === side);
	}

	function startResizing(e: MouseEvent) {
		isResizing = true;
		e.preventDefault();
	}

	function startResizingDiff(e: MouseEvent) {
		isResizingDiff = true;
		e.preventDefault();
	}

	function handleMouseMove(e: MouseEvent) {
		if (isResizing) {
			const newWidth = window.innerWidth - e.clientX;
			if (newWidth > 300 && newWidth < 800) {
				sidebarWidth = newWidth;
			}
		} else if (isResizingDiff) {
			const rect = diffContainer.getBoundingClientRect();
			const offsetX = e.clientX - rect.left;
			const newPercent = (offsetX / rect.width) * 100;
			if (newPercent > 20 && newPercent < 80) {
				diffSplitPercent = newPercent;
			}
		}
	}

	function stopResizing() {
		isResizing = false;
		isResizingDiff = false;
	}

	onMount(() => {
		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', stopResizing);
		return () => {
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('mouseup', stopResizing);
		};
	});

	$effect(() => {
		const diffHunks = safeParse<any[]>(data.step.diffHunksJson, []);
		const diffString = diffHunks
			.map((h: any) => {
				return `--- a/${h.path}\n+++ b/${h.path}\n${h.patch}`;
			})
			.join('\n');

		const html = Diff2Html.html(diffString, {
			drawFileList: false,
			matching: 'lines',
			outputFormat: 'side-by-side'
		});

		if (diffContainer) {
			// Remove any existing AI explanation blocks first to prevent duplicates
			diffContainer.querySelectorAll('.ai-explanation-block').forEach((el) => el.remove());

			diffContainer.innerHTML = html;

			// Inject resize handles between side-by-side diffs
			const diffs = diffContainer.querySelectorAll('.d2h-files-diff');
			diffs.forEach((diff) => {
				const sides = diff.querySelectorAll('.d2h-file-side-diff');
				if (sides.length === 2) {
					const handle = document.createElement('div');
					handle.className = 'diff-resizer-handle';
					handle.addEventListener('mousedown', startResizingDiff);
					sides[0].after(handle);
				}
			});

			// Highlight code in the diff using Shiki (uses light theme by default)
			setTimeout(async () => {
				try {
					await highlightDiffContainer(diffContainer, diffHunks);
				} catch (err) {
					console.error('Failed to highlight diff code:', err);
				}
			}, 50);

			// Inject AI explanation blocks after each hunk if enabled
			// Use setTimeout to ensure DOM is fully rendered
			if (showAiExplanations && aiInlineExplanations.length > 0) {
				setTimeout(() => {
					injectAiExplanations(diffContainer, diffHunks, aiInlineExplanations);
				}, 100);
			}

			// Add inline comment click handlers to diff lines
			setTimeout(() => {
				addLineClickHandlers(diffContainer, diffHunks);
				injectExistingInlineComments(diffContainer, diffHunks);
			}, 150);
		}
	});

	// Extract line information from a diff row element
	function extractLineInfo(
		row: HTMLElement,
		hunks: any[],
		side: 'LEFT' | 'RIGHT'
	): LineInfo | null {
		// Find the line number cell
		const lineNumCell = row.querySelector('.d2h-code-side-linenumber');
		if (!lineNumCell) return null;

		const lineNumText = lineNumCell.textContent?.trim();
		if (!lineNumText || lineNumText === '') return null;

		const lineNum = parseInt(lineNumText, 10);
		if (isNaN(lineNum)) return null;

		// Find the file path - traverse up to find file wrapper and get the path
		let fileWrapper = row.closest('.d2h-file-wrapper');
		if (!fileWrapper) return null;

		const fileHeader = fileWrapper.querySelector('.d2h-file-name');
		let path = fileHeader?.textContent?.trim() || '';

		// diff2html sometimes shows paths like "a/path/to/file" or "b/path/to/file"
		// Remove the a/ or b/ prefix if present
		if (path.startsWith('a/') || path.startsWith('b/')) {
			path = path.substring(2);
		}

		// Also try to get path from hunks if header is not helpful
		if (!path && hunks.length > 0) {
			path = hunks[0].path;
		}

		return {
			path,
			line: lineNum,
			startLine: null,
			side,
			rowElement: row
		};
	}

	// Highlight specific lines in the diff viewer (used for risk hover)
	function highlightDiffLines(lines: Array<{ path: string; startLine: number; endLine: number }>) {
		if (!diffContainer || !lines || lines.length === 0) return;

		const fileWrappers = diffContainer.querySelectorAll('.d2h-file-wrapper');

		for (const lineRef of lines) {
			for (const fileWrapper of Array.from(fileWrappers)) {
				const fileHeader = fileWrapper.querySelector('.d2h-file-name');
				let filePath = fileHeader?.textContent?.trim() || '';
				if (filePath.startsWith('a/') || filePath.startsWith('b/')) {
					filePath = filePath.substring(2);
				}

				if (filePath !== lineRef.path) continue;

				// Search both sides of the side-by-side diff (right side = new file lines)
				const sideDiffs = fileWrapper.querySelectorAll('.d2h-file-side-diff');
				sideDiffs.forEach((sideDiff) => {
					const rows = sideDiff.querySelectorAll('tr');
					rows.forEach((row) => {
						const lineNumCell = row.querySelector('.d2h-code-side-linenumber');
						if (!lineNumCell) return;

						const lineNumText = lineNumCell.textContent?.trim();
						if (!lineNumText) return;

						const lineNum = parseInt(lineNumText, 10);
						if (isNaN(lineNum)) return;

						if (lineNum >= lineRef.startLine && lineNum <= lineRef.endLine) {
							row.classList.add('risk-highlight');
						}
					});
				});
			}
		}
	}

	// Scroll the diff viewer to the first highlighted risk line (right side)
	function scrollToRiskLines(lines: Array<{ path: string; startLine: number; endLine: number }>) {
		if (!diffContainer || !lines || lines.length === 0) return;

		const lineRef = lines[0];
		const fileWrappers = diffContainer.querySelectorAll('.d2h-file-wrapper');

		for (const fileWrapper of Array.from(fileWrappers)) {
			const fileHeader = fileWrapper.querySelector('.d2h-file-name');
			let filePath = fileHeader?.textContent?.trim() || '';
			if (filePath.startsWith('a/') || filePath.startsWith('b/')) {
				filePath = filePath.substring(2);
			}
			if (filePath !== lineRef.path) continue;

			// Target the right side (new file) of the side-by-side diff
			const sideDiffs = fileWrapper.querySelectorAll('.d2h-file-side-diff');
			const rightSide = sideDiffs.length >= 2 ? sideDiffs[1] : sideDiffs[0];
			if (!rightSide) continue;

			const rows = rightSide.querySelectorAll('tr');
			for (const row of Array.from(rows)) {
				const lineNumCell = row.querySelector('.d2h-code-side-linenumber');
				if (!lineNumCell) continue;
				const lineNum = parseInt(lineNumCell.textContent?.trim() || '', 10);
				if (isNaN(lineNum)) continue;

				if (lineNum >= lineRef.startLine && lineNum <= lineRef.endLine) {
					row.scrollIntoView({ behavior: 'smooth', block: 'center' });
					return;
				}
			}
		}
	}

	// Remove all risk highlight classes from the diff viewer
	function clearDiffHighlights() {
		if (!diffContainer) return;
		diffContainer.querySelectorAll('.risk-highlight').forEach((el) => {
			el.classList.remove('risk-highlight');
		});
	}

	// Add click handlers to diff line numbers
	function addLineClickHandlers(container: HTMLElement, hunks: any[]) {
		const sideDiffs = container.querySelectorAll('.d2h-file-side-diff');

		sideDiffs.forEach((sideDiff, index) => {
			const side: 'LEFT' | 'RIGHT' = index === 0 ? 'LEFT' : 'RIGHT';
			const rows = sideDiff.querySelectorAll('tr');

			rows.forEach((row) => {
				const lineNumCell = row.querySelector('.d2h-code-side-linenumber');
				if (!lineNumCell) return;

				const lineNumText = lineNumCell.textContent?.trim();
				if (!lineNumText || lineNumText === '') return;

				// Add click handler
				lineNumCell.addEventListener('click', (e: Event) => {
					e.stopPropagation();
					const mouseEvent = e as MouseEvent;
					const lineInfo = extractLineInfo(row as HTMLElement, hunks, side);
					if (lineInfo) {
						// Handle shift+click for multi-line selection
						if (
							mouseEvent.shiftKey &&
							selectionStartLine &&
							selectionStartLine.side === side &&
							selectionStartLine.path === lineInfo.path
						) {
							const startLine = Math.min(selectionStartLine.line, lineInfo.line);
							const endLine = Math.max(selectionStartLine.line, lineInfo.line);
							openInlineCommentForm({
								...lineInfo,
								line: endLine,
								startLine: startLine !== endLine ? startLine : null
							});
							selectionStartLine = null;
						} else {
							selectionStartLine = { line: lineInfo.line, side, path: lineInfo.path };
							openInlineCommentForm(lineInfo);
						}
					}
				});

				// Add hover visual indicator
				lineNumCell.classList.add('inline-comment-trigger');

				// Check if this line has existing comments
				const lineInfo = extractLineInfo(row as HTMLElement, hunks, side);
				if (lineInfo) {
					const existingComments = getCommentsForLine(lineInfo.path, lineInfo.line, side);
					if (existingComments.length > 0) {
						lineNumCell.classList.add('has-comments');
						const badge = document.createElement('span');
						badge.className = 'comment-count-badge';
						badge.textContent = existingComments.length.toString();
						lineNumCell.appendChild(badge);
					}
				}
			});
		});
	}

	// Open inline comment form at the specified line
	function openInlineCommentForm(lineInfo: LineInfo) {
		// Close any existing form first
		closeInlineCommentForm();

		activeInlineComment = lineInfo;

		// Create a container for the form and insert it after the row
		const formRow = document.createElement('tr');
		formRow.className = 'inline-comment-form-row';

		const formCell = document.createElement('td');
		formCell.colSpan = 2;
		formCell.className = 'inline-comment-form-cell';

		const lineRangeText =
			lineInfo.startLine && lineInfo.startLine !== lineInfo.line
				? `Lines ${lineInfo.startLine}-${lineInfo.line}`
				: `Line ${lineInfo.line}`;

		formCell.innerHTML = `
			<div class="inline-comment-form">
				<div class="form-header">
					<span class="location-badge">
						${lineRangeText}
						<span class="side-badge">${lineInfo.side}</span>
					</span>
					<button type="button" class="close-btn" aria-label="Close">
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
						</svg>
					</button>
				</div>
				<textarea
					class="comment-textarea"
					placeholder="Leave a comment..."
					rows="3"
				></textarea>
				<div class="form-footer">
					<span class="hint">
						<kbd>Cmd</kbd>+<kbd>Enter</kbd> to submit, <kbd>Esc</kbd> to cancel
					</span>
					<div class="form-actions">
						<button type="button" class="btn-cancel">Cancel</button>
						<button type="button" class="btn-submit" disabled>Add comment</button>
					</div>
				</div>
			</div>
		`;

		// Add event listeners
		const closeBtn = formCell.querySelector('.close-btn');
		const cancelBtn = formCell.querySelector('.btn-cancel');
		const submitBtn = formCell.querySelector('.btn-submit') as HTMLButtonElement;
		const textarea = formCell.querySelector('.comment-textarea') as HTMLTextAreaElement;

		closeBtn?.addEventListener('click', closeInlineCommentForm);
		cancelBtn?.addEventListener('click', closeInlineCommentForm);

		textarea?.addEventListener('input', () => {
			submitBtn.disabled = !textarea.value.trim();
		});

		textarea?.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') {
				closeInlineCommentForm();
			} else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				if (textarea.value.trim()) {
					submitInlineComment(lineInfo, textarea.value.trim());
				}
			}
		});

		submitBtn?.addEventListener('click', () => {
			if (textarea.value.trim()) {
				submitInlineComment(lineInfo, textarea.value.trim());
			}
		});

		formRow.appendChild(formCell);
		lineInfo.rowElement.after(formRow);

		inlineCommentFormContainer = formCell;

		// Focus the textarea
		setTimeout(() => textarea?.focus(), 50);
	}

	// Submit an inline comment
	async function submitInlineComment(lineInfo: LineInfo, content: string) {
		const submitBtn = inlineCommentFormContainer?.querySelector('.btn-submit') as HTMLButtonElement;
		const textarea = inlineCommentFormContainer?.querySelector(
			'.comment-textarea'
		) as HTMLTextAreaElement;

		if (submitBtn) {
			submitBtn.disabled = true;
			submitBtn.textContent = 'Adding...';
		}

		try {
			const res = await fetch(`/api/steps/${data.step.id}/draft-comments`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					targetType: 'inline',
					bodyMarkdown: content,
					path: lineInfo.path,
					side: lineInfo.side,
					line: lineInfo.line,
					startLine: lineInfo.startLine
				})
			});

			if (res.ok) {
				const newComment = await res.json();
				draftComments = [...draftComments, newComment];
				closeInlineCommentForm();

				// Refresh comment indicators
				refreshCommentIndicators();
			} else {
				console.error('Failed to submit comment');
				if (submitBtn) {
					submitBtn.disabled = false;
					submitBtn.textContent = 'Add comment';
				}
			}
		} catch (err) {
			console.error('Error submitting comment:', err);
			if (submitBtn) {
				submitBtn.disabled = false;
				submitBtn.textContent = 'Add comment';
			}
		}
	}

	// Refresh comment indicators after adding a new comment
	function refreshCommentIndicators() {
		const diffHunks = safeParse<any[]>(data.step.diffHunksJson, []);
		if (!diffContainer) return;

		const sideDiffs = diffContainer.querySelectorAll('.d2h-file-side-diff');
		sideDiffs.forEach((sideDiff, index) => {
			const side = index === 0 ? 'LEFT' : 'RIGHT';
			const rows = sideDiff.querySelectorAll(
				'tr:not(.inline-comment-form-row):not(.inline-comment-thread-row)'
			);

			rows.forEach((row) => {
				const lineNumCell = row.querySelector('.d2h-code-side-linenumber');
				if (!lineNumCell) return;

				const lineInfo = extractLineInfo(row as HTMLElement, diffHunks, side as 'LEFT' | 'RIGHT');
				if (!lineInfo) return;

				const existingComments = getCommentsForLine(lineInfo.path, lineInfo.line, side);
				const existingBadge = lineNumCell.querySelector('.comment-count-badge');

				if (existingComments.length > 0) {
					lineNumCell.classList.add('has-comments');
					if (existingBadge) {
						existingBadge.textContent = existingComments.length.toString();
					} else {
						const badge = document.createElement('span');
						badge.className = 'comment-count-badge';
						badge.textContent = existingComments.length.toString();
						lineNumCell.appendChild(badge);
					}
				} else {
					lineNumCell.classList.remove('has-comments');
					existingBadge?.remove();
				}
			});
		});

		// Re-inject comment threads
		injectExistingInlineComments(diffContainer, diffHunks);
	}

	// Close the inline comment form
	function closeInlineCommentForm() {
		if (inlineCommentFormContainer) {
			const formRow = inlineCommentFormContainer.closest('tr');
			if (formRow) {
				formRow.remove();
			}
		}
		activeInlineComment = null;
		inlineCommentFormContainer = null;
	}

	// Inject existing inline comments into the diff view
	function injectExistingInlineComments(container: HTMLElement, hunks: any[]) {
		// Group comments by path, line, and side
		const commentGroups = new Map<string, DraftComment[]>();

		inlineComments.forEach((comment) => {
			const key = `${comment.path}:${comment.line}:${comment.side}`;
			if (!commentGroups.has(key)) {
				commentGroups.set(key, []);
			}
			commentGroups.get(key)!.push(comment);
		});

		if (commentGroups.size === 0) return;

		const sideDiffs = container.querySelectorAll('.d2h-file-side-diff');

		sideDiffs.forEach((sideDiff, index) => {
			const side = index === 0 ? 'LEFT' : 'RIGHT';
			const rows = sideDiff.querySelectorAll('tr');

			rows.forEach((row) => {
				const lineInfo = extractLineInfo(row as HTMLElement, hunks, side as 'LEFT' | 'RIGHT');
				if (!lineInfo) return;

				const key = `${lineInfo.path}:${lineInfo.line}:${side}`;
				const comments = commentGroups.get(key);

				if (comments && comments.length > 0) {
					// Check if thread row already exists
					const nextRow = row.nextElementSibling;
					if (nextRow?.classList.contains('inline-comment-thread-row')) return;

					// Create a row for the comment thread
					const threadRow = document.createElement('tr');
					threadRow.className = 'inline-comment-thread-row';

					const threadCell = document.createElement('td');
					threadCell.colSpan = 2;
					threadCell.className = 'inline-comment-thread-cell';

					// Create a simple thread display
					const threadDiv = document.createElement('div');
					threadDiv.className = 'inline-thread-container';
					threadDiv.innerHTML = `
						<div class="inline-thread-header">
							<svg class="thread-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"/>
							</svg>
							<span>${comments.length} comment${comments.length !== 1 ? 's' : ''}</span>
						</div>
						<div class="inline-thread-comments">
							${comments
								.map(
									(c) => `
								<div class="inline-thread-comment">
									<span class="comment-status status-${c.status}">${c.status}</span>
									<div class="comment-body">${c.bodyMarkdown}</div>
								</div>
							`
								)
								.join('')}
						</div>
					`;

					threadCell.appendChild(threadDiv);
					threadRow.appendChild(threadCell);
					row.after(threadRow);
				}
			});
		});
	}

	function injectAiExplanations(
		container: HTMLElement,
		hunks: any[],
		explanations: Array<{ hunkIndex: number; path: string; lineRange: string; explanation: string }>
	) {
		if (explanations.length === 0) {
			console.log('No AI explanations to inject');
			return;
		}

		// Remove any existing explanations to prevent duplicates
		container.querySelectorAll('.ai-explanation-row').forEach((el) => el.remove());
		container.querySelectorAll('.ai-explanation-block').forEach((el) => el.remove());

		console.log(`Injecting ${explanations.length} AI explanations`);

		// Detect if we're in side-by-side mode first
		const sideDiffs = container.querySelectorAll('.d2h-file-side-diff');
		const isSideBySide = sideDiffs.length === 2;

		console.log(`Side-by-side mode: ${isSideBySide}, found ${sideDiffs.length} side diffs`);

		// In side-by-side mode, we need to inject into the RIGHT-side table specifically
		// diff2html creates two separate tables, but hunk header text (@@ ... @@) only shows on left
		let hunkHeaders: Element[] = [];

		if (isSideBySide) {
			// Get the right-side container (second .d2h-file-side-diff)
			const rightSideContainer = sideDiffs[1] as HTMLElement;

			// Look for .d2h-info rows in the right side - these are the hunk separator rows
			const infoRows = rightSideContainer.querySelectorAll('tr.d2h-info, tr');
			hunkHeaders = Array.from(infoRows).filter((row) => {
				// d2h-info class is used for hunk headers
				if (row.classList.contains('d2h-info')) return true;
				// Also check for empty info cells that mark hunk boundaries
				const cells = row.querySelectorAll('td');
				return (
					cells.length > 0 &&
					Array.from(cells).some(
						(cell) => cell.classList.contains('d2h-info') || (cell.textContent || '').includes('@@')
					)
				);
			});

			console.log(`Found ${hunkHeaders.length} hunk info rows in right-side table`);

			// If still no luck, try finding rows at the same index as left-side hunk headers
			if (hunkHeaders.length === 0) {
				const leftSideContainer = sideDiffs[0] as HTMLElement;
				const leftHunkRows = Array.from(leftSideContainer.querySelectorAll('tr')).filter((row) => {
					const text = row.textContent || '';
					return /@@\s+-\d+/.test(text);
				});

				console.log(`Found ${leftHunkRows.length} hunk headers in left-side table`);

				// For each left hunk row, find the corresponding row in the right table
				const rightTable = rightSideContainer.querySelector('table');
				const leftTable = leftSideContainer.querySelector('table');

				if (rightTable && leftTable) {
					const rightRows = rightTable.querySelectorAll('tr');
					const leftRows = leftTable.querySelectorAll('tr');

					leftHunkRows.forEach((leftRow) => {
						const leftIndex = Array.from(leftRows).indexOf(leftRow);
						if (leftIndex >= 0 && leftIndex < rightRows.length) {
							hunkHeaders.push(rightRows[leftIndex]);
							console.log(`Mapped left hunk row index ${leftIndex} to right table`);
						}
					});
				}
			}
		} else {
			// Non-side-by-side mode: find hunk headers normally
			const allRows = container.querySelectorAll('tr');
			hunkHeaders = Array.from(allRows).filter((row) => {
				const text = row.textContent || '';
				return /@@\s+-\d+/.test(text);
			});
		}

		console.log(`Final hunk headers count: ${hunkHeaders.length}`);

		if (hunkHeaders.length === 0) {
			console.warn('Could not find hunk headers, using fallback insertion');
			// Fallback: Find the first actual code line (not the header) and insert before it
			const firstCodeLine = container.querySelector(
				'.d2h-code-line, .d2h-code-line-ctn, tr.d2h-code-line'
			);
			if (firstCodeLine) {
				const explanation = explanations[0]; // Use first explanation
				const explanationBlock = document.createElement('div');
				explanationBlock.className = 'ai-explanation-block';
				explanationBlock.innerHTML = `
					<div class="ai-explanation-content">
						<div class="ai-explanation-header">
							<svg class="ai-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
							</svg>
							<span class="ai-badge">AI Explanation</span>
							${explanation.lineRange ? `<span class="ai-line-range">${explanation.lineRange}</span>` : ''}
						</div>
						<div class="ai-explanation-text">${explanation.explanation}</div>
					</div>
				`;
				firstCodeLine.before(explanationBlock);
			}
			return;
		}

		hunkHeaders.forEach((header, index) => {
			// Since we're already searching only in the right-side container,
			// we don't need to filter by side again
			const explanation = explanations.find((e) => e.hunkIndex === index);

			console.log(`Looking for explanation at index ${index}, found: ${!!explanation}`);
			if (!explanation) return;

			console.log(`Injecting explanation: ${explanation.explanation.substring(0, 60)}...`);

			// Find the hunk header row
			let hunkRow: HTMLElement | null = null;
			let current: Element | null = header;
			while (current && current !== container) {
				if (current.tagName === 'TR') {
					hunkRow = current as HTMLTableRowElement;
					break;
				}
				current = current.parentElement;
			}

			if (!hunkRow) return;

			// Create explanation element
			const explanationBlock = document.createElement('div');
			explanationBlock.className = 'ai-explanation-block-inline';
			explanationBlock.innerHTML = `
				<div class="ai-explanation-content">
					<div class="ai-explanation-header">
						<svg class="ai-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
						</svg>
						<span class="ai-badge">AI Explanation</span>
						${explanation.lineRange ? `<span class="ai-line-range">${explanation.lineRange}</span>` : ''}
					</div>
					<div class="ai-explanation-text">${explanation.explanation}</div>
				</div>
			`;

			// Create a new row for the explanation
			const explanationRow = document.createElement('tr');
			explanationRow.className = 'ai-explanation-row';

			// In side-by-side mode, we are in a table that ONLY represents one side
			// So we just need a single td that spans the width of this side's table
			const cell = document.createElement('td');
			cell.colSpan = hunkRow.querySelectorAll('td, th').length || 2;
			cell.className = 'ai-explanation-cell-right';
			cell.appendChild(explanationBlock);
			explanationRow.appendChild(cell);

			// Insert AFTER the hunk header row
			hunkRow.after(explanationRow);

			// IN SIDE-BY-SIDE MODE: We MUST also inject an empty row of equal height into the LEFT table
			// to keep both sides aligned.
			if (isSideBySide) {
				const leftSideContainer = sideDiffs[0] as HTMLElement;
				const leftTable = leftSideContainer.querySelector('table');
				const rightTable = hunkRow.closest('table');

				if (leftTable && rightTable) {
					const rightRows = Array.from(rightTable.querySelectorAll('tr'));
					const rowIndex = rightRows.indexOf(hunkRow);
					const leftRows = Array.from(leftTable.querySelectorAll('tr'));

					if (rowIndex >= 0 && rowIndex < leftRows.length) {
						const leftHunkRow = leftRows[rowIndex];

						// Create a matching spacer row for the left side
						const leftSpacerRow = document.createElement('tr');
						leftSpacerRow.className = 'ai-explanation-row ai-explanation-spacer-row';

						const leftSpacerCell = document.createElement('td');
						leftSpacerCell.colSpan = leftHunkRow.querySelectorAll('td, th').length || 2;
						leftSpacerCell.className = 'ai-explanation-cell-left';

						const spacer = document.createElement('div');
						spacer.className = 'ai-explanation-spacer-left';
						// We'll set the height after both rows are in the DOM to ensure exact matching

						leftSpacerCell.appendChild(spacer);
						leftSpacerRow.appendChild(leftSpacerCell);
						leftHunkRow.after(leftSpacerRow);

						// Sync heights
						setTimeout(() => {
							const height = explanationRow.offsetHeight;
							spacer.style.height = `${height}px`;
						}, 0);
					}
				}
			}
		});
	}

	// Toggle explanations visibility when showAiExplanations changes
	$effect(() => {
		if (!diffContainer) return;

		const explanationRows = diffContainer.querySelectorAll('.ai-explanation-row');

		if (showAiExplanations && aiInlineExplanations.length > 0) {
			// If explanations should be shown but aren't present, re-inject them
			if (explanationRows.length === 0) {
				const diffHunks = safeParse<any[]>(data.step.diffHunksJson, []);
				setTimeout(() => {
					injectAiExplanations(diffContainer, diffHunks, aiInlineExplanations);
				}, 100);
			} else {
				// Show existing rows
				explanationRows.forEach((row) => {
					(row as HTMLElement).style.display = '';
				});
			}
		} else {
			// Hide explanation rows
			explanationRows.forEach((row) => {
				(row as HTMLElement).style.display = 'none';
			});
		}
	});

	let aiGuidance = $derived(
		safeParse<{ summary: string; risks: any[]; reviewQuestions: string[] }>(
			data.step.aiGuidanceJson,
			null as any,
			'summary'
		)
	);
	let aiSummaryHtml = $derived(aiGuidance ? parseMarkdown(aiGuidance.summary) : '');
	let aiSummaryContainer = $state<HTMLElement | null>(null);
	let aiInlineExplanations = $derived(
		safeParse<Array<{ hunkIndex: number; path: string; lineRange: string; explanation: string }>>(
			data.step.aiInlineExplanationsJson,
			[]
		)
	);

	// Debug logging
	$effect(() => {
		if (aiInlineExplanations.length > 0) {
			console.log(
				`Loaded ${aiInlineExplanations.length} AI inline explanations:`,
				aiInlineExplanations
			);
		} else {
			console.log('No AI inline explanations found. Raw data:', data.step.aiInlineExplanationsJson);
		}
	});

	// Highlight code blocks in AI summary
	$effect(() => {
		if (aiSummaryContainer && aiSummaryHtml) {
			// Use setTimeout to ensure DOM is updated after HTML injection
			const timeoutId = setTimeout(() => {
				highlightCodeBlocks(aiSummaryContainer).catch((err) => {
					console.error('Failed to highlight code blocks in AI summary:', err);
				});
			}, 50);
			return () => clearTimeout(timeoutId);
		}
	});

	let showNoteForm = $state(false);
	let noteSeverity = $state('suggestion');
	let noteContent = $state('');
	let isSubmittingNote = $state(false);

	let showCommentForm = $state(false);
	let commentContent = $state('');
	let isSubmittingComment = $state(false);

	async function submitNote() {
		if (!noteContent.trim()) return;
		isSubmittingNote = true;
		try {
			const res = await fetch(`/api/steps/${data.step.id}/notes`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ severity: noteSeverity, noteMarkdown: noteContent })
			});
			if (res.ok) {
				const newNote = await res.json();
				notes = [...notes, newNote];
				noteContent = '';
				showNoteForm = false;
			}
		} finally {
			isSubmittingNote = false;
		}
	}

	async function submitComment() {
		if (!commentContent.trim()) return;
		isSubmittingComment = true;
		try {
			const res = await fetch(`/api/steps/${data.step.id}/draft-comments`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					targetType: 'conversation',
					bodyMarkdown: commentContent
				})
			});
			if (res.ok) {
				const newComment = await res.json();
				draftComments = [...draftComments, newComment];
				commentContent = '';
				showCommentForm = false;
			}
		} finally {
			isSubmittingComment = false;
		}
	}

	async function sendChatMessage() {
		if (!chatInput.trim() || isStreaming) return;

		const userMessage = chatInput.trim();
		chatInput = '';
		isStreaming = true;
		chatError = null;

		// Add user message optimistically (will be replaced by persisted version on reload)
		const tempUserMessageId = `temp-user-${Date.now()}`;
		chatMessages = [
			...chatMessages,
			{
				id: tempUserMessageId,
				stepId: data.step.id,
				authorUserId: '',
				role: 'user' as const,
				content: userMessage,
				createdAt: new Date()
			}
		];

		// Create placeholder for assistant response
		streamingMessageId = `streaming-${Date.now()}`;
		const tempAssistantMessage = {
			id: streamingMessageId,
			stepId: data.step.id,
			authorUserId: '',
			role: 'assistant' as const,
			content: '',
			createdAt: new Date()
		};
		chatMessages = [...chatMessages, tempAssistantMessage];

		// Scroll to bottom
		setTimeout(() => {
			const container = chatContainer;
			if (container) {
				container.scrollTop = container.scrollHeight;
			}
		}, 100);

		let fullContent = '';
		const finalizeStreamingError = (errorMessage: string) => {
			const hasPartialResponse = fullContent.trim().length > 0;
			if (hasPartialResponse) {
				chatMessages = chatMessages.map((msg: any) =>
					msg.id === streamingMessageId ? { ...msg, content: fullContent } : msg
				);
				chatError = `Response interrupted: ${errorMessage}`;
			} else {
				chatMessages = chatMessages.filter((msg: any) => msg.id !== streamingMessageId);
				chatError = `Failed to send message: ${errorMessage}`;
			}
		};

		try {
			const res = await fetch(`/api/steps/${data.step.id}/chat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: userMessage })
			});

			if (!res.ok) {
				throw new Error('Failed to send message');
			}

			const reader = res.body?.getReader();
			const decoder = new TextDecoder();

			if (!reader) {
				throw new Error('No response body');
			}

			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (line.startsWith('data: ')) {
						const data = line.slice(6);
						if (data.trim()) {
							try {
								const parsed = JSON.parse(data);
								if (parsed.content) {
									fullContent += parsed.content;
									// Update streaming message
									chatMessages = chatMessages.map((msg: any) =>
										msg.id === streamingMessageId ? { ...msg, content: fullContent } : msg
									);
									// Scroll to bottom as content streams
									setTimeout(() => {
										const container = chatContainer;
										if (container) {
											container.scrollTop = container.scrollHeight;
										}
									}, 50);
								}
								if (parsed.done) {
									// Streaming complete - messages are already persisted by the API
									streamingMessageId = null;
									isStreaming = false;
									return;
								}
								if (parsed.error) {
									finalizeStreamingError(parsed.error);
									isStreaming = false;
									streamingMessageId = null;
									return;
								}
							} catch (e) {
								// Skip invalid JSON
							}
						}
					}
				}
			}
		} catch (err: any) {
			console.error('Error sending chat message:', err);
			finalizeStreamingError(err.message || 'Unknown error');
		} finally {
			isStreaming = false;
			streamingMessageId = null;
		}
	}

	function handleChatKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendChatMessage();
		}
	}

	// Scroll to bottom when messages change and highlight code blocks
	$effect(() => {
		if (chatMessages.length > 0) {
			const container = chatContainer;
			if (container) {
				const timeoutId = setTimeout(() => {
					container.scrollTop = container.scrollHeight;
					// Highlight code blocks in chat messages
					highlightCodeBlocks(container).catch((err) => {
						console.error('Failed to highlight code blocks in chat:', err);
					});
				}, 150);
				return () => clearTimeout(timeoutId);
			}
		}
	});
</script>

<div
	class="flex h-screen flex-col overflow-hidden bg-gray-50 dark:bg-gray-900 {isResizing ||
	isResizingDiff
		? 'cursor-col-resize select-none'
		: ''} {isResizingDiff ? 'is-resizing-diff' : ''}"
>
	<!-- Top Bar -->
	<header
		class="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 py-3 dark:border-gray-800 dark:bg-gray-900"
	>
		<div class="flex items-center gap-4">
			<a
				href="/app/sessions/{data.session.id}"
				class="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
				aria-label="Back to session plan"
			>
				<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10 19l-7-7m0 0l7-7m-7 7h18"
					/></svg
				>
			</a>
			<div>
				<div class="flex items-center gap-2">
					<h1 class="text-lg leading-tight font-bold dark:text-gray-100">{data.step.title}</h1>
					<span
						class="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400"
						>Step {data.currentStepNumber} of {data.totalSteps}</span
					>
				</div>
				<p class="text-xs text-gray-500 dark:text-gray-400">
					{data.repo.owner}/{data.repo.name} • PR #{data.pr.number}
				</p>
			</div>
		</div>

		<div class="flex items-center gap-4">
			<div class="flex items-center rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
				{#if data.prevStepId}
					<a
						href="/app/sessions/{data.session.id}/steps/{data.prevStepId}"
						class="rounded-md p-1.5 text-gray-500 transition-all hover:bg-white hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
						title="Previous Step"
					>
						<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
							><path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M15 19l-7-7 7-7"
							/></svg
						>
					</a>
				{:else}
					<span class="cursor-not-allowed p-1.5 text-gray-300 dark:text-gray-600">
						<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
							><path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M15 19l-7-7 7-7"
							/></svg
						>
					</span>
				{/if}

				{#if data.nextStepId}
					<a
						href="/app/sessions/{data.session.id}/steps/{data.nextStepId}"
						class="rounded-md p-1.5 text-gray-500 transition-all hover:bg-white hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
						title="Next Step"
					>
						<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
							><path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9 5l7 7-7 7"
							/></svg
						>
					</a>
				{:else}
					<a
						href="/app/sessions/{data.session.id}/wrap-up"
						class="rounded-md p-1.5 text-blue-600 transition-all hover:bg-white hover:text-blue-800 dark:text-blue-400 dark:hover:bg-gray-700 dark:hover:text-blue-300"
						title="Finish Review"
					>
						<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
							><path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M5 13l4 4L19 7"
							/></svg
						>
					</a>
				{/if}
			</div>

			<div class="h-6 w-px bg-gray-200 dark:bg-gray-700"></div>

			<form method="POST" action="?/updateStatus" use:enhance>
				<select
					name="status"
					class="rounded-md border-gray-300 py-1.5 text-sm focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
					onchange={(e) => e.currentTarget.form?.requestSubmit()}
				>
					<option value="not_started" selected={data.step.status === 'not_started'}
						>Not Started</option
					>
					<option value="in_progress" selected={data.step.status === 'in_progress'}
						>In Progress</option
					>
					<option value="reviewed" selected={data.step.status === 'reviewed'}>Reviewed</option>
					<option value="follow_up" selected={data.step.status === 'follow_up'}>Follow Up</option>
				</select>
			</form>
		</div>
	</header>

	<main class="flex flex-1 overflow-hidden">
		<!-- Main Content (Diff) -->
		<div class="flex-1 overflow-auto bg-gray-100 p-2 md:p-4 dark:bg-gray-900">
			<div class="w-full max-w-none">
				<div
					class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"
				>
					<div
						class="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2 dark:border-gray-800 dark:bg-gray-800"
					>
						<span class="font-mono text-xs text-gray-600 dark:text-gray-400">{data.step.title}</span
						>
						<div class="flex items-center gap-3">
							{#if aiInlineExplanations.length > 0}
								<button
									onclick={() => (showAiExplanations = !showAiExplanations)}
									class="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors {showAiExplanations
										? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50'
										: 'bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'}"
									title={showAiExplanations ? 'Hide AI explanations' : 'Show AI explanations'}
								>
									<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
										/>
									</svg>
									AI Explanations
								</button>
							{/if}
							<div class="flex gap-2">
								<div class="h-2 w-2 rounded-full bg-red-400"></div>
								<div class="h-2 w-2 rounded-full bg-yellow-400"></div>
								<div class="h-2 w-2 rounded-full bg-green-400"></div>
							</div>
						</div>
					</div>
					<div
						bind:this={diffContainer}
						class="diff-container min-w-full overflow-x-auto"
						style="--diff-left-width: {diffSplitPercent}%; --diff-right-width: {100 -
							diffSplitPercent}%"
					></div>
				</div>
			</div>
		</div>

		<!-- Sidebar (Guidance & Notes) -->
		<div class="relative flex shrink-0" style="width: {sidebarWidth}px;">
			<!-- Resize Handle -->
			<button
				class="absolute top-0 bottom-0 left-0 z-10 w-1 cursor-col-resize appearance-none border-none bg-transparent p-0 transition-colors hover:bg-blue-400"
				onmousedown={startResizing}
				aria-label="Resize sidebar"
			></button>

			<aside
				class="flex flex-1 flex-col overflow-hidden border-l border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
			>
				<div class="flex border-b border-gray-200 dark:border-gray-800">
					<button
						class="flex-1 border-b-2 py-3 text-sm font-medium transition-colors {activeTab ===
						'guidance'
							? 'border-blue-500 text-blue-600 dark:text-blue-400'
							: 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}"
						onclick={() => (activeTab = 'guidance')}
					>
						Guidance
					</button>
					<button
						class="flex-1 border-b-2 py-3 text-sm font-medium transition-colors {activeTab ===
						'notes'
							? 'border-blue-500 text-blue-600 dark:text-blue-400'
							: 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}"
						onclick={() => (activeTab = 'notes')}
					>
						Notes & Comments
					</button>
				</div>

				<div class="flex flex-1 flex-col gap-4 overflow-hidden p-4">
					{#if activeTab === 'guidance'}
						<!-- Guidance Section -->
						<div
							class="flex flex-col overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800 {guidanceExpanded
								? 'min-h-0 flex-1'
								: 'shrink-0'}"
						>
							<button
								onclick={() => (guidanceExpanded = !guidanceExpanded)}
								class="flex w-full shrink-0 items-center justify-between bg-gray-50 px-4 py-3 transition-colors hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700"
							>
								<h2
									class="text-sm font-bold tracking-wider text-gray-600 uppercase dark:text-gray-300"
								>
									Guidance
								</h2>
								<svg
									class="h-4 w-4 text-gray-500 transition-transform {guidanceExpanded
										? 'rotate-180'
										: ''}"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M19 9l-7 7-7-7"
									/>
								</svg>
							</button>
							{#if guidanceExpanded}
								<div class="space-y-6 overflow-y-auto p-4">
									{#if aiGuidance}
										<section>
											<h3
												class="mb-2 text-sm font-bold tracking-wider text-gray-400 uppercase dark:text-gray-500"
											>
												AI Summary
											</h3>
											<div
												bind:this={aiSummaryContainer}
												class="prose prose-sm max-w-none text-gray-700 dark:text-gray-300"
											>
												{@html aiSummaryHtml}
											</div>
										</section>

										{#if aiGuidance.risks?.length}
											<section>
												<h3
													class="mb-2 text-sm font-bold tracking-wider text-gray-400 uppercase dark:text-gray-500"
												>
													Potential Risks
												</h3>
												<ul class="space-y-2">
													{#each aiGuidance.risks as risk}
														<li
															class="border-l-4 border-red-400 bg-red-50 p-2 text-sm text-red-700 dark:border-red-600 dark:bg-red-900/20 dark:text-red-300 {risk
																.lines?.length
																? 'cursor-pointer transition-colors hover:bg-red-100 dark:hover:bg-red-900/40'
																: ''}"
															onmouseenter={() => {
																if (risk.lines?.length) highlightDiffLines(risk.lines);
															}}
															onmouseleave={() => clearDiffHighlights()}
															onclick={() => {
																if (risk.lines?.length) {
																	highlightDiffLines(risk.lines);
																	scrollToRiskLines(risk.lines);
																}
															}}
														>
															<span>{risk.description}</span>
															{#if risk.lines?.length}
																<div class="mt-1.5 flex flex-wrap gap-1">
																	{#each risk.lines as line}
																		<span
																			class="inline-flex items-center rounded bg-red-100 px-1.5 py-0.5 font-mono text-[10px] text-red-600 dark:bg-red-900/40 dark:text-red-400"
																		>
																			{line.path.split('/').pop()}:{line.startLine}-{line.endLine}
																		</span>
																	{/each}
																</div>
															{/if}
														</li>
													{/each}
												</ul>
											</section>
										{/if}

										{#if aiGuidance.reviewQuestions?.length}
											<section>
												<h3
													class="mb-2 text-sm font-bold tracking-wider text-gray-400 uppercase dark:text-gray-500"
												>
													Review Checklist
												</h3>
												<ul class="space-y-2">
													{#each aiGuidance.reviewQuestions as question}
														<li
															class="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"
														>
															<input
																type="checkbox"
																class="mt-1 rounded text-blue-600 dark:border-gray-700 dark:bg-gray-800"
															/>
															<span>{question}</span>
														</li>
													{/each}
												</ul>
											</section>
										{/if}
									{:else}
										<div class="py-12 text-center">
											<div
												class="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600 dark:border-blue-400"
											></div>
											<p class="text-sm text-gray-500 dark:text-gray-400">Generating guidance...</p>
										</div>
									{/if}

									<section class="border-t pt-6 dark:border-gray-800">
										<h3
											class="mb-4 text-sm font-bold tracking-wider text-gray-400 uppercase dark:text-gray-500"
										>
											Context Pack
										</h3>
										{#if data.contextPack}
											{@const items = safeParse<any[]>(data.contextPack.itemsJson, [])}
											{#if items.length === 0}
												<p class="text-sm text-gray-500 italic dark:text-gray-400">
													No context items found.
												</p>
											{:else}
												<ul class="space-y-2">
													{#each items as item}
														<li
															class="rounded border border-gray-200 bg-gray-50 p-2 text-xs dark:border-gray-800 dark:bg-gray-800/50"
														>
															<span class="mb-1 block font-bold dark:text-gray-200"
																>{item.type}: {item.path}</span
															>
															<div class="overflow-x-auto">
																<CodeHighlighter
																	code={item.snippet}
																	language={detectLanguage(item.path)}
																/>
															</div>
														</li>
													{/each}
												</ul>
											{/if}
										{:else}
											<p class="text-sm text-gray-500 italic dark:text-gray-400">
												Context pack loading...
											</p>
										{/if}
									</section>
								</div>
							{/if}
						</div>

						<!-- Chat Section -->
						<div
							class="flex flex-col overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800 {chatExpanded
								? 'min-h-0 flex-1'
								: 'shrink-0'}"
						>
							<button
								onclick={() => (chatExpanded = !chatExpanded)}
								class="flex w-full shrink-0 items-center justify-between bg-gray-50 px-4 py-3 transition-colors hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700"
							>
								<h2
									class="text-sm font-bold tracking-wider text-gray-600 uppercase dark:text-gray-300"
								>
									Chat
								</h2>
								<svg
									class="h-4 w-4 text-gray-500 transition-transform {chatExpanded
										? 'rotate-180'
										: ''}"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M19 9l-7 7-7-7"
									/>
								</svg>
							</button>
							{#if chatExpanded}
								<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
									<!-- Chat Messages -->
									<div bind:this={chatContainer} class="flex-1 space-y-4 overflow-y-auto p-4">
										{#if chatMessages.length === 0}
											<div class="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
												<p>Ask questions about the code changes in this step.</p>
											</div>
										{:else}
											{#each chatMessages as message}
												<div
													class="chat-message flex gap-3 {message.role === 'user'
														? 'justify-end'
														: 'justify-start'}"
												>
													{#if message.role === 'assistant'}
														<div
															class="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/50"
														>
															<svg
																class="h-4 w-4 text-indigo-600 dark:text-indigo-400"
																fill="none"
																stroke="currentColor"
																viewBox="0 0 24 24"
															>
																<path
																	stroke-linecap="round"
																	stroke-linejoin="round"
																	stroke-width="2"
																	d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
																/>
															</svg>
														</div>
													{/if}
													<div
														class="chat-bubble max-w-[85%] {message.role === 'user'
															? 'rounded-2xl rounded-tr-none bg-blue-600 text-white shadow-blue-100 dark:shadow-none'
															: 'chat-bubble-assistant rounded-2xl rounded-tl-none border border-gray-100 bg-white text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'} px-4 py-2 text-[13px] leading-relaxed"
													>
														{#if message.role === 'assistant'}
															<div
																class="prose prose-sm max-w-none text-gray-800 dark:text-gray-200"
															>
																{@html message.content && message.content.trim()
																	? parseMarkdown(message.content)
																	: isStreaming && message.id === streamingMessageId
																		? '<span class="text-gray-400 italic animate-pulse">Thinking...</span>'
																		: ''}
															</div>
														{:else}
															<div>{message.content}</div>
														{/if}
													</div>
													{#if message.role === 'user'}
														<div
															class="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/50"
														>
															<svg
																class="h-4 w-4 text-blue-600 dark:text-blue-400"
																fill="none"
																stroke="currentColor"
																viewBox="0 0 24 24"
															>
																<path
																	stroke-linecap="round"
																	stroke-linejoin="round"
																	stroke-width="2"
																	d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
																/>
															</svg>
														</div>
													{/if}
												</div>
											{/each}
										{/if}
									</div>

									<!-- Chat Input -->
									<div
										class="chat-input-container border-t border-gray-100 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-900/50"
									>
										{#if chatError}
											<div
												class="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200"
											>
												{chatError}
											</div>
										{/if}
										<div class="flex items-end gap-2">
											<textarea
												bind:value={chatInput}
												onkeydown={handleChatKeydown}
												placeholder="Ask a question..."
												disabled={isStreaming}
												class="flex-1 resize-none rounded-xl border-gray-200 bg-white px-3 py-2 text-[13px] shadow-sm transition-all focus:border-blue-500 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
												rows="1"
												style="min-height: 38px; max-height: 120px;"
											></textarea>
											<button
												onclick={sendChatMessage}
												disabled={!chatInput.trim() || isStreaming}
												class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-md shadow-blue-100 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:shadow-none"
											>
												{#if isStreaming}
													<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
														<circle
															class="opacity-25"
															cx="12"
															cy="12"
															r="10"
															stroke="currentColor"
															stroke-width="4"
														></circle>
														<path
															class="opacity-75"
															fill="currentColor"
															d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
														></path>
													</svg>
												{:else}
													<svg
														class="h-4 w-4 rotate-90"
														fill="none"
														stroke="currentColor"
														viewBox="0 0 24 24"
													>
														<path
															stroke-linecap="round"
															stroke-linejoin="round"
															stroke-width="2"
															d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
														/>
													</svg>
												{/if}
											</button>
										</div>
									</div>
								</div>
							{/if}
						</div>
					{:else}
						<!-- Notes & Comments Tab -->
						<div class="space-y-6 overflow-y-auto">
							<section>
								<h2
									class="mb-4 text-sm font-bold tracking-wider text-gray-400 uppercase dark:text-gray-500"
								>
									Your Review Notes
								</h2>
								{#if notes.length === 0}
									<p class="text-sm text-gray-500 italic dark:text-gray-400">
										No internal notes yet.
									</p>
								{:else}
									<ul class="space-y-4">
										{#each notes as note}
											<li
												class="rounded-md border border-yellow-100 bg-yellow-50 p-3 text-sm dark:border-yellow-900/30 dark:bg-yellow-900/20"
											>
												<div class="mb-1 flex items-center justify-between">
													<span
														class="text-xs font-bold text-yellow-700 uppercase dark:text-yellow-400"
														>{note.severity}</span
													>
													<span class="text-[10px] text-gray-400 dark:text-gray-500"
														>{new Date(note.createdAt).toLocaleTimeString()}</span
													>
												</div>
												<div class="text-gray-800 dark:text-gray-200">{note.noteMarkdown}</div>
											</li>
										{/each}
									</ul>
								{/if}
							</section>

							<section class="border-t pt-6 dark:border-gray-800">
								<h2
									class="mb-4 text-sm font-bold tracking-wider text-gray-400 uppercase dark:text-gray-500"
								>
									Draft PR Comments
								</h2>
								{#if draftComments.length === 0}
									<p class="text-sm text-gray-500 italic dark:text-gray-400">
										No draft comments yet.
									</p>
								{:else}
									<ul class="space-y-4">
										{#each draftComments as comment}
											<li
												class="rounded-md border border-blue-100 bg-blue-50 p-3 text-sm dark:border-blue-900/30 dark:bg-blue-900/20"
											>
												<div class="mb-1 flex items-center justify-between">
													{#if comment.line}
														<span
															class="text-xs font-bold text-blue-700 uppercase dark:text-blue-400"
															>Line {comment.line}</span
														>
													{:else}
														<span
															class="text-xs font-bold text-blue-700 uppercase dark:text-blue-400"
															>General</span
														>
													{/if}
													<span class="text-[10px] text-gray-400 dark:text-gray-500"
														>{comment.status}</span
													>
												</div>
												<div class="text-gray-800 dark:text-gray-200">{comment.bodyMarkdown}</div>
											</li>
										{/each}
									</ul>
								{/if}
							</section>
						</div>
					{/if}
				</div>

				<!-- Quick Comment Bar -->
				<div class="border-t border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
					{#if activeTab === 'guidance'}
						{#if showNoteForm}
							<div
								class="space-y-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800"
							>
								<div>
									<label
										for="severity"
										class="mb-1 block text-[10px] font-bold text-gray-400 uppercase dark:text-gray-500"
										>Severity</label
									>
									<select
										id="severity"
										bind:value={noteSeverity}
										class="w-full rounded-md border-gray-300 py-1 text-sm focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
									>
										<option value="nit">Nit</option>
										<option value="suggestion">Suggestion</option>
										<option value="concern">Concern</option>
										<option value="question">Question</option>
									</select>
								</div>
								<div>
									<label
										for="note"
										class="mb-1 block text-[10px] font-bold text-gray-400 uppercase dark:text-gray-500"
										>Note (Markdown)</label
									>
									<textarea
										id="note"
										bind:value={noteContent}
										placeholder="What did you find?"
										class="min-h-[80px] w-full rounded-md border-gray-300 text-sm focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
									></textarea>
								</div>
								<div class="flex gap-2">
									<button
										onclick={submitNote}
										disabled={isSubmittingNote || !noteContent.trim()}
										class="flex-1 rounded-md bg-blue-600 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
									>
										{isSubmittingNote ? 'Saving...' : 'Save Note'}
									</button>
									<button
										onclick={() => (showNoteForm = false)}
										class="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
									>
										Cancel
									</button>
								</div>
							</div>
						{:else}
							<button
								onclick={() => (showNoteForm = true)}
								class="w-full rounded-md bg-blue-600 py-2 font-medium text-white transition hover:bg-blue-700"
							>
								Add Review Note
							</button>
						{/if}
					{:else if showCommentForm}
						<div
							class="space-y-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800"
						>
							<div>
								<label
									for="comment"
									class="mb-1 block text-[10px] font-bold text-gray-400 uppercase dark:text-gray-500"
									>Comment (Markdown)</label
								>
								<textarea
									id="comment"
									bind:value={commentContent}
									placeholder="Write a comment for the PR..."
									class="min-h-[80px] w-full rounded-md border-gray-300 text-sm focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
								></textarea>
							</div>
							<div class="flex gap-2">
								<button
									onclick={submitComment}
									disabled={isSubmittingComment || !commentContent.trim()}
									class="flex-1 rounded-md bg-blue-600 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
								>
									{isSubmittingComment ? 'Saving...' : 'Save Comment'}
								</button>
								<button
									onclick={() => (showCommentForm = false)}
									class="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
								>
									Cancel
								</button>
							</div>
						</div>
					{:else}
						<button
							onclick={() => (showCommentForm = true)}
							class="w-full rounded-md bg-blue-600 py-2 font-medium text-white transition hover:bg-blue-700"
						>
							New Comment
						</button>
					{/if}
				</div>
			</aside>
		</div>
	</main>
</div>

<style>
	/* Risk hover highlight on diff lines */
	:global(tr.risk-highlight td) {
		background-color: rgba(239, 68, 68, 0.15) !important;
		transition: background-color 0.15s ease;
	}
	:global(.dark) :global(tr.risk-highlight td) {
		background-color: rgba(239, 68, 68, 0.2) !important;
	}
	:global(tr.risk-highlight .d2h-code-side-linenumber) {
		background-color: rgba(239, 68, 68, 0.25) !important;
		color: #ef4444 !important;
	}
	:global(.dark) :global(tr.risk-highlight .d2h-code-side-linenumber) {
		background-color: rgba(239, 68, 68, 0.3) !important;
		color: #f87171 !important;
	}

	/* Fix for diff2html side-by-side on narrow containers */
	:global(.d2h-file-wrapper) {
		margin-bottom: 0 !important;
		border: none !important;
	}

	:global(.d2h-files-diff) {
		display: flex !important;
		position: relative;
	}

	:global(.d2h-file-side-diff) {
		margin-bottom: 0 !important;
		container-type: inline-size;
	}

	:global(.diff-container) {
		container-type: inline-size;
	}

	:global(.d2h-file-side-diff:first-child) {
		width: var(--diff-left-width, 50%) !important;
	}

	:global(.d2h-file-side-diff:last-child) {
		width: var(--diff-right-width, 50%) !important;
	}

	:global(.diff-resizer-handle) {
		width: 4px;
		background: #e5e7eb;
		cursor: col-resize;
		flex-shrink: 0;
		transition: background 0.2s;
		z-index: 10;
		margin: 0 -2px;
		position: relative;
	}

	:global(.diff-resizer-handle:hover),
	:global(.is-resizing-diff .diff-resizer-handle) {
		background: #3b82f6;
	}

	/* Inline comment trigger styles */
	:global(.inline-comment-trigger) {
		cursor: pointer;
		position: relative;
		transition: background-color 0.15s ease;
	}

	:global(.inline-comment-trigger:hover) {
		background-color: #ddf4ff !important;
	}

	:global(.inline-comment-trigger:hover::before) {
		content: '+';
		position: absolute;
		left: 4px;
		top: 50%;
		transform: translateY(-50%);
		font-size: 14px;
		font-weight: 700;
		color: #0969da;
		width: 16px;
		height: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #ddf4ff;
		border-radius: 3px;
	}

	:global(.inline-comment-trigger.has-comments) {
		background-color: #fff8c5 !important;
	}

	:global(.comment-count-badge) {
		position: absolute;
		right: 4px;
		top: 50%;
		transform: translateY(-50%);
		background: #bf8700;
		color: white;
		font-size: 10px;
		font-weight: 700;
		min-width: 16px;
		height: 16px;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 4px;
	}

	/* Inline comment form row */
	:global(.inline-comment-form-row) {
		animation: slideDown 0.2s ease-out;
	}

	:global(.inline-comment-form-cell) {
		padding: 8px 12px !important;
		background: #f6f8fa !important;
	}

	:global(.inline-comment-form) {
		background: white;
		border: 1px solid #d0d7de;
		border-radius: 6px;
		box-shadow: 0 4px 12px rgba(140, 149, 159, 0.15);
		overflow: hidden;
		max-width: 600px;
	}

	:global(.inline-comment-form .form-header) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 12px;
		background: #f6f8fa;
		border-bottom: 1px solid #d0d7de;
	}

	:global(.inline-comment-form .location-badge) {
		font-size: 12px;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		color: #57606a;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	:global(.inline-comment-form .side-badge) {
		font-size: 10px;
		padding: 2px 6px;
		border-radius: 3px;
		background: #ddf4ff;
		color: #0969da;
		font-weight: 600;
	}

	:global(.inline-comment-form .close-btn) {
		padding: 4px;
		border: none;
		background: transparent;
		cursor: pointer;
		color: #57606a;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	:global(.inline-comment-form .close-btn:hover) {
		background: #d0d7de;
		color: #24292f;
	}

	:global(.inline-comment-form .comment-textarea) {
		width: 100%;
		border: none;
		padding: 12px;
		font-size: 13px;
		resize: vertical;
		min-height: 80px;
		font-family:
			-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
	}

	:global(.inline-comment-form .comment-textarea:focus) {
		outline: none;
	}

	:global(.inline-comment-form .form-footer) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 12px;
		background: #f6f8fa;
		border-top: 1px solid #d0d7de;
	}

	:global(.inline-comment-form .hint) {
		font-size: 11px;
		color: #8b949e;
	}

	:global(.inline-comment-form .hint kbd) {
		padding: 2px 5px;
		background: #f6f8fa;
		border: 1px solid #d0d7de;
		border-radius: 3px;
		font-size: 10px;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	}

	:global(.inline-comment-form .form-actions) {
		display: flex;
		gap: 8px;
	}

	:global(.inline-comment-form .btn-cancel) {
		padding: 5px 12px;
		font-size: 12px;
		font-weight: 600;
		border: 1px solid #d0d7de;
		border-radius: 6px;
		background: #f6f8fa;
		color: #24292f;
		cursor: pointer;
	}

	:global(.inline-comment-form .btn-cancel:hover) {
		background: #f3f4f6;
	}

	:global(.inline-comment-form .btn-submit) {
		padding: 5px 12px;
		font-size: 12px;
		font-weight: 600;
		border: 1px solid transparent;
		border-radius: 6px;
		background: #2da44e;
		color: white;
		cursor: pointer;
	}

	:global(.inline-comment-form .btn-submit:hover:not(:disabled)) {
		background: #2c974b;
	}

	:global(.inline-comment-form .btn-submit:disabled) {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* Inline comment thread styles */
	:global(.inline-comment-thread-row) {
		animation: slideDown 0.2s ease-out;
	}

	:global(.inline-comment-thread-cell) {
		padding: 8px 12px !important;
		background: #f6f8fa !important;
	}

	:global(.inline-thread-container) {
		background: white;
		border: 1px solid #d0d7de;
		border-radius: 6px;
		overflow: hidden;
		max-width: 600px;
	}

	:global(.inline-thread-header) {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: #f6f8fa;
		border-bottom: 1px solid #d0d7de;
		font-size: 12px;
		font-weight: 600;
		color: #24292f;
	}

	:global(.inline-thread-header .thread-icon) {
		width: 16px;
		height: 16px;
		color: #57606a;
	}

	:global(.inline-thread-comments) {
		padding: 0;
	}

	:global(.inline-thread-comment) {
		padding: 12px;
		border-bottom: 1px solid #d0d7de;
	}

	:global(.inline-thread-comment:last-child) {
		border-bottom: none;
	}

	:global(.inline-thread-comment .comment-status) {
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		padding: 2px 6px;
		border-radius: 3px;
		margin-bottom: 6px;
		display: inline-block;
	}

	:global(.inline-thread-comment .status-draft) {
		background: #fff8c5;
		color: #9a6700;
	}

	:global(.inline-thread-comment .status-published) {
		background: #dafbe1;
		color: #116329;
	}

	:global(.inline-thread-comment .comment-body) {
		font-size: 13px;
		color: #24292f;
		line-height: 1.5;
		white-space: pre-wrap;
		margin-top: 6px;
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Fix table borders in diff */
	:global(.d2h-diff-table) {
		border-collapse: collapse;
	}

	:global(.d2h-diff-tbody tr td) {
		border-color: transparent;
	}

	:global(.d2h-code-line) {
		padding: 0 8px !important;
	}

	:global(.d2h-code-side-line) {
		padding: 0 4.5em !important;
	}

	/* Shiki highlighting integration with diff2html */
	/* Ensure ALL code text is dark - override diff2html's default light colors */
	:global(.d2h-code-line-ctn) {
		color: #1f2328 !important; /* Darker than #24292e for better contrast */
	}

	:global(.d2h-code-line-ctn.shiki-highlighted) {
		background: transparent !important;
		opacity: 1 !important;
		/* Base color - inline styles on spans will override */
		color: #1f2328;
	}

	:global(.d2h-code-line-ctn.shiki-highlighted code) {
		background: transparent !important;
		padding: 0 !important;
		font-family:
			ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
			monospace;
		font-size: inherit;
		line-height: inherit;
		opacity: 1 !important;
		color: inherit;
	}

	/* Ensure Shiki tokens work within diff lines - preserve inline styles */
	:global(.d2h-code-line-ctn.shiki-highlighted span[style]) {
		display: inline !important;
		opacity: 1 !important;
		/* Don't override color - let Shiki's inline styles work naturally */
	}

	/* Preserve diff line background colors */
	:global(.d2h-del .d2h-code-line-ctn.shiki-highlighted),
	:global(.d2h-ins .d2h-code-line-ctn.shiki-highlighted),
	:global(.d2h-cntx .d2h-code-line-ctn.shiki-highlighted) {
		background: inherit !important;
	}

	/* Custom scrollbar for the diff container */
	:global(.d2h-file-side-diff::-webkit-scrollbar) {
		width: 8px;
		height: 8px;
	}
	:global(.d2h-file-side-diff::-webkit-scrollbar-track) {
		background: #f1f1f1;
	}
	:global(.d2h-file-side-diff::-webkit-scrollbar-thumb) {
		background: #ddd;
		border-radius: 4px;
	}
	:global(.d2h-file-side-diff::-webkit-scrollbar-thumb:hover) {
		background: #ccc;
	}

	/* Markdown styles for guidance */
	:global(.prose h1) {
		font-size: 1.25rem;
		line-height: 1.75rem;
		font-weight: 700;
		margin-bottom: 1rem;
		margin-top: 1.5rem;
	}
	:global(.prose h2) {
		font-size: 1.125rem;
		line-height: 1.75rem;
		font-weight: 700;
		margin-bottom: 0.75rem;
		margin-top: 1.25rem;
	}
	:global(.prose h3) {
		font-size: 1rem;
		line-height: 1.5rem;
		font-weight: 700;
		margin-bottom: 0.5rem;
		margin-top: 1rem;
	}
	:global(.prose p) {
		margin-bottom: 0.75rem;
		line-height: 1.625;
	}
	:global(.prose ul) {
		list-style-type: disc;
		padding-left: 1.25rem;
		margin-bottom: 1rem;
	}
	:global(.prose ol) {
		list-style-type: decimal;
		padding-left: 1.25rem;
		margin-bottom: 1rem;
	}
	:global(.prose li) {
		margin-bottom: 0.25rem;
	}
	:global(.prose code) {
		background-color: #f3f4f6;
		padding: 0.125rem 0.25rem;
		border-radius: 0.25rem;
		font-family:
			ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
			monospace;
		font-size: 0.875rem;
	}
	:global(.prose pre) {
		background-color: #111827;
		color: #f3f4f6;
		padding: 1rem;
		border-radius: 0.5rem;
		margin-bottom: 1rem;
		overflow-x: auto;
	}
	:global(.prose pre code) {
		background-color: transparent;
		padding: 0;
		color: inherit;
		font-size: inherit;
	}
	:global(.prose blockquote) {
		border-left-width: 4px;
		border-color: #e5e7eb;
		padding-left: 1rem;
		font-style: italic;
		margin-top: 1rem;
		margin-bottom: 1rem;
	}

	/* AI Explanation Blocks */
	:global(.ai-explanation-row) {
		animation: fadeIn 0.3s ease-in;
	}

	:global(.ai-explanation-cell-right) {
		padding: 8px 12px !important;
		background: transparent !important;
		vertical-align: top;
	}

	:global(.ai-explanation-cell-left) {
		padding: 0 !important;
		background: transparent !important;
	}

	:global(.ai-explanation-spacer-left) {
		height: 100%;
		width: 100%;
	}

	:global(.ai-explanation-cell-full) {
		padding: 8px 12px !important;
		background: transparent !important;
		vertical-align: top;
	}

	:global(.ai-explanation-spacer) {
		background: #f8fafc !important;
	}

	:global(.ai-explanation-block-inline) {
		margin: 4px 0;
	}

	:global(.ai-explanation-content) {
		background: linear-gradient(to right, #eef2ff 0%, #f5f3ff 100%);
		border-left: 4px solid #6366f1;
		border-radius: 6px;
		padding: 12px 16px;
		margin-left: 0;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		word-wrap: break-word;
		white-space: normal;
		overflow-wrap: break-word;

		/* Keep explanation within visible panel width */
		position: sticky;
		left: 12px;
		width: fit-content;
		min-width: 300px;
		max-width: calc(100cqw - 40px);
		z-index: 5;
	}

	:global(.ai-explanation-header) {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 8px;
	}

	:global(.ai-icon) {
		width: 16px;
		height: 16px;
		color: #6366f1;
		flex-shrink: 0;
	}

	:global(.ai-badge) {
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: #6366f1;
		background: rgba(99, 102, 241, 0.1);
		padding: 2px 8px;
		border-radius: 4px;
	}

	:global(.ai-line-range) {
		font-size: 10px;
		font-family:
			ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
			monospace;
		color: #6b7280;
		background: rgba(107, 114, 128, 0.1);
		padding: 2px 6px;
		border-radius: 3px;
		margin-left: auto;
	}

	:global(.ai-explanation-text) {
		font-size: 13px;
		line-height: 1.6;
		color: #374151;
		font-style: italic;
		word-wrap: break-word;
		white-space: normal;
		overflow-wrap: break-word;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Chat styles */
	:global(.prose) {
		color: inherit;
	}

	:global(.prose p) {
		margin-top: 0.5em;
		margin-bottom: 0.5em;
	}

	:global(.prose p:first-child) {
		margin-top: 0;
	}

	:global(.prose p:last-child) {
		margin-bottom: 0;
	}

	:global(.prose code) {
		background-color: rgba(0, 0, 0, 0.05);
		padding: 0.125rem 0.25rem;
		border-radius: 0.25rem;
		font-size: 0.875em;
	}

	:global(.prose pre) {
		background-color: #1f2937;
		color: #f3f4f6;
		padding: 0.75rem;
		border-radius: 0.375rem;
		margin: 0.75rem 0;
		overflow-x: auto;
		font-size: 0.8125rem;
	}

	:global(.prose pre code) {
		background-color: transparent;
		padding: 0;
		color: inherit;
	}

	:global(.chat-message) {
		animation: fadeIn 0.2s ease-out;
	}

	:global(.chat-bubble) {
		box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
	}

	:global(.chat-bubble-assistant) {
		border: 1px solid #e5e7eb;
	}

	:global(.chat-input-container) {
		box-shadow: 0 -4px 6px -1px rgba(0, 0, 0, 0.05);
	}

	/* System-preference based Dark Mode Overrides */
	@media (prefers-color-scheme: dark) {
		:global(.diff-resizer-handle) {
			background: #374151;
		}

		/* Base text color for non-highlighted code */
		:global(.d2h-code-line-ctn) {
			color: #e6edf3;
		}

		/* Allow Shiki syntax highlighting to take precedence */
		:global(.d2h-code-line-ctn.shiki-highlighted) {
			color: #e6edf3;
		}

		/* Shiki tokens should use their own colors */
		:global(.d2h-code-line-ctn.shiki-highlighted span[style]) {
			/* Let inline styles from Shiki work */
		}

		/* Fallback color for elements without Shiki highlighting */
		:global(.d2h-code-line-ctn:not(.shiki-highlighted)) {
			color: #e6edf3 !important;
		}

		:global(.d2h-code-line-ctn:not(.shiki-highlighted) *) {
			color: inherit;
		}

		/* Diff line type indicators - only for non-shiki content */
		:global(.d2h-del .d2h-code-line-ctn:not(.shiki-highlighted)) {
			color: #ffa198 !important;
		}

		:global(.d2h-ins .d2h-code-line-ctn:not(.shiki-highlighted)) {
			color: #7ee787 !important;
		}

		:global(.d2h-cntx .d2h-code-line-ctn:not(.shiki-highlighted)) {
			color: #e6edf3 !important;
		}

		:global(.d2h-code-line),
		:global(.d2h-code-side-line) {
			background-color: #161b22 !important;
		}

		:global(.d2h-file-side-diff) {
			background-color: #161b22 !important;
		}

		:global(.d2h-file-wrapper) {
			background-color: #161b22 !important;
			border-color: #30363d !important;
		}

		:global(.d2h-wrapper) {
			background-color: #161b22 !important;
		}

		:global(.d2h-files-diff) {
			background-color: #161b22 !important;
		}

		:global(.d2h-file-diff) {
			background-color: #161b22 !important;
		}

		:global(.d2h-diff-table) {
			background-color: #161b22 !important;
		}

		:global(.d2h-diff-tbody) {
			background-color: #161b22 !important;
		}

		:global(.d2h-code-side-emptyplaceholder) {
			background-color: #161b22 !important;
			border-color: #30363d !important;
		}

		:global(.d2h-emptyplaceholder) {
			background-color: #21262d !important;
			border-color: #30363d !important;
		}

		:global(.d2h-code-linenumber),
		:global(.d2h-code-side-linenumber) {
			background-color: #161b22 !important;
			border-color: #30363d !important;
			color: #8b949e !important;
		}

		:global(.d2h-cntx) {
			background-color: #161b22 !important;
		}

		:global(.d2h-diff-tbody tr td) {
			border-color: #30363d !important;
		}

		:global(.d2h-file-header) {
			background-color: #21262d !important;
			border-color: #30363d !important;
			color: #c9d1d9 !important;
		}
		:global(.d2h-info) {
			background-color: #161b22 !important;
			border-color: #30363d !important;
			color: #8b949e !important;
		}
		:global(.d2h-del) {
			background-color: rgba(248, 81, 73, 0.15) !important;
		}
		:global(.d2h-del .d2h-code-line-ctn) {
			background-color: transparent !important;
		}
		:global(.d2h-ins) {
			background-color: rgba(46, 160, 67, 0.15) !important;
		}
		:global(.d2h-ins .d2h-code-line-ctn) {
			background-color: transparent !important;
		}

		:global(.d2h-file-side-diff::-webkit-scrollbar-track) {
			background: #161b22;
		}
		:global(.d2h-file-side-diff::-webkit-scrollbar-thumb) {
			background: #30363d;
		}
		:global(.d2h-file-side-diff::-webkit-scrollbar-thumb:hover) {
			background: #484f58;
		}

		:global(.prose h1),
		:global(.prose h2),
		:global(.prose h3) {
			color: #f9fafb;
		}
		:global(.prose p),
		:global(.prose li) {
			color: #d1d5db;
		}
		:global(.prose code) {
			background-color: #374151;
			color: #f9fafb;
		}
		:global(.prose blockquote) {
			border-color: #374151;
			color: #9ca3af;
		}

		:global(.ai-explanation-content) {
			background: linear-gradient(to right, #1e1b4b 0%, #2e1065 100%);
			border-color: #818cf8;
			box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
		}
		:global(.ai-explanation-text) {
			color: #e0e7ff;
		}
		:global(.ai-badge) {
			color: #a5b4fc;
			background: rgba(129, 140, 248, 0.1);
		}
		:global(.ai-icon) {
			color: #a5b4fc;
		}
		:global(.ai-line-range) {
			color: #94a3b8;
			background: rgba(148, 163, 184, 0.1);
		}

		:global(.chat-bubble-assistant) {
			border-color: #374151;
		}
		:global(.chat-bubble-assistant .prose) {
			color: #e5e7eb;
		}
		:global(.chat-input-container) {
			box-shadow: 0 -4px 6px -1px rgba(0, 0, 0, 0.2);
		}

		/* Inline comment dark mode */
		:global(.inline-comment-trigger:hover) {
			background-color: #388bfd26 !important;
		}

		:global(.inline-comment-trigger:hover::before) {
			color: #58a6ff;
			background: #388bfd26;
		}

		:global(.inline-comment-trigger.has-comments) {
			background-color: #bb800926 !important;
		}

		:global(.comment-count-badge) {
			background: #9e6a00;
		}

		:global(.inline-comment-form-cell),
		:global(.inline-comment-thread-cell) {
			background: #21262d !important;
		}

		:global(.inline-comment-form) {
			background: #161b22;
			border-color: #30363d;
			box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		}

		:global(.inline-comment-form .form-header) {
			background: #21262d;
			border-color: #30363d;
		}

		:global(.inline-comment-form .location-badge) {
			color: #8b949e;
		}

		:global(.inline-comment-form .side-badge) {
			background: #388bfd26;
			color: #58a6ff;
		}

		:global(.inline-comment-form .close-btn) {
			color: #8b949e;
		}

		:global(.inline-comment-form .close-btn:hover) {
			background: #30363d;
			color: #c9d1d9;
		}

		:global(.inline-comment-form .comment-textarea) {
			background: #161b22;
			color: #c9d1d9;
		}

		:global(.inline-comment-form .form-footer) {
			background: #21262d;
			border-color: #30363d;
		}

		:global(.inline-comment-form .hint) {
			color: #6e7681;
		}

		:global(.inline-comment-form .hint kbd) {
			background: #21262d;
			border-color: #30363d;
			color: #8b949e;
		}

		:global(.inline-comment-form .btn-cancel) {
			background: #21262d;
			border-color: #30363d;
			color: #c9d1d9;
		}

		:global(.inline-comment-form .btn-cancel:hover) {
			background: #30363d;
		}

		:global(.inline-thread-container) {
			background: #161b22;
			border-color: #30363d;
		}

		:global(.inline-thread-header) {
			background: #21262d;
			border-color: #30363d;
			color: #c9d1d9;
		}

		:global(.inline-thread-header .thread-icon) {
			color: #8b949e;
		}

		:global(.inline-thread-comment) {
			border-color: #30363d;
		}

		:global(.inline-thread-comment .status-draft) {
			background: #bb800926;
			color: #e3b341;
		}

		:global(.inline-thread-comment .status-published) {
			background: #2ea04326;
			color: #3fb950;
		}

		:global(.inline-thread-comment .comment-body) {
			color: #c9d1d9;
		}
	}

	/* Also support class-based dark mode for the browser tool and robust theme switching */
	:global(.dark) :global(.diff-resizer-handle) {
		background: #374151;
	}

	/* Base text color for non-highlighted code */
	:global(.dark) :global(.d2h-code-line-ctn) {
		color: #e6edf3;
	}

	/* Allow Shiki syntax highlighting to take precedence */
	:global(.dark) :global(.d2h-code-line-ctn.shiki-highlighted) {
		color: #e6edf3;
	}

	/* Shiki tokens should use their own colors */
	:global(.dark) :global(.d2h-code-line-ctn.shiki-highlighted span[style]) {
		/* Let inline styles from Shiki work */
	}

	/* Fallback color for elements without Shiki highlighting */
	:global(.dark) :global(.d2h-code-line-ctn:not(.shiki-highlighted)) {
		color: #e6edf3 !important;
	}

	:global(.dark) :global(.d2h-code-line-ctn:not(.shiki-highlighted) *) {
		color: inherit;
	}

	/* Diff line type indicators - only for non-shiki content */
	:global(.dark) :global(.d2h-del .d2h-code-line-ctn:not(.shiki-highlighted)) {
		color: #ffa198 !important;
	}

	:global(.dark) :global(.d2h-ins .d2h-code-line-ctn:not(.shiki-highlighted)) {
		color: #7ee787 !important;
	}

	:global(.dark) :global(.d2h-cntx .d2h-code-line-ctn:not(.shiki-highlighted)) {
		color: #e6edf3 !important;
	}

	:global(.dark) :global(.d2h-code-line),
	:global(.dark) :global(.d2h-code-side-line) {
		background-color: #161b22 !important;
	}

	:global(.dark) :global(.d2h-file-side-diff) {
		background-color: #161b22 !important;
	}

	:global(.dark) :global(.d2h-file-wrapper) {
		background-color: #161b22 !important;
		border-color: #30363d !important;
	}

	:global(.dark) :global(.d2h-wrapper) {
		background-color: #161b22 !important;
	}

	:global(.dark) :global(.d2h-files-diff) {
		background-color: #161b22 !important;
	}

	:global(.dark) :global(.d2h-file-diff) {
		background-color: #161b22 !important;
	}

	:global(.dark) :global(.d2h-diff-table) {
		background-color: #161b22 !important;
	}

	:global(.dark) :global(.d2h-diff-tbody) {
		background-color: #161b22 !important;
	}

	:global(.dark) :global(.d2h-code-side-emptyplaceholder) {
		background-color: #161b22 !important;
		border-color: #30363d !important;
	}

	:global(.dark) :global(.d2h-emptyplaceholder) {
		background-color: #21262d !important;
		border-color: #30363d !important;
	}

	:global(.dark) :global(.d2h-code-linenumber),
	:global(.dark) :global(.d2h-code-side-linenumber) {
		background-color: #161b22 !important;
		border-color: #30363d !important;
		color: #8b949e !important;
	}

	:global(.dark) :global(.d2h-cntx) {
		background-color: #161b22 !important;
	}

	:global(.dark) :global(.d2h-diff-tbody tr td) {
		border-color: #30363d !important;
	}

	:global(.dark) :global(.d2h-file-header) {
		background-color: #21262d !important;
		border-color: #30363d !important;
		color: #c9d1d9 !important;
	}
	:global(.dark) :global(.d2h-info) {
		background-color: #161b22 !important;
		border-color: #30363d !important;
		color: #8b949e !important;
	}
	:global(.dark) :global(.d2h-del) {
		background-color: rgba(248, 81, 73, 0.15) !important;
	}
	:global(.dark) :global(.d2h-del .d2h-code-line-ctn) {
		background-color: transparent !important;
	}
	:global(.dark) :global(.d2h-ins) {
		background-color: rgba(46, 160, 67, 0.15) !important;
	}
	:global(.dark) :global(.d2h-ins .d2h-code-line-ctn) {
		background-color: transparent !important;
	}

	:global(.dark) :global(.d2h-file-side-diff::-webkit-scrollbar-track) {
		background: #161b22;
	}
	:global(.dark) :global(.d2h-file-side-diff::-webkit-scrollbar-thumb) {
		background: #30363d;
	}
	:global(.dark) :global(.d2h-file-side-diff::-webkit-scrollbar-thumb:hover) {
		background: #484f58;
	}

	:global(.dark) :global(.prose h1),
	:global(.dark) :global(.prose h2),
	:global(.dark) :global(.prose h3) {
		color: #f9fafb;
	}
	:global(.dark) :global(.prose p),
	:global(.dark) :global(.prose li) {
		color: #d1d5db;
	}
	:global(.dark) :global(.prose code) {
		background-color: #374151;
		color: #f9fafb;
	}
	:global(.dark) :global(.prose blockquote) {
		border-color: #374151;
		color: #9ca3af;
	}

	:global(.dark) :global(.ai-explanation-content) {
		background: linear-gradient(to right, #1e1b4b 0%, #2e1065 100%);
		border-color: #818cf8;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
	}
	:global(.dark) :global(.ai-explanation-text) {
		color: #e0e7ff;
	}
	:global(.dark) :global(.ai-badge) {
		color: #a5b4fc;
		background: rgba(129, 140, 248, 0.1);
	}
	:global(.dark) :global(.ai-icon) {
		color: #a5b4fc;
	}
	:global(.dark) :global(.ai-line-range) {
		color: #94a3b8;
		background: rgba(148, 163, 184, 0.1);
	}

	:global(.dark) :global(.chat-bubble-assistant) {
		border-color: #374151;
	}
	:global(.dark) :global(.chat-bubble-assistant .prose) {
		color: #e5e7eb;
	}
	:global(.dark) :global(.chat-input-container) {
		box-shadow: 0 -4px 6px -1px rgba(0, 0, 0, 0.2);
	}

	/* Inline comment class-based dark mode */
	:global(.dark) :global(.inline-comment-trigger:hover) {
		background-color: #388bfd26 !important;
	}

	:global(.dark) :global(.inline-comment-trigger:hover::before) {
		color: #58a6ff;
		background: #388bfd26;
	}

	:global(.dark) :global(.inline-comment-trigger.has-comments) {
		background-color: #bb800926 !important;
	}

	:global(.dark) :global(.comment-count-badge) {
		background: #9e6a00;
	}

	:global(.dark) :global(.inline-comment-form-cell),
	:global(.dark) :global(.inline-comment-thread-cell) {
		background: #21262d !important;
	}

	:global(.dark) :global(.inline-comment-form) {
		background: #161b22;
		border-color: #30363d;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}

	:global(.dark) :global(.inline-comment-form .form-header) {
		background: #21262d;
		border-color: #30363d;
	}

	:global(.dark) :global(.inline-comment-form .location-badge) {
		color: #8b949e;
	}

	:global(.dark) :global(.inline-comment-form .side-badge) {
		background: #388bfd26;
		color: #58a6ff;
	}

	:global(.dark) :global(.inline-comment-form .close-btn) {
		color: #8b949e;
	}

	:global(.dark) :global(.inline-comment-form .close-btn:hover) {
		background: #30363d;
		color: #c9d1d9;
	}

	:global(.dark) :global(.inline-comment-form .comment-textarea) {
		background: #161b22;
		color: #c9d1d9;
	}

	:global(.dark) :global(.inline-comment-form .form-footer) {
		background: #21262d;
		border-color: #30363d;
	}

	:global(.dark) :global(.inline-comment-form .hint) {
		color: #6e7681;
	}

	:global(.dark) :global(.inline-comment-form .hint kbd) {
		background: #21262d;
		border-color: #30363d;
		color: #8b949e;
	}

	:global(.dark) :global(.inline-comment-form .btn-cancel) {
		background: #21262d;
		border-color: #30363d;
		color: #c9d1d9;
	}

	:global(.dark) :global(.inline-comment-form .btn-cancel:hover) {
		background: #30363d;
	}

	:global(.dark) :global(.inline-thread-container) {
		background: #161b22;
		border-color: #30363d;
	}

	:global(.dark) :global(.inline-thread-header) {
		background: #21262d;
		border-color: #30363d;
		color: #c9d1d9;
	}

	:global(.dark) :global(.inline-thread-header .thread-icon) {
		color: #8b949e;
	}

	:global(.dark) :global(.inline-thread-comment) {
		border-color: #30363d;
	}

	:global(.dark) :global(.inline-thread-comment .status-draft) {
		background: #bb800926;
		color: #e3b341;
	}

	:global(.dark) :global(.inline-thread-comment .status-published) {
		background: #2ea04326;
		color: #3fb950;
	}

	:global(.dark) :global(.inline-thread-comment .comment-body) {
		color: #c9d1d9;
	}
</style>
