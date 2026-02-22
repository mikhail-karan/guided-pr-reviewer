<script lang="ts">
	import './layout.css';
	import logoMark from '$lib/assets/logo-mark.svg';

	let { children } = $props();
</script>

<svelte:head>
	<title>Guided PR Reviewer</title>
	<meta
		name="description"
		content="Review pull requests by logical change units with AI guidance and just-in-time context."
	/>
	<link rel="icon" href={logoMark} type="image/svg+xml" />
</svelte:head>
{@render children()}
