<script lang="ts">
	interface Props {
		commands: string;
	}

	let { commands }: Props = $props();
</script>

{#if commands}
	<pre class="command-block mono"><code>{commands}</code></pre>
{/if}

<style>
	.command-block {
		margin: 10px 0;
		padding: 9px 10px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg-elev);
		color: var(--fg);
		font-size: 0.72rem;
		line-height: 1.45;
		overflow-x: auto;
		white-space: pre;
	}
	.mono { font-family: var(--mono); }
</style>
