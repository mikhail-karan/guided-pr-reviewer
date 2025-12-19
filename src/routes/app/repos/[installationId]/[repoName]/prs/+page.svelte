<script lang="ts">
	import type { PageData } from './$types';

	import { enhance } from '$app/forms';
	let { data }: { data: PageData } = $props();

	function getSessionForPR(prNumber: number, headSha: string) {
		return data.sessions.find(s => s.prNumber === prNumber && s.headSha === headSha);
	}
</script>

<div class="max-w-4xl mx-auto p-6">
	<div class="flex items-center gap-4 mb-6">
		<a href="/app/repos/{data.installation.id}" class="text-blue-600 hover:underline">← Back</a>
		<h1 class="text-3xl font-bold">Open PRs for {data.repoName}</h1>
	</div>

	<div class="grid gap-4">
		{#each data.pulls as pr}
			{@const session = getSessionForPR(pr.number, pr.head.sha)}
			<div class="bg-white border border-gray-200 rounded-lg p-4 flex justify-between items-center shadow-sm">
				<div>
					<h2 class="font-semibold text-lg">#{pr.number} {pr.title}</h2>
					<p class="text-sm text-gray-500">
						by <span class="font-medium">{pr.user?.login}</span> • 
						{pr.changed_files} files changed • 
						{pr.additions} insertions(+), {pr.deletions} deletions(-)
					</p>
				</div>
				<div class="flex gap-2">
					{#if session}
						<a
							href="/app/sessions/{session.id}"
							class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
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
								class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
							>
								Start Review
							</button>
						</form>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>

