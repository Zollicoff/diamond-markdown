<script lang="ts">
	import type { CanvasNode } from '$lib/types';

	interface Props {
		node: CanvasNode;
		title: string;
		onResizePointerDown: (node: CanvasNode, event: PointerEvent) => void;
	}

	let { node, title, onResizePointerDown }: Props = $props();
</script>

<button
	type="button"
	class="node-resize-handle"
	aria-label={`Resize canvas node ${title}`}
	title="Resize canvas node"
	onpointerdown={(event) => onResizePointerDown(node, event)}
></button>

<style>
	.node-resize-handle {
		position: absolute;
		right: 5px;
		bottom: 5px;
		width: 18px;
		height: 18px;
		border: 1px solid color-mix(in srgb, var(--canvas-node-border, var(--border)), transparent 20%);
		border-radius: 4px;
		background:
			linear-gradient(135deg, transparent 47%, var(--fg-dim) 48%, var(--fg-dim) 54%, transparent 55%),
			color-mix(in srgb, var(--bg), transparent 8%);
		cursor: nwse-resize;
	}
	.node-resize-handle:hover,
	.node-resize-handle:focus-visible {
		border-color: var(--brand-cyan);
		background:
			linear-gradient(135deg, transparent 47%, var(--brand-cyan) 48%, var(--brand-cyan) 54%, transparent 55%),
			color-mix(in srgb, var(--bg), transparent 2%);
		outline: none;
	}
</style>
