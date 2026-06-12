<script lang="ts">
	import type { CanvasNode } from '$lib/types';
	import {
		canvasDraftChanged,
		canvasDraftFor,
		canvasNodeRefDraftChanged,
		canvasNodeRefDraftFor,
		canSaveCanvasNodeRefDraft,
		type CanvasBounds,
		type CanvasEdgeLine,
		type CanvasNodeRefDraft,
		type CanvasNodeRefDrafts,
		type CanvasTextDrafts
	} from '$lib/canvas/view';
	import CanvasNodeCard from './CanvasNodeCard.svelte';

	interface Props {
		nodes: CanvasNode[];
		bounds: CanvasBounds;
		lines: CanvasEdgeLine[];
		textDrafts: CanvasTextDrafts;
		refDrafts: CanvasNodeRefDrafts;
		savingNodeId: string | null;
		movingNodeId: string | null;
		moveSavingNodeId: string | null;
		deletingNodeId: string | null;
		savingEdgeId: string | null;
		deletingEdgeId: string | null;
		onDraftChange: (node: CanvasNode, value: string) => void;
		onRefDraftChange: (node: CanvasNode, draft: CanvasNodeRefDraft) => void;
		onSave: (node: CanvasNode) => void | Promise<void>;
		onSaveRef: (node: CanvasNode) => void | Promise<void>;
		onDelete: (node: CanvasNode) => void | Promise<void>;
		onMovePointerDown: (node: CanvasNode, event: PointerEvent) => void;
	}

	let {
		nodes,
		bounds,
		lines,
		textDrafts,
		refDrafts,
		savingNodeId,
		movingNodeId,
		moveSavingNodeId,
		deletingNodeId,
		savingEdgeId,
		deletingEdgeId,
		onDraftChange,
		onRefDraftChange,
		onSave,
		onSaveRef,
		onDelete,
		onMovePointerDown
	}: Props = $props();

	const disableNodeDelete = $derived(
		deletingNodeId !== null ||
		savingNodeId !== null ||
		movingNodeId !== null ||
		moveSavingNodeId !== null ||
		savingEdgeId !== null ||
		deletingEdgeId !== null
	);
</script>

<div class="canvas-scroll">
	<div class="canvas-board" style={`width: ${bounds.width}px; height: ${bounds.height}px;`}>
		<svg class="edge-layer" width={bounds.width} height={bounds.height} aria-hidden="true">
			{#each lines as line (line.edge.id)}
				<line
					x1={line.x1}
					y1={line.y1}
					x2={line.x2}
					y2={line.y2}
					class="edge"
				/>
				{#if line.edge.label}
					<text
						x={(line.x1 + line.x2) / 2}
						y={(line.y1 + line.y2) / 2 - 6}
						class="edge-label"
					>{line.edge.label}</text>
				{/if}
			{/each}
		</svg>

		{#each nodes as node (node.id)}
			<CanvasNodeCard
				{node}
				{bounds}
				draft={canvasDraftFor(node, textDrafts)}
				changed={canvasDraftChanged(node, textDrafts)}
				refDraft={canvasNodeRefDraftFor(node, refDrafts)}
				refChanged={canvasNodeRefDraftChanged(node, refDrafts)}
				refCanSave={canSaveCanvasNodeRefDraft(node, refDrafts)}
				saving={savingNodeId === node.id}
				moving={movingNodeId === node.id || moveSavingNodeId === node.id}
				deleting={deletingNodeId === node.id}
				disableDelete={disableNodeDelete}
				onDraftChange={onDraftChange}
				onRefDraftChange={onRefDraftChange}
				onSave={onSave}
				onSaveRef={onSaveRef}
				onDelete={onDelete}
				onMovePointerDown={onMovePointerDown}
			/>
		{/each}
	</div>
</div>

<style>
	.canvas-scroll {
		flex: 1;
		min-height: 0;
		overflow: auto;
		background:
			linear-gradient(var(--border) 1px, transparent 1px),
			linear-gradient(90deg, var(--border) 1px, transparent 1px),
			var(--bg);
		background-size: 36px 36px;
	}
	.canvas-board {
		position: relative;
		min-width: 100%;
		min-height: 100%;
	}
	.edge-layer {
		position: absolute;
		inset: 0;
		pointer-events: none;
		overflow: visible;
	}
	.edge {
		stroke: var(--border-strong);
		stroke-width: 2;
		opacity: 0.75;
	}
	.edge-label {
		fill: var(--fg-dim);
		font-family: var(--mono);
		font-size: 11px;
		paint-order: stroke;
		stroke: var(--bg);
		stroke-width: 4px;
		stroke-linejoin: round;
	}
</style>
