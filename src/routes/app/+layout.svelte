<script lang="ts">
	import type { LayoutData } from './$types';

	import { enhance } from '$app/forms';
	let { data, children }: { data: LayoutData, children: any } = $props();
</script>

<div class="min-h-screen bg-gray-50 flex flex-col">
	<header class="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center shadow-sm">
		<div class="flex items-center gap-6">
			<a href="/app" class="font-bold text-xl tracking-tight text-gray-950">
				Guided PR <span class="text-blue-600">Reviewer</span>
			</a>
			<nav class="hidden md:flex gap-4">
				<a href="/app" class="text-sm font-medium text-gray-600 hover:text-gray-900 transition">Dashboard</a>
			</nav>
		</div>

		<div class="flex items-center gap-4">
			<div class="flex items-center gap-2">
				<img src={data.user.avatarUrl} alt={data.user.login} class="w-8 h-8 rounded-full border border-gray-200" />
				<span class="text-sm font-medium text-gray-700 hidden sm:block">{data.user.login}</span>
			</div>
			<form action="/auth/logout" method="POST" use:enhance>
				<button type="submit" class="text-sm font-medium text-red-600 hover:text-red-700 transition">
					Logout
				</button>
			</form>
		</div>
	</header>

	<main class="flex-1">
		{@render children()}
	</main>
</div>

