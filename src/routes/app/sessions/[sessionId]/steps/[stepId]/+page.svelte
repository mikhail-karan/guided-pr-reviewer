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
		const diffString = diffHunks.map((h: any) => {
			return `--- a/${h.path}\n+++ b/${h.path}\n${h.patch}`;
		}).join('\n');
		
		const html = Diff2Html.html(diffString, {
			drawFileList: false,
			matching: 'lines',
			outputFormat: 'side-by-side',
		});
		
		if (diffContainer) {
			// Remove any existing AI explanation blocks first to prevent duplicates
			diffContainer.querySelectorAll('.ai-explanation-block').forEach(el => el.remove());
			
			diffContainer.innerHTML = html;

			// Inject resize handles between side-by-side diffs
			const diffs = diffContainer.querySelectorAll('.d2h-files-diff');
			diffs.forEach(diff => {
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
		}
	});

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
		container.querySelectorAll('.ai-explanation-row').forEach(el => el.remove());
		container.querySelectorAll('.ai-explanation-block').forEach(el => el.remove());

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
			hunkHeaders = Array.from(infoRows).filter(row => {
				// d2h-info class is used for hunk headers
				if (row.classList.contains('d2h-info')) return true;
				// Also check for empty info cells that mark hunk boundaries
				const cells = row.querySelectorAll('td');
				return cells.length > 0 && Array.from(cells).some(cell => 
					cell.classList.contains('d2h-info') || 
					(cell.textContent || '').includes('@@')
				);
			});
			
			console.log(`Found ${hunkHeaders.length} hunk info rows in right-side table`);
			
			// If still no luck, try finding rows at the same index as left-side hunk headers
			if (hunkHeaders.length === 0) {
				const leftSideContainer = sideDiffs[0] as HTMLElement;
				const leftHunkRows = Array.from(leftSideContainer.querySelectorAll('tr')).filter(row => {
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
					
					leftHunkRows.forEach(leftRow => {
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
			hunkHeaders = Array.from(allRows).filter(row => {
				const text = row.textContent || '';
				return /@@\s+-\d+/.test(text);
			});
		}
		
		console.log(`Final hunk headers count: ${hunkHeaders.length}`);

		if (hunkHeaders.length === 0) {
			console.warn('Could not find hunk headers, using fallback insertion');
			// Fallback: Find the first actual code line (not the header) and insert before it
			const firstCodeLine = container.querySelector('.d2h-code-line, .d2h-code-line-ctn, tr.d2h-code-line');
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
			const explanation = explanations.find(e => e.hunkIndex === index);
			
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
				explanationRows.forEach(row => {
					(row as HTMLElement).style.display = '';
				});
			}
		} else {
			// Hide explanation rows
			explanationRows.forEach(row => {
				(row as HTMLElement).style.display = 'none';
			});
		}
	});

	let aiGuidance = $derived(safeParse<{ summary: string; risks: any[]; reviewQuestions: string[] }>(data.step.aiGuidanceJson, null as any, 'summary'));
	let aiSummaryHtml = $derived(aiGuidance ? parseMarkdown(aiGuidance.summary) : '');
	let aiSummaryContainer = $state<HTMLElement | null>(null);
	let aiInlineExplanations = $derived(safeParse<Array<{ hunkIndex: number; path: string; lineRange: string; explanation: string }>>(data.step.aiInlineExplanationsJson, []));

	// Debug logging
	$effect(() => {
		if (aiInlineExplanations.length > 0) {
			console.log(`Loaded ${aiInlineExplanations.length} AI inline explanations:`, aiInlineExplanations);
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

		// Add user message optimistically (will be replaced by persisted version on reload)
		const tempUserMessageId = `temp-user-${Date.now()}`;
		chatMessages = [...chatMessages, {
			id: tempUserMessageId,
			stepId: data.step.id,
			authorUserId: '',
			role: 'user' as const,
			content: userMessage,
			createdAt: new Date()
		}];

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
			let fullContent = '';

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
										msg.id === streamingMessageId
											? { ...msg, content: fullContent }
											: msg
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
									// Remove streaming message and show error
									chatMessages = chatMessages.filter((msg: any) => msg.id !== streamingMessageId);
									alert('Error: ' + parsed.error);
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
			// Remove streaming message on error
			chatMessages = chatMessages.filter((msg: any) => msg.id !== streamingMessageId);
			alert('Failed to send message: ' + (err.message || 'Unknown error'));
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

<div class="h-screen flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900 {isResizing || isResizingDiff ? 'cursor-col-resize select-none' : ''} {isResizingDiff ? 'is-resizing-diff' : ''}">
	<!-- Top Bar -->
	<header class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-3 flex justify-between items-center shrink-0">
		<div class="flex items-center gap-4">
			<a href="/app/sessions/{data.session.id}" class="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200" aria-label="Back to session plan">
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
			</a>
			<div>
				<div class="flex items-center gap-2">
					<h1 class="font-bold text-lg leading-tight dark:text-gray-100">{data.step.title}</h1>
					<span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-medium">Step {data.currentStepNumber} of {data.totalSteps}</span>
				</div>
				<p class="text-xs text-gray-500 dark:text-gray-400">{data.repo.owner}/{data.repo.name} • PR #{data.pr.number}</p>
			</div>
		</div>

		<div class="flex items-center gap-4">
			<div class="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
				{#if data.prevStepId}
					<a 
						href="/app/sessions/{data.session.id}/steps/{data.prevStepId}" 
						class="p-1.5 hover:bg-white dark:hover:bg-gray-700 rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-all"
						title="Previous Step"
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
					</a>
				{:else}
					<span class="p-1.5 text-gray-300 dark:text-gray-600 cursor-not-allowed">
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
					</span>
				{/if}

				{#if data.nextStepId}
					<a 
						href="/app/sessions/{data.session.id}/steps/{data.nextStepId}" 
						class="p-1.5 hover:bg-white dark:hover:bg-gray-700 rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-all"
						title="Next Step"
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
					</a>
				{:else}
					<a 
						href="/app/sessions/{data.session.id}/wrap-up" 
						class="p-1.5 hover:bg-white dark:hover:bg-gray-700 rounded-md text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-all"
						title="Finish Review"
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
					</a>
				{/if}
			</div>

			<div class="h-6 w-px bg-gray-200 dark:bg-gray-700"></div>

			<form method="POST" action="?/updateStatus" use:enhance>
				<select 
					name="status" 
					class="text-sm border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 rounded-md focus:ring-blue-500 py-1.5"
					onchange={(e) => e.currentTarget.form?.requestSubmit()}
				>
					<option value="not_started" selected={data.step.status === 'not_started'}>Not Started</option>
					<option value="in_progress" selected={data.step.status === 'in_progress'}>In Progress</option>
					<option value="reviewed" selected={data.step.status === 'reviewed'}>Reviewed</option>
					<option value="follow_up" selected={data.step.status === 'follow_up'}>Follow Up</option>
				</select>
			</form>
		</div>
	</header>

	<main class="flex-1 flex overflow-hidden">
		<!-- Main Content (Diff) -->
		<div class="flex-1 overflow-auto bg-gray-100 dark:bg-gray-900 p-2 md:p-4">
			<div class="w-full max-w-none">
				<div class="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
					<div class="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
						<span class="text-xs font-mono text-gray-600 dark:text-gray-400">{data.step.title}</span>
						<div class="flex items-center gap-3">
							{#if aiInlineExplanations.length > 0}
								<button
									onclick={() => showAiExplanations = !showAiExplanations}
									class="flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md transition-colors {showAiExplanations ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900/50' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'}"
									title={showAiExplanations ? 'Hide AI explanations' : 'Show AI explanations'}
								>
									<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
									</svg>
									AI Explanations
								</button>
							{/if}
							<div class="flex gap-2">
								<div class="w-2 h-2 rounded-full bg-red-400"></div>
								<div class="w-2 h-2 rounded-full bg-yellow-400"></div>
								<div class="w-2 h-2 rounded-full bg-green-400"></div>
							</div>
						</div>
					</div>
					<div 
						bind:this={diffContainer} 
						class="min-w-full overflow-x-auto diff-container"
						style="--diff-left-width: {diffSplitPercent}%; --diff-right-width: {100 - diffSplitPercent}%"
					></div>
				</div>
			</div>
		</div>

		<!-- Sidebar (Guidance & Notes) -->
		<div class="relative flex shrink-0" style="width: {sidebarWidth}px;">
			<!-- Resize Handle -->
			<button 
				class="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 transition-colors z-10 appearance-none border-none p-0 bg-transparent"
				onmousedown={startResizing}
				aria-label="Resize sidebar"
			></button>

			<aside class="flex-1 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col overflow-hidden">
				<div class="flex border-b border-gray-200 dark:border-gray-800">
					<button 
						class="flex-1 py-3 text-sm font-medium border-b-2 transition-colors {activeTab === 'guidance' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}"
						onclick={() => activeTab = 'guidance'}
					>
						Guidance
					</button>
					<button 
						class="flex-1 py-3 text-sm font-medium border-b-2 transition-colors {activeTab === 'notes' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}"
						onclick={() => activeTab = 'notes'}
					>
						Notes & Comments
					</button>
				</div>

				<div class="flex-1 flex flex-col overflow-hidden p-4 gap-4">
					{#if activeTab === 'guidance'}
						<!-- Guidance Section -->
						<div class="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden flex flex-col {guidanceExpanded ? 'flex-1 min-h-0' : 'shrink-0'}">
							<button
								onclick={() => guidanceExpanded = !guidanceExpanded}
								class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between transition-colors shrink-0"
							>
								<h2 class="text-sm font-bold uppercase text-gray-600 dark:text-gray-300 tracking-wider">Guidance</h2>
								<svg
									class="w-4 h-4 text-gray-500 transition-transform {guidanceExpanded ? 'rotate-180' : ''}"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
								</svg>
							</button>
							{#if guidanceExpanded}
								<div class="p-4 space-y-6 overflow-y-auto">
									{#if aiGuidance}
										<section>
											<h3 class="text-sm font-bold uppercase text-gray-400 dark:text-gray-500 mb-2 tracking-wider">AI Summary</h3>
											<div bind:this={aiSummaryContainer} class="prose prose-sm max-w-none text-gray-700 dark:text-gray-300">
												{@html aiSummaryHtml}
											</div>
										</section>

										{#if aiGuidance.risks?.length}
											<section>
												<h3 class="text-sm font-bold uppercase text-gray-400 dark:text-gray-500 mb-2 tracking-wider">Potential Risks</h3>
												<ul class="space-y-2">
													{#each aiGuidance.risks as risk}
														<li class="text-sm bg-red-50 dark:bg-red-900/20 border-l-4 border-red-400 dark:border-red-600 p-2 text-red-700 dark:text-red-300">
															{risk.description}
														</li>
													{/each}
												</ul>
											</section>
										{/if}

										{#if aiGuidance.reviewQuestions?.length}
											<section>
												<h3 class="text-sm font-bold uppercase text-gray-400 dark:text-gray-500 mb-2 tracking-wider">Review Checklist</h3>
												<ul class="space-y-2">
													{#each aiGuidance.reviewQuestions as question}
														<li class="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
															<input type="checkbox" class="mt-1 rounded text-blue-600 dark:bg-gray-800 dark:border-gray-700" />
															<span>{question}</span>
														</li>
													{/each}
												</ul>
											</section>
										{/if}
									{:else}
										<div class="py-12 text-center">
											<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-blue-400 mx-auto mb-4"></div>
											<p class="text-sm text-gray-500 dark:text-gray-400">Generating guidance...</p>
										</div>
									{/if}

									<section class="border-t dark:border-gray-800 pt-6">
										<h3 class="text-sm font-bold uppercase text-gray-400 dark:text-gray-500 mb-4 tracking-wider">Context Pack</h3>
										{#if data.contextPack}
											{@const items = safeParse<any[]>(data.contextPack.itemsJson, [])}
											{#if items.length === 0}
												<p class="text-sm text-gray-500 dark:text-gray-400 italic">No context items found.</p>
											{:else}
												<ul class="space-y-2">
													{#each items as item}
														<li class="text-xs bg-gray-50 dark:bg-gray-800/50 p-2 border border-gray-200 dark:border-gray-800 rounded">
															<span class="font-bold block mb-1 dark:text-gray-200">{item.type}: {item.path}</span>
															<div class="overflow-x-auto">
																<CodeHighlighter code={item.snippet} language={detectLanguage(item.path)} />
															</div>
														</li>
													{/each}
												</ul>
											{/if}
										{:else}
											<p class="text-sm text-gray-500 dark:text-gray-400 italic">Context pack loading...</p>
										{/if}
									</section>
								</div>
							{/if}
						</div>

						<!-- Chat Section -->
						<div class="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden flex flex-col {chatExpanded ? 'flex-1 min-h-0' : 'shrink-0'}">
							<button
								onclick={() => chatExpanded = !chatExpanded}
								class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between transition-colors shrink-0"
							>
								<h2 class="text-sm font-bold uppercase text-gray-600 dark:text-gray-300 tracking-wider">Chat</h2>
								<svg
									class="w-4 h-4 text-gray-500 transition-transform {chatExpanded ? 'rotate-180' : ''}"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
								</svg>
							</button>
							{#if chatExpanded}
								<div class="flex-1 flex flex-col min-h-0 overflow-hidden">
									<!-- Chat Messages -->
									<div
										bind:this={chatContainer}
										class="flex-1 overflow-y-auto p-4 space-y-4"
									>
										{#if chatMessages.length === 0}
											<div class="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
												<p>Ask questions about the code changes in this step.</p>
											</div>
										{:else}
											{#each chatMessages as message}
												<div class="flex gap-3 chat-message {message.role === 'user' ? 'justify-end' : 'justify-start'}">
													{#if message.role === 'assistant'}
														<div class="shrink-0 w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center mt-1">
															<svg class="w-4 h-4 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
															</svg>
														</div>
													{/if}
													<div class="max-w-[85%] chat-bubble {message.role === 'user' ? 'bg-blue-600 text-white rounded-2xl rounded-tr-none shadow-blue-100 dark:shadow-none' : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-100 dark:border-gray-700 rounded-2xl rounded-tl-none chat-bubble-assistant'} px-4 py-2 text-[13px] leading-relaxed">
														{#if message.role === 'assistant'}
															<div class="prose prose-sm max-w-none text-gray-800 dark:text-gray-200">
																{@html (message.content && message.content.trim() ? parseMarkdown(message.content) : (isStreaming && message.id === streamingMessageId ? '<span class="text-gray-400 italic animate-pulse">Thinking...</span>' : ''))}
															</div>
														{:else}
															<div>{message.content}</div>
														{/if}
													</div>
													{#if message.role === 'user'}
														<div class="shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center mt-1">
															<svg class="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
																<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
															</svg>
														</div>
													{/if}
												</div>
											{/each}
										{/if}
									</div>

									<!-- Chat Input -->
									<div class="border-t border-gray-100 dark:border-gray-800 p-4 bg-gray-50/50 dark:bg-gray-900/50 chat-input-container">
										<div class="flex gap-2 items-end">
											<textarea
												bind:value={chatInput}
												onkeydown={handleChatKeydown}
												placeholder="Ask a question..."
												disabled={isStreaming}
												class="flex-1 text-[13px] border-gray-200 dark:border-gray-700 rounded-xl focus:ring-blue-500 focus:border-blue-500 resize-none px-3 py-2 bg-white dark:bg-gray-800 dark:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
												rows="1"
												style="min-height: 38px; max-height: 120px;"
											></textarea>
											<button
												onclick={sendChatMessage}
												disabled={!chatInput.trim() || isStreaming}
												class="shrink-0 w-9 h-9 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-md shadow-blue-100 dark:shadow-none"
											>
												{#if isStreaming}
													<svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
														<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
														<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
													</svg>
												{:else}
													<svg class="w-4 h-4 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
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
								<h2 class="text-sm font-bold uppercase text-gray-400 dark:text-gray-500 mb-4 tracking-wider">Your Review Notes</h2>
								{#if notes.length === 0}
									<p class="text-sm text-gray-500 dark:text-gray-400 italic">No internal notes yet.</p>
								{:else}
									<ul class="space-y-4">
										{#each notes as note}
											<li class="text-sm bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-100 dark:border-yellow-900/30 rounded-md p-3">
												<div class="flex justify-between items-center mb-1">
													<span class="text-xs font-bold uppercase text-yellow-700 dark:text-yellow-400">{note.severity}</span>
													<span class="text-[10px] text-gray-400 dark:text-gray-500">{new Date(note.createdAt).toLocaleTimeString()}</span>
												</div>
												<div class="text-gray-800 dark:text-gray-200">{note.noteMarkdown}</div>
											</li>
										{/each}
									</ul>
								{/if}
							</section>

							<section class="border-t dark:border-gray-800 pt-6">
								<h2 class="text-sm font-bold uppercase text-gray-400 dark:text-gray-500 mb-4 tracking-wider">Draft PR Comments</h2>
								{#if draftComments.length === 0}
									<p class="text-sm text-gray-500 dark:text-gray-400 italic">No draft comments yet.</p>
								{:else}
									<ul class="space-y-4">
										{#each draftComments as comment}
											<li class="text-sm bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 rounded-md p-3">
												<div class="flex justify-between items-center mb-1">
													{#if comment.line}
														<span class="text-xs font-bold uppercase text-blue-700 dark:text-blue-400">Line {comment.line}</span>
													{:else}
														<span class="text-xs font-bold uppercase text-blue-700 dark:text-blue-400">General</span>
													{/if}
													<span class="text-[10px] text-gray-400 dark:text-gray-500">{comment.status}</span>
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
				<div class="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
					{#if activeTab === 'guidance'}
						{#if showNoteForm}
							<div class="space-y-3 bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
								<div>
									<label for="severity" class="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase mb-1">Severity</label>
									<select 
										id="severity"
										bind:value={noteSeverity}
										class="w-full text-sm border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 rounded-md focus:ring-blue-500 py-1"
									>
										<option value="nit">Nit</option>
										<option value="suggestion">Suggestion</option>
										<option value="concern">Concern</option>
										<option value="question">Question</option>
									</select>
								</div>
								<div>
									<label for="note" class="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase mb-1">Note (Markdown)</label>
									<textarea 
										id="note"
										bind:value={noteContent}
										placeholder="What did you find?"
										class="w-full text-sm border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded-md focus:ring-blue-500 min-h-[80px]"
									></textarea>
								</div>
								<div class="flex gap-2">
									<button 
										onclick={submitNote}
										disabled={isSubmittingNote || !noteContent.trim()}
										class="flex-1 bg-blue-600 text-white py-1.5 rounded-md hover:bg-blue-700 transition text-sm font-medium disabled:opacity-50"
									>
										{isSubmittingNote ? 'Saving...' : 'Save Note'}
									</button>
									<button 
										onclick={() => showNoteForm = false}
										class="px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300 transition text-sm font-medium"
									>
										Cancel
									</button>
								</div>
							</div>
						{:else}
							<button 
								onclick={() => showNoteForm = true}
								class="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 transition font-medium"
							>
								Add Review Note
							</button>
						{/if}
					{:else}
						{#if showCommentForm}
							<div class="space-y-3 bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
								<div>
									<label for="comment" class="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase mb-1">Comment (Markdown)</label>
									<textarea 
										id="comment"
										bind:value={commentContent}
										placeholder="Write a comment for the PR..."
										class="w-full text-sm border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded-md focus:ring-blue-500 min-h-[80px]"
									></textarea>
								</div>
								<div class="flex gap-2">
									<button 
										onclick={submitComment}
										disabled={isSubmittingComment || !commentContent.trim()}
										class="flex-1 bg-blue-600 text-white py-1.5 rounded-md hover:bg-blue-700 transition text-sm font-medium disabled:opacity-50"
									>
										{isSubmittingComment ? 'Saving...' : 'Save Comment'}
									</button>
									<button 
										onclick={() => showCommentForm = false}
										class="px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300 transition text-sm font-medium"
									>
										Cancel
									</button>
								</div>
							</div>
						{:else}
							<button 
								onclick={() => showCommentForm = true}
								class="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 transition font-medium"
							>
								New Comment
							</button>
						{/if}
					{/if}
				</div>
			</aside>
		</div>
	</main>
</div>

<style>
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
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
			'Courier New', monospace;
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
	:global(.prose h1) { font-size: 1.25rem; line-height: 1.75rem; font-weight: 700; margin-bottom: 1rem; margin-top: 1.5rem; }
	:global(.prose h2) { font-size: 1.125rem; line-height: 1.75rem; font-weight: 700; margin-bottom: 0.75rem; margin-top: 1.25rem; }
	:global(.prose h3) { font-size: 1rem; line-height: 1.5rem; font-weight: 700; margin-bottom: 0.5rem; margin-top: 1rem; }
	:global(.prose p) { margin-bottom: 0.75rem; line-height: 1.625; }
	:global(.prose ul) { list-style-type: disc; padding-left: 1.25rem; margin-bottom: 1rem; }
	:global(.prose ol) { list-style-type: decimal; padding-left: 1.25rem; margin-bottom: 1rem; }
	:global(.prose li) { margin-bottom: 0.25rem; }
	:global(.prose code) { background-color: #f3f4f6; padding: 0.125rem 0.25rem; border-radius: 0.25rem; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 0.875rem; }
	:global(.prose pre) { background-color: #111827; color: #f3f4f6; padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem; overflow-x: auto; }
	:global(.prose pre code) { background-color: transparent; padding: 0; color: inherit; font-size: inherit; }
	:global(.prose blockquote) { border-left-width: 4px; border-color: #e5e7eb; padding-left: 1rem; font-style: italic; margin-top: 1rem; margin-bottom: 1rem; }

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
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
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

		:global(.prose h1), :global(.prose h2), :global(.prose h3) { color: #f9fafb; }
		:global(.prose p), :global(.prose li) { color: #d1d5db; }
		:global(.prose code) { background-color: #374151; color: #f9fafb; }
		:global(.prose blockquote) { border-color: #374151; color: #9ca3af; }

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

	:global(.dark) :global(.prose h1), :global(.dark) :global(.prose h2), :global(.dark) :global(.prose h3) { color: #f9fafb; }
	:global(.dark) :global(.prose p), :global(.dark) :global(.prose li) { color: #d1d5db; }
	:global(.dark) :global(.prose code) { background-color: #374151; color: #f9fafb; }
	:global(.dark) :global(.prose blockquote) { border-color: #374151; color: #9ca3af; }

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
</style>

