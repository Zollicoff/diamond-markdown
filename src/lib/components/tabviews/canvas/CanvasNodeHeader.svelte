<script lang="ts">
	import type { CanvasNode } from '$lib/types';
	import CanvasColorPalette from './CanvasColorPalette.svelte';

	interface Props {
		node: CanvasNode;
		title: string;
		saving: boolean;
		moving: boolean;
		resizing: boolean;
		deleting: boolean;
		duplicating: boolean;
		disableDuplicate: boolean;
		disableDelete: boolean;
		onMovePointerDown: (node: CanvasNode, event: PointerEvent) => void;
		onColorChange: (node: CanvasNode, color: string) => void | Promise<void>;
		onDuplicate: (node: CanvasNode) => void | Promise<void>;
	}

	let {
		node,
		title,
		saving,
		moving,
		resizing,
		deleting,
		duplicating,
		disableDuplicate,
		disableDelete,
		onMovePointerDown,
		onColorChange,
		onDuplicate
	}: Props = $props();
</script>

<div class="node-topline">
	<button
		type="button"
		class="node-drag-handle"
		aria-label={`Move canvas node ${title}`}
		title="Move canvas node"
		onpointerdown={(event) => onMovePointerDown(node, event)}
	></button>
	<div class="node-type">{node.type}</div>
	<CanvasColorPalette
		kind="node"
		label={title}
		color={node.color}
		disabled={saving || moving || resizing || deleting || disableDelete}
		{saving}
		onColorChange={(color) => onColorChange(node, color)}
	/>
	<button
		type="button"
		class="node-duplicate"
		aria-label={`Duplicate canvas node ${title}`}
		disabled={disableDuplicate}
		onclick={() => void onDuplicate(node)}
	>
		{duplicating ? 'Duplicating...' : 'Duplicate'}
	</button>
</div>

<style>
	.node-topline {
		display: flex;
		align-items: center;
		gap: 7px;
		min-width: 0;
		flex-wrap: wrap;
	}
	.node-topline :global(.color-palette) {
		margin-left: auto;
	}
	.node-drag-handle {
		position: relative;
		display: inline-grid;
		place-items: center;
		width: 22px;
		height: 22px;
		flex: 0 0 auto;
		border: 1px solid var(--border);
		border-radius: 5px;
		background: color-mix(in srgb, var(--bg), transparent 10%);
		cursor: grab;
	}
	.node-drag-handle::before {
		content: '';
		width: 3px;
		height: 3px;
		border-radius: 999px;
		background: var(--fg-dim);
		box-shadow:
			6px 0 0 var(--fg-dim),
			0 6px 0 var(--fg-dim),
			6px 6px 0 var(--fg-dim);
	}
	.node-drag-handle:hover {
		border-color: var(--accent);
	}
	.node-drag-handle:hover::before {
		background: var(--accent);
		box-shadow:
			6px 0 0 var(--accent),
			0 6px 0 var(--accent),
			6px 6px 0 var(--accent);
	}
	.node-drag-handle:active {
		cursor: grabbing;
	}
	.node-type {
		align-self: flex-start;
		border: 1px solid var(--border);
		border-color: color-mix(in srgb, var(--canvas-node-border, var(--border)), transparent 35%);
		border-radius: 999px;
		padding: 1px 7px;
		color: var(--canvas-node-type-color, var(--fg-dim));
		font-family: var(--mono);
		font-size: 0.65rem;
		text-transform: uppercase;
	}
	.node-duplicate {
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 3px 8px;
		background: transparent;
		color: var(--fg-muted);
		font: inherit;
		font-size: 0.7rem;
		white-space: nowrap;
		cursor: pointer;
	}
	.node-duplicate:hover:not(:disabled),
	.node-duplicate:focus-visible {
		border-color: var(--accent);
		color: var(--accent);
		outline: none;
	}
	.node-duplicate:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}
</style>
