<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<div class="max-w-4xl mx-auto p-6">
	<div class="flex justify-between items-center mb-6">
		<h1 class="text-3xl font-bold dark:text-gray-50">Your GitHub Installations</h1>
		<div class="flex gap-2">
			{#if !data.userTokenValid}
				<a 
					href="/auth/github" 
					class="text-sm bg-yellow-100 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:hover:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200 px-4 py-2 rounded-md transition border border-yellow-200 dark:border-yellow-800"
				>
					Reconnect GitHub
				</a>
			{/if}
			<button 
				onclick={() => window.location.reload()} 
				class="text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-md transition"
			>
				Refresh List
			</button>
			<a
				href="https://github.com/apps/{data.githubAppName}/installations/new"
				class="inline-block bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 transition"
			>
				Add Installation
			</a>
		</div>
	</div>

	{#if data.installations.length === 0}
		<div class="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-lg p-8 text-center">
			<p class="text-gray-600 dark:text-gray-400 mb-4">No GitHub installations found.</p>
			<p class="text-sm text-gray-500 dark:text-gray-500 mb-6">
				Install the GitHub App on your personal account or an organization to get started.
			</p>
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
				<div
					class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 flex justify-between items-center shadow-sm"
				>
					<div class="flex items-center gap-4">
						<div
							class="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="lucide lucide-github"
								><path
									d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"
								/><path d="M9 18c-4.51 2-5-2-7-2" /></svg
							>
						</div>
						<div>
							<h2 class="font-semibold text-lg dark:text-gray-100">{installation.accountLogin}</h2>
							<p class="text-sm text-gray-500 dark:text-gray-400">Installation ID: {installation.installationId}</p>
						</div>
					</div>
					<div class="flex gap-2">
						<a
							href="https://github.com/apps/{data.githubAppName}/installations/new"
							class="text-sm text-blue-600 dark:text-blue-400 hover:underline mr-4"
						>
							Configure
						</a>
						<a
							href="/app/repos/{installation.id}"
							class="bg-gray-800 dark:bg-gray-700 text-white px-4 py-2 rounded hover:bg-black dark:hover:bg-gray-600 transition"
						>
							View Repos
						</a>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

