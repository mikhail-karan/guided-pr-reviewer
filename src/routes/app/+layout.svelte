<script lang="ts">
	import type { LayoutData } from './$types';

	import { enhance } from '$app/forms';
	let { data, children }: { data: LayoutData, children: any } = $props();
</script>

<div class="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
	<header class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex justify-between items-center shadow-sm">
		<div class="flex items-center gap-6">
			<a href="/app" class="font-bold text-xl tracking-tight text-gray-950 dark:text-gray-50">
				Guided PR <span class="text-blue-600 dark:text-blue-400">Reviewer</span>
			</a>
			<nav class="hidden md:flex gap-4">
				<a href="/app" class="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition">Dashboard</a>
			</nav>
		</div>

		<div class="flex items-center gap-4">
			<div class="flex items-center gap-2">
				<img src={data.user.avatarUrl} alt={data.user.login} class="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-700" />
				<span class="text-sm font-medium text-gray-700 dark:text-gray-300 hidden sm:block">{data.user.login}</span>
			</div>
			<form action="/auth/logout" method="POST" use:enhance>
				<button type="submit" class="text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition">
					Logout
				</button>
			</form>
		</div>
	</header>

	<main class="flex-1">
		{@render children()}
	</main>
</div>


