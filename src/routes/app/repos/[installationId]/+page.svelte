<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<div class="max-w-4xl mx-auto p-6">
	<div class="flex items-center gap-4 mb-6">
		<a href="/app" class="text-blue-600 hover:underline">← Back</a>
		<h1 class="text-3xl font-bold">Repositories for {data.installation.accountLogin}</h1>
	</div>

	<div class="grid gap-4">
		{#each data.repositories as repo}
			<div class="bg-white border border-gray-200 rounded-lg p-4 flex justify-between items-center shadow-sm">
				<div>
					<h2 class="font-semibold text-lg">{repo.name}</h2>
					<p class="text-sm text-gray-500">{repo.description || 'No description'}</p>
				</div>
				<a
					href="/app/repos/{data.installation.id}/{repo.name}/prs"
					class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
				>
					View PRs
				</a>
			</div>
		{/each}
	</div>
</div>

