<script lang="ts">
	import { browser } from '$app/environment';
	import { codeToHtml } from 'shiki';
	import { getShikiTheme } from '$lib/utils/shiki-theme';

	interface Props {
		code: string;
		language?: string;
		theme?: string;
		showLineNumbers?: boolean;
	}

	let { code, language = 'text', theme: providedTheme, showLineNumbers = false }: Props = $props();

	let highlightedHtml = $state('');
	let isLoading = $state(true);
	let error = $state<string | null>(null);

	// Get the theme to use (provided theme or auto-detect)
	let currentTheme = $derived(providedTheme || getShikiTheme());

	// Highlight code when component mounts or when code/language/theme changes
	$effect(() => {
		if (!browser) {
			// SSR fallback - show plain code
			highlightedHtml = `<pre><code>${escapeHtml(code)}</code></pre>`;
			isLoading = false;
			return;
		}

		if (!code) {
			highlightedHtml = '';
			isLoading = false;
			return;
		}

		let cancelled = false;

		(async () => {
			try {
				isLoading = true;
				error = null;
				const html = await codeToHtml(code, {
					lang: language,
					theme: currentTheme,
				});
				if (!cancelled) {
					highlightedHtml = html;
					isLoading = false;
				}
			} catch (err) {
				if (!cancelled) {
					console.error('Failed to highlight code:', err);
					error = err instanceof Error ? err.message : 'Failed to highlight code';
					isLoading = false;
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	});

	function escapeHtml(text: string): string {
		if (typeof document === 'undefined') {
			// SSR fallback
			return text
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#39;');
		}
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}
</script>

{#if isLoading}
	<div class="code-highlighter-loading">
		<pre><code class="text-gray-600">{code}</code></pre>
	</div>
{:else if error}
	<pre class="code-highlighter-error"><code>{code}</code></pre>
{:else}
	{@html highlightedHtml}
{/if}

<style>
	:global(.code-highlighter-loading) {
		opacity: 0.6;
	}

	:global(.code-highlighter-error) {
		background-color: #f3f4f6;
		padding: 0.5rem;
		border-radius: 0.25rem;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
			'Courier New', monospace;
		font-size: 0.875rem;
	}

	:global(.code-highlighter-error code) {
		color: #6b7280;
	}

	/* Ensure Shiki output is properly styled */
	:global(pre.shiki) {
		margin: 0;
		padding: 0.75rem;
		border-radius: 0.375rem;
		overflow-x: auto;
		font-size: 0.875rem;
		line-height: 1.5;
	}

	:global(pre.shiki code) {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
			'Courier New', monospace;
	}
</style>
