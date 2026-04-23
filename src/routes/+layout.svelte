<script lang="ts">
	import '../app.css';
	let { children } = $props();
</script>

<svelte:head>
	<title>DiamondMD</title>
</svelte:head>

{@render children()}
