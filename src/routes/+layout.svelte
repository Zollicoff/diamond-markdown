<script lang="ts">
	import { onMount } from 'svelte';
	import '../app.css';
	import 'katex/dist/katex.min.css';
	import 'highlight.js/styles/github-dark.min.css';
	import { hydrate as hydrateTheme } from '$lib/theme.svelte';

	let { children } = $props();

	onMount(() => { hydrateTheme(); });
</script>

<svelte:head>
	<title>Diamond Markdown</title>
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
	<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&display=swap" rel="stylesheet">
</svelte:head>

{@render children()}
