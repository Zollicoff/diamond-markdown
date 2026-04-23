<script lang="ts">
	interface Props { message?: string; hint?: string; }
	let { message = 'No tab open', hint = 'Pick a note from the sidebar, or press ⌘K to jump.' }: Props = $props();
</script>

<div class="empty">
	<div class="msg">{message}</div>
	<div class="hint">{hint}</div>
</div>

<style>
	.empty {
		height: 100%;
		display: grid;
		place-items: center;
		text-align: center;
		padding: 3rem;
		background: var(--bg);
	}
	.msg { font-size: 1.05rem; color: var(--fg-muted); margin-bottom: 6px; }
	.hint { font-size: 0.86rem; color: var(--fg-dim); }
</style>
