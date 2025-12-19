<script lang="ts">
	import { safeParse } from '$lib/utils';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let prSummary = $derived(safeParse<{ overview: string }>(data.session.prSummaryJson, null as any, 'overview'));
</script>

<div class="max-w-5xl mx-auto p-6">
	<div class="flex items-center gap-4 mb-8">
		<a href="/app/repos" class="text-blue-600 hover:underline">← Repos</a>
		<h1 class="text-3xl font-bold">Review Plan: {data.pr.title}</h1>
		<span class="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm font-medium">
			#{data.pr.number}
		</span>
	</div>

	{#if data.session.isStale}
		<div class="bg-amber-50 border-l-4 border-amber-400 p-4 mb-8">
			<div class="flex">
				<div class="flex-shrink-0">
					<svg class="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
					</svg>
				</div>
				<div class="ml-3">
					<p class="text-sm text-amber-700">
						This review session is based on an older commit ({data.session.headSha.substring(0, 7)}). 
						New changes are available on GitHub.
					</p>
				</div>
			</div>
		</div>
	{/if}

	<div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
		<div class="lg:col-span-2">
			<section class="mb-8">
				<h2 class="text-xl font-semibold mb-4">Review Steps</h2>
				{#if data.steps.length === 0}
					<div class="bg-white border border-dashed border-gray-300 rounded-lg p-12 text-center">
						<div class="animate-pulse flex flex-col items-center">
							<div class="h-4 w-48 bg-gray-200 rounded mb-4"></div>
							<p class="text-gray-500">Generating review steps... this may take a minute.</p>
						</div>
					</div>
				{:else}
					<div class="space-y-4">
						{#each data.steps as step}
							<a
								href="/app/sessions/{data.session.id}/steps/{step.id}"
								class="block bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-500 transition shadow-sm"
							>
								<div class="flex justify-between items-start mb-2">
									<h3 class="font-bold text-lg">{step.orderIndex + 1}. {step.title}</h3>
									<span class="px-2 py-1 rounded text-xs font-bold uppercase" class:bg-gray-100={step.status === 'not_started'} class:bg-blue-100={step.status === 'in_progress'} class:bg-green-100={step.status === 'reviewed'}>
										{step.status.replace('_', ' ')}
									</span>
								</div>
								<div class="flex gap-2 mb-3">
									<span class="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600">Complexity: {step.complexity}</span>
									{#if step.riskTags}
										{#each safeParse(step.riskTags, []) as tag}
											<span class="text-xs bg-red-50 px-2 py-0.5 rounded text-red-600">#{tag}</span>
										{/each}
									{/if}
								</div>
								<p class="text-sm text-gray-600 line-clamp-2">
									{step.category}
								</p>
							</a>
						{/each}
					</div>
				{/if}
			</section>
		</div>

		<div class="lg:col-span-1">
			<section class="bg-white border border-gray-200 rounded-lg p-6 shadow-sm mb-8">
				<h2 class="text-lg font-semibold mb-4 border-b pb-2">PR Summary</h2>
				{#if prSummary}
					<div class="prose prose-sm max-w-none whitespace-pre-wrap text-sm text-gray-700">
						{prSummary.overview || 'AI summary not yet generated.'}
					</div>
				{:else}
					<p class="text-sm text-gray-500 italic">Summary is being generated...</p>
				{/if}
			</section>

			<section class="bg-gray-50 border border-gray-200 rounded-lg p-6">
				<h2 class="text-lg font-semibold mb-4">Metadata</h2>
				<dl class="space-y-2 text-sm">
					<div>
						<dt class="text-gray-500">Author</dt>
						<dd class="font-medium">{data.pr.authorLogin}</dd>
					</div>
					<div>
						<dt class="text-gray-500">Base</dt>
						<dd class="font-medium font-mono">{data.pr.baseRef}</dd>
					</div>
					<div>
						<dt class="text-gray-500">Head</dt>
						<dd class="font-medium font-mono">{data.pr.headRef} ({data.pr.headSha.substring(0, 7)})</dd>
					</div>
				</dl>
			</section>
		</div>
	</div>
</div>

