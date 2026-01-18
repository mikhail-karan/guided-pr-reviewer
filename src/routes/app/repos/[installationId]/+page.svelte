<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<div class="max-w-4xl mx-auto p-6">
	<div class="flex items-center justify-between mb-6">
		<div class="flex items-center gap-4">
			<a href="/app" class="text-blue-600 dark:text-blue-400 hover:underline">← Back</a>
			<h1 class="text-3xl font-bold dark:text-gray-100">Repositories for {data.installation.accountLogin}</h1>
		</div>
		<a
			href="https://github.com/settings/installations/{data.installation.installationId}"
			target="_blank"
			rel="noopener noreferrer"
			class="text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-md transition"
		>
			Manage Repositories
		</a>
	</div>

	<div class="grid gap-4">
		{#each data.repositories as repo}
			<div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 flex justify-between items-center shadow-sm">
				<div>
					<h2 class="font-semibold text-lg dark:text-gray-100">{repo.name}</h2>
					<p class="text-sm text-gray-500 dark:text-gray-400">{repo.description || 'No description'}</p>
				</div>
				<a
					href="/app/repos/{data.installation.id}/{repo.name}/prs"
					class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 transition"
				>
					View PRs
				</a>
			</div>
		{/each}
	</div>
</div>


