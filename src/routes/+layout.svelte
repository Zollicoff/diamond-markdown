<script lang="ts">
	import '../app.css';
	let { children } = $props();
</script>

<svelte:head>
	<title>Diamond</title>
</svelte:head>

{@render children()}
