<script lang="ts">
	interface Props {
		x: number;
		y: number;
		html: string;
		onLeave: () => void;
	}

	let { x, y, html, onLeave }: Props = $props();
</script>

<div
	class="hover-card"
	style="left:{x}px;top:{y}px"
	onpointerleave={onLeave}
	role="tooltip"
>
	<div class="hover-card-body">{@html html}</div>
</div>

<style>
	.hover-card {
		position: fixed;
		z-index: 900;
		max-width: 420px;
		max-height: 320px;
		overflow-y: auto;
		background: var(--bg-elev);
		border: 1px solid var(--border-strong);
		border-radius: 8px;
		box-shadow: 0 10px 40px rgba(0,0,0,0.45);
		padding: 12px 16px;
		font-family: var(--sans);
		font-size: 14px;
		line-height: 1.55;
		color: var(--fg);
		transform: translate(0, -100%);
		pointer-events: auto;
	}
	.hover-card-body :global(h1),
	.hover-card-body :global(h2),
	.hover-card-body :global(h3) { font-size: 1em; margin: 0 0 0.4em; }
	.hover-card-body :global(p) { margin: 0 0 0.5em; }
	.hover-card-body :global(p:last-child) { margin-bottom: 0; }
</style>
