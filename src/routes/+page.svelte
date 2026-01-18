<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<div class="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-white flex flex-col items-center justify-center p-6 text-center transition-colors duration-300">
	<div class="max-w-3xl">
		<h1 class="text-5xl font-extrabold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-emerald-600 dark:from-blue-400 dark:to-emerald-400">
			Guided PR Reviewer
		</h1>
		<p class="text-xl text-gray-600 dark:text-gray-400 mb-12">
			Stop reviewing large diffs. Start reviewing logical change units with just-in-time context and AI guidance.
		</p>

		{#if data.user}
			<div class="flex flex-col items-center gap-4">
				<p class="text-gray-700 dark:text-gray-300">Welcome back, <span class="font-bold text-gray-900 dark:text-white">{data.user.login}</span>!</p>
				<a
					href="/app"
					class="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition shadow-lg shadow-blue-900/20"
				>
					Go to Dashboard
				</a>
			</div>
		{:else}
			<div class="flex flex-col items-center gap-6">
				<a
					href="/auth/github"
					class="flex items-center gap-3 px-8 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-950 rounded-lg font-bold hover:bg-gray-800 dark:hover:bg-gray-200 transition shadow-lg"
				>
					<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
						<path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 4.438 9.584 10.605 10.605.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C19.565 21.88 24 17.598 24 12.297c0-6.627-5.373-12-12-12"/>
					</svg>
					Sign in with GitHub
				</a>
				<p class="text-sm text-gray-500 dark:text-gray-400">
					Requires a GitHub App installation on your repositories.
				</p>
			</div>
		{/if}
	</div>

	<footer class="mt-24 grid grid-cols-1 md:grid-cols-3 gap-12 text-left max-w-5xl w-full">
		<div class="space-y-4">
			<h3 class="font-bold text-lg dark:text-white">Change Units</h3>
			<p class="text-gray-600 dark:text-gray-400 text-sm">
				We automatically cluster related hunks into "review steps" so you can focus on one logical change at a time.
			</p>
		</div>
		<div class="space-y-4">
			<h3 class="font-bold text-lg dark:text-white">Just-in-time Context</h3>
			<p class="text-gray-600 dark:text-gray-400 text-sm">
				See definitions, references, and related tests for every changed symbol without leaving the review view.
			</p>
		</div>
		<div class="space-y-4">
			<h3 class="font-bold text-lg dark:text-white">AI Guidance</h3>
			<p class="text-gray-600 dark:text-gray-400 text-sm">
				Get an AI-powered summary of impact, potential risks, and a checklist of questions to ask the author.
			</p>
		</div>
	</footer>
</div>
