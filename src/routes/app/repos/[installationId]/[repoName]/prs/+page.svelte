<script lang="ts">
	import type { PageData } from './$types';

	import { enhance } from '$app/forms';
	let { data }: { data: PageData } = $props();
	const isClosedView = () => data.state === 'closed';

	function getSessionForPR(prNumber: number, headSha: string) {
		return data.sessions.find((s) => s.prNumber === prNumber && s.headSha === headSha);
	}
</script>

<div class="mx-auto max-w-4xl p-6">
	<div class="mb-6 flex items-center gap-4">
		<a
			href="/app/repos/{data.installation.id}"
			class="text-blue-600 hover:underline dark:text-blue-400">← Back</a
		>
		<h1 class="text-3xl font-bold dark:text-gray-100">
			{isClosedView() ? 'Closed PRs' : 'Active PRs'} for {data.repoName}
		</h1>
	</div>

	<div class="mb-4 inline-flex rounded-lg border border-gray-200 p-1 dark:border-gray-700">
		<a
			href="/app/repos/{data.installation.id}/{data.repoName}/prs?state=open"
			class={`rounded-md px-3 py-1.5 text-sm transition ${
				!isClosedView()
					? 'bg-blue-600 text-white dark:bg-blue-500'
					: 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
			}`}
		>
			Active
		</a>
		<a
			href="/app/repos/{data.installation.id}/{data.repoName}/prs?state=closed"
			class={`rounded-md px-3 py-1.5 text-sm transition ${
				isClosedView()
					? 'bg-blue-600 text-white dark:bg-blue-500'
					: 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
			}`}
		>
			Closed
		</a>
	</div>

	<div class="grid gap-4">
		{#if data.pulls.length === 0}
			<div
				class="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300"
			>
				No {isClosedView() ? 'closed' : 'active'} pull requests found.
			</div>
		{:else}
			{#each data.pulls as pr}
				{@const session = getSessionForPR(pr.number, pr.head.sha)}
				{@const prMetrics = pr as { changed_files?: number; additions?: number; deletions?: number }}
				<div
					class="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
				>
					<div>
						<h2 class="text-lg font-semibold dark:text-gray-100">#{pr.number} {pr.title}</h2>
						<p class="text-sm text-gray-500 dark:text-gray-400">
							by <span class="font-medium dark:text-gray-300">{pr.user?.login}</span> •
							{prMetrics.changed_files ?? 0} files changed •
							{prMetrics.additions ?? 0} insertions(+), {prMetrics.deletions ?? 0} deletions(-)
						</p>
					</div>
					<div class="flex gap-2">
						{#if session}
							<a
								href="/app/sessions/{session.id}"
								class="rounded bg-green-600 px-4 py-2 text-white transition hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600"
							>
								Continue Review
							</a>
						{:else}
							<form action="?/startReview" method="POST" use:enhance>
								<input type="hidden" name="installationId" value={data.installation.id} />
								<input type="hidden" name="owner" value={data.installation.accountLogin} />
								<input type="hidden" name="repo" value={data.repoName} />
								<input type="hidden" name="prNumber" value={pr.number} />
								<button
									type="submit"
									class="rounded bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
								>
									Start Review
								</button>
							</form>
						{/if}
					</div>
				</div>
			{/each}
		{/if}
	</div>
</div>
