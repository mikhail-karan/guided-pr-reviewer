<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import * as Diff2Html from 'diff2html';
	import 'diff2html/bundles/css/diff2html.min.css';
	import { marked } from 'marked';
	import { safeParse } from '$lib/utils';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let notes = $state(data.notes);
	let draftComments = $state(data.draftComments);

	let diffContainer: HTMLElement;
	let activeTab = $state('guidance');
	let sidebarWidth = $state(400);
	let isResizing = $state(false);

	function startResizing(e: MouseEvent) {
		isResizing = true;
		e.preventDefault();
	}

	function handleMouseMove(e: MouseEvent) {
		if (!isResizing) return;
		const newWidth = window.innerWidth - e.clientX;
		if (newWidth > 300 && newWidth < 800) {
			sidebarWidth = newWidth;
		}
	}

	function stopResizing() {
		isResizing = false;
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
			diffContainer.innerHTML = html;
		}
	});

	let aiGuidance = $derived(safeParse<{ summary: string; risks: any[]; reviewQuestions: string[] }>(data.step.aiGuidanceJson, null as any, 'summary'));
	let aiSummaryHtml = $derived(aiGuidance ? marked.parse(aiGuidance.summary) : '');

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
</script>

<div class="h-screen flex flex-col overflow-hidden bg-gray-50 {isResizing ? 'cursor-col-resize select-none' : ''}">
	<!-- Top Bar -->
	<header class="bg-white border-b border-gray-200 px-6 py-3 flex justify-between items-center shrink-0">
		<div class="flex items-center gap-4">
			<a href="/app/sessions/{data.session.id}" class="text-gray-500 hover:text-gray-800" aria-label="Back to session plan">
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
			</a>
			<div>
				<div class="flex items-center gap-2">
					<h1 class="font-bold text-lg leading-tight">{data.step.title}</h1>
					<span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">Step {data.currentStepNumber} of {data.totalSteps}</span>
				</div>
				<p class="text-xs text-gray-500">{data.repo.owner}/{data.repo.name} • PR #{data.pr.number}</p>
			</div>
		</div>

		<div class="flex items-center gap-4">
			<div class="flex items-center bg-gray-100 rounded-lg p-1">
				{#if data.prevStepId}
					<a 
						href="/app/sessions/{data.session.id}/steps/{data.prevStepId}" 
						class="p-1.5 hover:bg-white rounded-md text-gray-500 hover:text-gray-800 transition-all"
						title="Previous Step"
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
					</a>
				{:else}
					<span class="p-1.5 text-gray-300 cursor-not-allowed">
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
					</span>
				{/if}

				{#if data.nextStepId}
					<a 
						href="/app/sessions/{data.session.id}/steps/{data.nextStepId}" 
						class="p-1.5 hover:bg-white rounded-md text-gray-500 hover:text-gray-800 transition-all"
						title="Next Step"
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
					</a>
				{:else}
					<a 
						href="/app/sessions/{data.session.id}/wrap-up" 
						class="p-1.5 hover:bg-white rounded-md text-blue-600 hover:text-blue-800 transition-all"
						title="Finish Review"
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
					</a>
				{/if}
			</div>

			<div class="h-6 w-px bg-gray-200"></div>

			<form method="POST" action="?/updateStatus" use:enhance>
				<select 
					name="status" 
					class="text-sm border-gray-300 rounded-md focus:ring-blue-500 py-1.5"
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
		<div class="flex-1 overflow-auto bg-gray-100 p-4 md:p-8">
			<div class="w-full max-w-[1400px] mx-auto">
				<div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
					<div class="px-4 py-2 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
						<span class="text-xs font-mono text-gray-600">{data.step.title}</span>
						<div class="flex gap-2">
							<div class="w-2 h-2 rounded-full bg-red-400"></div>
							<div class="w-2 h-2 rounded-full bg-yellow-400"></div>
							<div class="w-2 h-2 rounded-full bg-green-400"></div>
						</div>
					</div>
					<div bind:this={diffContainer} class="min-w-full overflow-x-auto"></div>
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

			<aside class="flex-1 border-l border-gray-200 bg-white flex flex-col overflow-hidden">
				<div class="flex border-b border-gray-200">
					<button 
						class="flex-1 py-3 text-sm font-medium border-b-2 transition-colors {activeTab === 'guidance' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'}"
						onclick={() => activeTab = 'guidance'}
					>
						Guidance
					</button>
					<button 
						class="flex-1 py-3 text-sm font-medium border-b-2 transition-colors {activeTab === 'notes' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'}"
						onclick={() => activeTab = 'notes'}
					>
						Notes & Comments
					</button>
				</div>

				<div class="flex-1 overflow-auto p-4 space-y-6">
					{#if activeTab === 'guidance'}
						{#if aiGuidance}
							<section>
								<h2 class="text-sm font-bold uppercase text-gray-400 mb-2 tracking-wider">AI Summary</h2>
								<div class="prose prose-sm max-w-none text-gray-700">
									{@html aiSummaryHtml}
								</div>
							</section>

							{#if aiGuidance.risks?.length}
								<section>
									<h2 class="text-sm font-bold uppercase text-gray-400 mb-2 tracking-wider">Potential Risks</h2>
									<ul class="space-y-2">
										{#each aiGuidance.risks as risk}
											<li class="text-sm bg-red-50 border-l-4 border-red-400 p-2 text-red-700">
												{risk.description}
											</li>
										{/each}
									</ul>
								</section>
							{/if}

							{#if aiGuidance.reviewQuestions?.length}
								<section>
									<h2 class="text-sm font-bold uppercase text-gray-400 mb-2 tracking-wider">Review Checklist</h2>
									<ul class="space-y-2">
										{#each aiGuidance.reviewQuestions as question}
											<li class="flex items-start gap-2 text-sm text-gray-700">
												<input type="checkbox" class="mt-1 rounded text-blue-600" />
												<span>{question}</span>
											</li>
										{/each}
									</ul>
								</section>
							{/if}
						{:else}
							<div class="py-12 text-center">
								<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
								<p class="text-sm text-gray-500">Generating guidance...</p>
							</div>
						{/if}

						<section class="border-t pt-6">
							<h2 class="text-sm font-bold uppercase text-gray-400 mb-4 tracking-wider">Context Pack</h2>
							{#if data.contextPack}
								{@const items = safeParse<any[]>(data.contextPack.itemsJson, [])}
								{#if items.length === 0}
									<p class="text-sm text-gray-500 italic">No context items found.</p>
								{:else}
									<ul class="space-y-2">
										{#each items as item}
											<li class="text-xs bg-gray-50 p-2 border border-gray-200 rounded">
												<span class="font-bold block mb-1">{item.type}: {item.path}</span>
												<code class="text-gray-600 block truncate">{item.snippet}</code>
											</li>
										{/each}
									</ul>
								{/if}
							{:else}
								<p class="text-sm text-gray-500 italic">Context pack loading...</p>
							{/if}
						</section>
					{:else}
						<!-- Notes & Comments Tab -->
						<div class="space-y-6">
							<section>
								<h2 class="text-sm font-bold uppercase text-gray-400 mb-4 tracking-wider">Your Review Notes</h2>
								{#if notes.length === 0}
									<p class="text-sm text-gray-500 italic">No internal notes yet.</p>
								{:else}
									<ul class="space-y-4">
										{#each notes as note}
											<li class="text-sm bg-yellow-50 border border-yellow-100 rounded-md p-3">
												<div class="flex justify-between items-center mb-1">
													<span class="text-xs font-bold uppercase text-yellow-700">{note.severity}</span>
													<span class="text-[10px] text-gray-400">{new Date(note.createdAt).toLocaleTimeString()}</span>
												</div>
												<div class="text-gray-800">{note.noteMarkdown}</div>
											</li>
										{/each}
									</ul>
								{/if}
							</section>

							<section class="border-t pt-6">
								<h2 class="text-sm font-bold uppercase text-gray-400 mb-4 tracking-wider">Draft PR Comments</h2>
								{#if draftComments.length === 0}
									<p class="text-sm text-gray-500 italic">No draft comments yet.</p>
								{:else}
									<ul class="space-y-4">
										{#each draftComments as comment}
											<li class="text-sm bg-blue-50 border border-blue-100 rounded-md p-3">
												<div class="flex justify-between items-center mb-1">
													{#if comment.line}
														<span class="text-xs font-bold uppercase text-blue-700">Line {comment.line}</span>
													{:else}
														<span class="text-xs font-bold uppercase text-blue-700">General</span>
													{/if}
													<span class="text-[10px] text-gray-400">{comment.status}</span>
												</div>
												<div class="text-gray-800">{comment.bodyMarkdown}</div>
											</li>
										{/each}
									</ul>
								{/if}
							</section>
						</div>
					{/if}
				</div>

				<!-- Quick Comment Bar -->
				<div class="p-4 border-t border-gray-200 bg-gray-50">
					{#if activeTab === 'guidance'}
						{#if showNoteForm}
							<div class="space-y-3 bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
								<div>
									<label for="severity" class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Severity</label>
									<select 
										id="severity"
										bind:value={noteSeverity}
										class="w-full text-sm border-gray-300 rounded-md focus:ring-blue-500 py-1"
									>
										<option value="nit">Nit</option>
										<option value="suggestion">Suggestion</option>
										<option value="concern">Concern</option>
										<option value="question">Question</option>
									</select>
								</div>
								<div>
									<label for="note" class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Note (Markdown)</label>
									<textarea 
										id="note"
										bind:value={noteContent}
										placeholder="What did you find?"
										class="w-full text-sm border-gray-300 rounded-md focus:ring-blue-500 min-h-[80px]"
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
										class="px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50 transition text-sm font-medium"
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
							<div class="space-y-3 bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
								<div>
									<label for="comment" class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Comment (Markdown)</label>
									<textarea 
										id="comment"
										bind:value={commentContent}
										placeholder="Write a comment for the PR..."
										class="w-full text-sm border-gray-300 rounded-md focus:ring-blue-500 min-h-[80px]"
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
										class="px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50 transition text-sm font-medium"
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
	}

	:global(.d2h-file-side-diff) {
		margin-bottom: 0 !important;
	}

	:global(.d2h-code-line) {
		padding: 0 8px !important;
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
</style>

