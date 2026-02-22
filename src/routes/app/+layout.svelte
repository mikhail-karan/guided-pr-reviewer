<script lang="ts">
	import type { LayoutData } from './$types';

	import { enhance } from '$app/forms';
	import logoMark from '$lib/assets/logo-mark.svg';
	let { data, children }: { data: LayoutData; children: any } = $props();
</script>

<div class="flex min-h-screen flex-col bg-gray-50 dark:bg-gray-950">
	<header
		class="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
	>
		<div class="flex items-center gap-6">
			<a
				href="/app"
				class="flex items-center gap-3 text-xl font-bold tracking-tight text-gray-950 dark:text-gray-50"
			>
				<span
					class="inline-flex items-center justify-center rounded-lg bg-gray-100 p-1 ring-1 ring-gray-200 dark:bg-white/8 dark:ring-white/12"
				>
					<img
						src={logoMark}
						alt="Guided PR Reviewer logo"
						class="h-8 w-8 dark:brightness-110 dark:contrast-125"
					/>
				</span>
				<span>
					Guided PR <span class="text-blue-600 dark:text-blue-400">Reviewer</span>
				</span>
			</a>
			<nav class="hidden gap-4 md:flex">
				<a
					href="/app"
					class="text-sm font-medium text-gray-600 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
					>Dashboard</a
				>
			</nav>
		</div>

		<div class="flex items-center gap-4">
			<div class="flex items-center gap-2">
				<img
					src={data.user.avatarUrl}
					alt={data.user.login}
					class="h-8 w-8 rounded-full border border-gray-200 dark:border-gray-700"
				/>
				<span class="hidden text-sm font-medium text-gray-700 sm:block dark:text-gray-300"
					>{data.user.login}</span
				>
			</div>
			<form action="/auth/logout" method="POST" use:enhance>
				<button
					type="submit"
					class="text-sm font-medium text-red-600 transition hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
				>
					Logout
				</button>
			</form>
		</div>
	</header>

	<main class="flex-1">
		{@render children()}
	</main>
</div>
