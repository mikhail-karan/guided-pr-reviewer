<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import { safeParse } from '$lib/utils';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let prSummary = $derived(
		safeParse<{ overview: string }>(data.session.prSummaryJson, null as any, 'overview')
	);
	let showConfigMenu = $state(false);
	let isRegenerating = $state(false);
	let regenerateMessage = $state<string | null>(null);
	let isRefreshing = $state(false);
	let refreshMessage = $state<string | null>(null);

	// -- Polling for step generation --
	let pollInterval = $state<ReturnType<typeof setInterval> | null>(null);
	let pollTimeoutId = $state<ReturnType<typeof setTimeout> | null>(null);
	let pollTimedOut = $state(false);

	function startPolling() {
		if (pollInterval) return;
		pollTimedOut = false;

		pollTimeoutId = setTimeout(() => {
			stopPolling();
			pollTimedOut = true;
		}, 120_000); // 2 minutes

		pollInterval = setInterval(async () => {
			try {
				const res = await fetch(`/api/sessions/${data.session.id}/status`);
				const { stepCount } = await res.json();
				if (stepCount > 0) {
					stopPolling();
					invalidateAll();
				}
			} catch {
				// Silently retry on network errors
			}
		}, 3000);
	}

	function stopPolling() {
		if (pollInterval) {
			clearInterval(pollInterval);
			pollInterval = null;
		}
		if (pollTimeoutId) {
			clearTimeout(pollTimeoutId);
			pollTimeoutId = null;
		}
	}

	onMount(() => {
		if (data.steps.length === 0) {
			startPolling();
		}
	});

	onDestroy(() => {
		stopPolling();
		stopRefreshPolling();
	});

	type SortOption = 'default' | 'impact' | 'complexity';
	let sortBy = $state<SortOption>('impact');

	const complexityOrder = { S: 1, M: 2, L: 3 };

	let sortedSteps = $derived(
		[...data.steps].sort((a, b) => {
			if (sortBy === 'impact') {
				const aImpact = safeParse<string[]>(a.riskTags, []).includes('high-impact') ? 1 : 0;
				const bImpact = safeParse<string[]>(b.riskTags, []).includes('high-impact') ? 1 : 0;
				if (aImpact !== bImpact) return bImpact - aImpact;
				// Fallback to complexity if impact is same
				const aComp = complexityOrder[a.complexity as keyof typeof complexityOrder] || 0;
				const bComp = complexityOrder[b.complexity as keyof typeof complexityOrder] || 0;
				if (aComp !== bComp) return bComp - aComp;
				return a.orderIndex - b.orderIndex;
			} else if (sortBy === 'complexity') {
				const aComp = complexityOrder[a.complexity as keyof typeof complexityOrder] || 0;
				const bComp = complexityOrder[b.complexity as keyof typeof complexityOrder] || 0;
				if (aComp !== bComp) return bComp - aComp;
				// Fallback to impact if complexity is same
				const aImpact = safeParse<string[]>(a.riskTags, []).includes('high-impact') ? 1 : 0;
				const bImpact = safeParse<string[]>(b.riskTags, []).includes('high-impact') ? 1 : 0;
				if (aImpact !== bImpact) return bImpact - aImpact;
				return a.orderIndex - b.orderIndex;
			}
			return a.orderIndex - b.orderIndex;
		})
	);

	async function refreshToLatest() {
		isRefreshing = true;
		refreshMessage = null;

		try {
			const res = await fetch(`/api/sessions/${data.session.id}/refresh`, { method: 'POST' });
			const body = await res.json();

			if (!res.ok) {
				refreshMessage = body.message || 'Failed to refresh session';
				return;
			}

			if (!body.refreshed) {
				refreshMessage = body.message || 'Already on latest commit';
				invalidateAll();
				return;
			}

			refreshMessage = 'Refreshing to latest commit...';
			invalidateAll();

			// Poll until step regeneration completes (stepCount goes to 0 then back up)
			let waitingForSteps = false;
			const timeout = setTimeout(() => {
				stopRefreshPolling();
				refreshMessage = null;
				isRefreshing = false;
				invalidateAll();
			}, 120_000);

			const poll = setInterval(async () => {
				try {
					const statusRes = await fetch(`/api/sessions/${data.session.id}/status`);
					const { stepCount } = await statusRes.json();
					if (stepCount === 0) waitingForSteps = true;
					if (stepCount > 0 && waitingForSteps) {
						stopRefreshPolling();
						refreshMessage = null;
						isRefreshing = false;
						invalidateAll();
					}
				} catch {
					// Silently retry
				}
			}, 3000);

			refreshPollCleanup = () => {
				clearInterval(poll);
				clearTimeout(timeout);
			};
		} catch (err) {
			refreshMessage = err instanceof Error ? err.message : 'Failed to refresh session';
		} finally {
			if (!refreshMessage?.includes('Refreshing')) {
				isRefreshing = false;
			}
		}
	}

	let refreshPollCleanup = $state<(() => void) | null>(null);

	function stopRefreshPolling() {
		if (refreshPollCleanup) {
			refreshPollCleanup();
			refreshPollCleanup = null;
		}
	}

	async function regenerateAiGuidance() {
		isRegenerating = true;
		regenerateMessage = null;
		showConfigMenu = false;

		try {
			const res = await fetch(`/api/sessions/${data.session.id}/regenerate-guidance`, {
				method: 'POST'
			});

			if (res.ok) {
				regenerateMessage = 'AI guidance regeneration queued. This may take a few minutes.';
				// Refresh the page after a short delay to show updated data
				setTimeout(() => {
					window.location.reload();
				}, 2000);
			} else {
				const error = await res.json();
				regenerateMessage = `Error: ${error.message || 'Failed to regenerate guidance'}`;
			}
		} catch (err) {
			regenerateMessage = `Error: ${err instanceof Error ? err.message : 'Failed to regenerate guidance'}`;
		} finally {
			isRegenerating = false;
		}
	}
</script>

<div class="mx-auto max-w-5xl p-6">
	<div class="mb-8 flex items-center justify-between">
		<div class="flex items-center gap-4">
			<a
				href="/app/repos/{data.repo.installationId}"
				class="text-blue-600 hover:underline dark:text-blue-400">← Repos</a
			>
			<h1 class="text-3xl font-bold dark:text-gray-100">Review Plan: {data.pr.title}</h1>
			<span
				class="rounded-full border border-gray-200 bg-gray-100 px-3 py-1 text-sm font-medium text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
			>
				#{data.pr.number}
			</span>
		</div>
		<div class="relative">
			<button
				onclick={() => (showConfigMenu = !showConfigMenu)}
				class="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
				title="Session settings"
				aria-label="Session settings"
			>
				<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
					/>
				</svg>
			</button>

			{#if showConfigMenu}
				<div
					class="absolute right-0 z-10 mt-2 w-64 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
				>
					<div class="p-2">
						<button
							onclick={regenerateAiGuidance}
							disabled={isRegenerating}
							class="flex w-full items-center gap-2 rounded-md px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-700"
						>
							{#if isRegenerating}
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
								<span>Regenerating...</span>
							{:else}
								<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
									/>
								</svg>
								<span>Regenerate AI Guidance</span>
							{/if}
						</button>
					</div>
					<div class="border-t border-gray-200 p-2 dark:border-gray-700">
						<p class="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
							This will regenerate AI summaries and inline diff explanations for all steps.
						</p>
					</div>
				</div>
			{/if}
		</div>
	</div>

	{#if regenerateMessage}
		<div
			class="mb-6 rounded-lg p-4 {regenerateMessage.includes('Error')
				? 'border border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300'
				: 'border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300'}"
		>
			<div class="flex items-center gap-2">
				{#if regenerateMessage.includes('Error')}
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
				{:else}
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
				{/if}
				<p class="text-sm font-medium">{regenerateMessage}</p>
			</div>
		</div>
	{/if}

	{#if data.session.isStale}
		<div
			class="mb-8 border-l-4 border-amber-400 bg-amber-50 p-4 dark:border-amber-600 dark:bg-amber-900/20"
		>
			<div class="flex items-start justify-between gap-4">
				<div class="flex">
					<div class="shrink-0">
						<svg
							class="h-5 w-5 text-amber-400 dark:text-amber-500"
							viewBox="0 0 20 20"
							fill="currentColor"
						>
							<path
								fill-rule="evenodd"
								d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
								clip-rule="evenodd"
							/>
						</svg>
					</div>
					<div class="ml-3">
						<p class="text-sm text-amber-700 dark:text-amber-300">
							This review session is based on an older commit ({data.session.headSha.substring(
								0,
								7
							)}). New changes are available on GitHub.
						</p>
					</div>
				</div>
				<button
					onclick={refreshToLatest}
					disabled={isRefreshing}
					class="flex shrink-0 items-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-amber-400"
				>
					{#if isRefreshing}
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
						<span>Refreshing...</span>
					{:else}
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
							/>
						</svg>
						<span>Refresh to latest commit</span>
					{/if}
				</button>
			</div>
			{#if refreshMessage}
				<p class="mt-2 ml-8 text-sm text-amber-600 dark:text-amber-400">{refreshMessage}</p>
			{/if}
		</div>
	{/if}

	<div class="grid grid-cols-1 gap-8 lg:grid-cols-3">
		<div class="lg:col-span-2">
			<section class="mb-8">
				<div class="mb-4 flex items-center justify-between">
					<h2 class="text-xl font-semibold dark:text-gray-100">Review Steps</h2>
					<div class="flex items-center gap-2">
						<span
							class="text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400"
							>Sort by:</span
						>
						<div class="flex rounded-md bg-gray-100 p-1 dark:bg-gray-800">
							<button
								onclick={() => (sortBy = 'default')}
								class="rounded px-3 py-1 text-xs font-medium {sortBy === 'default'
									? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400'
									: 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'}"
							>
								Order
							</button>
							<button
								onclick={() => (sortBy = 'impact')}
								class="rounded px-3 py-1 text-xs font-medium {sortBy === 'impact'
									? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400'
									: 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'}"
							>
								Impact
							</button>
							<button
								onclick={() => (sortBy = 'complexity')}
								class="rounded px-3 py-1 text-xs font-medium {sortBy === 'complexity'
									? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400'
									: 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'}"
							>
								Complexity
							</button>
						</div>
					</div>
				</div>

				{#if data.steps.length === 0}
					<div
						class="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center dark:border-gray-700 dark:bg-gray-800"
					>
						{#if pollTimedOut}
							<div class="flex flex-col items-center">
								<svg
									class="mb-4 h-10 w-10 text-amber-400 dark:text-amber-500"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
								<p class="mb-2 font-medium text-gray-700 dark:text-gray-300">
									Step generation is taking longer than expected.
								</p>
								<p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
									There may have been an issue processing this PR. You can try waiting a bit longer.
								</p>
								<button
									onclick={() => startPolling()}
									class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
								>
									Retry
								</button>
							</div>
						{:else}
							<div class="flex animate-pulse flex-col items-center">
								<div class="mb-4 h-4 w-48 rounded bg-gray-200 dark:bg-gray-700"></div>
								<p class="text-gray-500 dark:text-gray-400">
									Generating review steps... this may take a minute.
								</p>
							</div>
						{/if}
					</div>
				{:else}
					<div class="space-y-4">
						{#each sortedSteps as step}
							<a
								href="/app/sessions/{data.session.id}/steps/{step.id}"
								class="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-400"
							>
								<div class="mb-2 flex flex-wrap items-start justify-between gap-2">
									<h3 class="min-w-0 flex-1 wrap-anywhere text-lg font-bold dark:text-gray-100">
										{step.orderIndex + 1}. {step.title}
									</h3>
									<span
										class="shrink-0 rounded px-2 py-1 text-xs font-bold uppercase {step.status ===
										'not_started'
											? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
											: step.status === 'in_progress'
												? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
												: step.status === 'reviewed'
													? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
													: ''}"
									>
										{step.status.replace('_', ' ')}
									</span>
								</div>
								<div class="mb-3 flex gap-2">
									<span
										class="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-400"
										>Complexity: {step.complexity}</span
									>
									{#if step.riskTags}
										{#each safeParse(step.riskTags, []) as tag}
											<span
												class="rounded bg-red-50 px-2 py-0.5 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400"
												>#{tag}</span
											>
										{/each}
									{/if}
								</div>
								<p class="line-clamp-2 text-sm text-gray-600 dark:text-gray-400">
									{step.category}
								</p>
							</a>
						{/each}
					</div>
				{/if}
			</section>
		</div>

		<div class="lg:col-span-1">
			<section
				class="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800"
			>
				<h2
					class="mb-4 border-b pb-2 text-lg font-semibold dark:border-gray-700 dark:text-gray-100"
				>
					PR Summary
				</h2>
				{#if prSummary}
					<div
						class="prose prose-sm max-w-none text-sm whitespace-pre-wrap text-gray-700 dark:text-gray-300"
					>
						{prSummary.overview || 'AI summary not yet generated.'}
					</div>
				{:else}
					<p class="text-sm text-gray-500 italic dark:text-gray-400">
						Summary is being generated...
					</p>
				{/if}
			</section>

			<section
				class="rounded-lg border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-900/50"
			>
				<h2 class="mb-4 text-lg font-semibold dark:text-gray-100">Metadata</h2>
				<dl class="space-y-2 text-sm">
					<div>
						<dt class="text-gray-500 dark:text-gray-400">Author</dt>
						<dd class="font-medium dark:text-gray-200">{data.pr.authorLogin}</dd>
					</div>
					<div>
						<dt class="text-gray-500 dark:text-gray-400">Base</dt>
						<dd class="font-mono font-medium dark:text-gray-200">{data.pr.baseRef}</dd>
					</div>
					<div>
						<dt class="text-gray-500 dark:text-gray-400">Head</dt>
						<dd class="font-mono font-medium dark:text-gray-200">
							{data.pr.headRef} ({data.pr.headSha.substring(0, 7)})
						</dd>
					</div>
				</dl>
			</section>
		</div>
	</div>
</div>

{#if showConfigMenu}
	<button
		type="button"
		class="fixed inset-0 z-0 bg-transparent"
		onclick={() => (showConfigMenu = false)}
		onkeydown={(e) => e.key === 'Escape' && (showConfigMenu = false)}
		aria-label="Close menu"
	></button>
{/if}
