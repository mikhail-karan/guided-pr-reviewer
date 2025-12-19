<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<div class="max-w-4xl mx-auto p-6">
	<h1 class="text-3xl font-bold mb-6">Your GitHub Installations</h1>

	{#if data.installations.length === 0}
		<div class="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
			<p class="text-gray-600 mb-4">No GitHub installations found.</p>
			<a
				href="https://github.com/apps/{data.githubAppName}/installations/new"
				class="inline-block bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition"
			>
				Install the App
			</a>
		</div>
	{:else}
		<div class="grid gap-4">
			{#each data.installations as installation}
				<div class="bg-white border border-gray-200 rounded-lg p-4 flex justify-between items-center shadow-sm">
					<div>
						<h2 class="font-semibold text-lg">{installation.accountLogin}</h2>
						<p class="text-sm text-gray-500">ID: {installation.installationId}</p>
					</div>
					<a
						href="/app/repos/{installation.id}"
						class="bg-gray-800 text-white px-4 py-2 rounded hover:bg-black transition"
					>
						View Repos
					</a>
				</div>
			{/each}
		</div>
	{/if}
</div>

