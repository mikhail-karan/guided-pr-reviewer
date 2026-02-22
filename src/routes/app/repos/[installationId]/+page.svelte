<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<div class="mx-auto max-w-4xl p-6">
	<div class="mb-6 flex items-center justify-between">
		<div class="flex items-center gap-4">
			<a href="/app" class="text-blue-600 hover:underline dark:text-blue-400">← Back</a>
			<h1 class="text-3xl font-bold dark:text-gray-100">
				Repositories for {data.installation.accountLogin}
			</h1>
		</div>
		<a
			href="https://github.com/settings/installations/{data.installation.installationId}"
			target="_blank"
			rel="noopener noreferrer"
			class="rounded-md bg-gray-100 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
		>
			Manage Repositories
		</a>
	</div>

	<div class="grid gap-4">
		{#each data.repositories as repo}
			<div
				class="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
			>
				<div>
					<h2 class="text-lg font-semibold dark:text-gray-100">{repo.name}</h2>
					<p class="text-sm text-gray-500 dark:text-gray-400">
						{repo.description || 'No description'}
					</p>
				</div>
				<a
					href="/app/repos/{data.installation.id}/{repo.name}/prs"
					class="rounded bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
				>
					View PRs
				</a>
			</div>
		{/each}
	</div>
</div>
