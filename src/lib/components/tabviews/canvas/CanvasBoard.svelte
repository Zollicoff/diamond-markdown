<script lang="ts">
	import type { CanvasNode } from '$lib/types';
	import {
		canvasDraftChanged,
		canvasDraftFor,
		canvasGroupLabelChanged,
		canvasGroupLabelDraftFor,
		canvasLayeredNodes,
		canvasNodeRefDraftChanged,
		canvasNodeRefDraftFor,
		canSaveCanvasGroupLabel,
		canSaveCanvasNodeRefDraft,
		type CanvasBounds,
		type CanvasEdgeLine,
		type CanvasGroupLabelDrafts,
		type CanvasNodeRefDraft,
		type CanvasNodeRefDrafts,
		type CanvasTextDrafts,
		type CanvasTextEmbedResolver,
		type CanvasTextWikilinkResolver
	} from '$lib/canvas/view';
	import {
		canvasBoardZoomStyle,
		canvasGridBackgroundSize,
		canvasZoomLayerStyle
	} from '$lib/canvas/viewport';
	import CanvasEdgeLayer from './CanvasEdgeLayer.svelte';
	import CanvasNodeCard from './CanvasNodeCard.svelte';

	interface Props {
		vaultId: string;
		nodes: CanvasNode[];
		bounds: CanvasBounds;
		lines: CanvasEdgeLine[];
		textDrafts: CanvasTextDrafts;
		groupLabelDrafts: CanvasGroupLabelDrafts;
		refDrafts: CanvasNodeRefDrafts;
		resolveEmbedTarget: CanvasTextEmbedResolver;
		resolveWikilinkTarget: CanvasTextWikilinkResolver;
		savingNodeId: string | null;
		movingNodeId: string | null;
		moveSavingNodeId: string | null;
		resizingNodeId: string | null;
		resizeSavingNodeId: string | null;
		deletingNodeId: string | null;
		savingEdgeId: string | null;
		deletingEdgeId: string | null;
		zoom: number;
		zoomLabel: string;
		canZoomIn: boolean;
		canZoomOut: boolean;
		onDraftChange: (node: CanvasNode, value: string) => void;
		onGroupLabelDraftChange: (node: CanvasNode, value: string) => void;
		onRefDraftChange: (node: CanvasNode, draft: CanvasNodeRefDraft) => void;
		onSave: (node: CanvasNode) => void | Promise<void>;
		onSaveGroupLabel: (node: CanvasNode) => void | Promise<void>;
		onSaveRef: (node: CanvasNode) => void | Promise<void>;
		onOpenRef: (node: CanvasNode) => void;
		onColorChange: (node: CanvasNode, color: string) => void | Promise<void>;
		onDelete: (node: CanvasNode) => void | Promise<void>;
		onMovePointerDown: (node: CanvasNode, event: PointerEvent) => void;
		onResizePointerDown: (node: CanvasNode, event: PointerEvent) => void;
		onZoomIn: () => void;
		onZoomOut: () => void;
		onZoomReset: () => void;
		onZoomFit: (viewportWidth: number, viewportHeight: number) => void;
	}

	let {
		vaultId,
		nodes,
		bounds,
		lines,
		textDrafts,
		groupLabelDrafts,
		refDrafts,
		resolveEmbedTarget,
		resolveWikilinkTarget,
		savingNodeId,
		movingNodeId,
		moveSavingNodeId,
		resizingNodeId,
		resizeSavingNodeId,
		deletingNodeId,
		savingEdgeId,
		deletingEdgeId,
		zoom,
		zoomLabel,
		canZoomIn,
		canZoomOut,
		onDraftChange,
		onGroupLabelDraftChange,
		onRefDraftChange,
		onSave,
		onSaveGroupLabel,
		onSaveRef,
		onOpenRef,
		onColorChange,
		onDelete,
		onMovePointerDown,
		onResizePointerDown,
		onZoomIn,
		onZoomOut,
		onZoomReset,
		onZoomFit
	}: Props = $props();

	let viewportWidth = $state(0);
	let viewportHeight = $state(0);

	const disableNodeDelete = $derived(
		deletingNodeId !== null ||
		savingNodeId !== null ||
		movingNodeId !== null ||
		moveSavingNodeId !== null ||
		resizingNodeId !== null ||
		resizeSavingNodeId !== null ||
		savingEdgeId !== null ||
		deletingEdgeId !== null
	);
	const layeredNodes = $derived(canvasLayeredNodes(nodes));
	const zoomLayerStyle = $derived(canvasZoomLayerStyle(bounds, zoom));
	const boardStyle = $derived(canvasBoardZoomStyle(bounds, zoom));
	const gridBackgroundSize = $derived(canvasGridBackgroundSize(zoom));

	function fitZoom(): void {
		onZoomFit(viewportWidth, viewportHeight);
	}
</script>

<div
	class="canvas-scroll"
	style={`background-size: ${gridBackgroundSize};`}
	bind:clientWidth={viewportWidth}
	bind:clientHeight={viewportHeight}
>
	<div class="canvas-zoom-controls" role="group" aria-label="Canvas zoom controls">
		<button type="button" aria-label="Zoom out Canvas" title="Zoom out" disabled={!canZoomOut} onclick={onZoomOut}>-</button>
		<span class="zoom-value" aria-label="Canvas zoom level">{zoomLabel}</span>
		<button type="button" aria-label="Zoom in Canvas" title="Zoom in" disabled={!canZoomIn} onclick={onZoomIn}>+</button>
		<button type="button" aria-label="Fit Canvas to viewport" title="Fit to viewport" onclick={fitZoom}>Fit</button>
		<button type="button" aria-label="Reset Canvas zoom" title="Reset zoom" onclick={onZoomReset}>1:1</button>
	</div>
	<div class="canvas-zoom-layer" style={zoomLayerStyle}>
		<div class="canvas-board" style={boardStyle}>
		<CanvasEdgeLayer {bounds} {lines} />

		{#each layeredNodes as node (node.id)}
			<CanvasNodeCard
				{vaultId}
				{node}
				{bounds}
				draft={canvasDraftFor(node, textDrafts)}
				changed={canvasDraftChanged(node, textDrafts)}
				groupLabelDraft={canvasGroupLabelDraftFor(node, groupLabelDrafts)}
				groupLabelChanged={canvasGroupLabelChanged(node, groupLabelDrafts)}
				groupLabelCanSave={canSaveCanvasGroupLabel(node, groupLabelDrafts)}
				refDraft={canvasNodeRefDraftFor(node, refDrafts)}
				refChanged={canvasNodeRefDraftChanged(node, refDrafts)}
				refCanSave={canSaveCanvasNodeRefDraft(node, refDrafts)}
				{resolveEmbedTarget}
				{resolveWikilinkTarget}
				saving={savingNodeId === node.id}
				moving={movingNodeId === node.id || moveSavingNodeId === node.id}
				resizing={resizingNodeId === node.id || resizeSavingNodeId === node.id}
				deleting={deletingNodeId === node.id}
				disableDelete={disableNodeDelete}
				onDraftChange={onDraftChange}
				onGroupLabelDraftChange={onGroupLabelDraftChange}
				onRefDraftChange={onRefDraftChange}
				onSave={onSave}
				onSaveGroupLabel={onSaveGroupLabel}
				onSaveRef={onSaveRef}
				onOpenRef={onOpenRef}
				onColorChange={onColorChange}
				onDelete={onDelete}
				onMovePointerDown={onMovePointerDown}
				onResizePointerDown={onResizePointerDown}
			/>
		{/each}
		</div>
	</div>
</div>

<style>
	.canvas-scroll {
		flex: 1;
		min-height: 0;
		overflow: auto;
		position: relative;
		background:
			linear-gradient(var(--border) 1px, transparent 1px),
			linear-gradient(90deg, var(--border) 1px, transparent 1px),
			var(--bg);
		background-size: 36px 36px;
	}
	.canvas-zoom-controls {
		position: sticky;
		top: 10px;
		left: 10px;
		z-index: 5;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin: 10px;
		padding: 4px;
		border: 1px solid var(--border);
		border-radius: 7px;
		background: color-mix(in srgb, var(--bg-elev), transparent 8%);
		box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
	}
	.canvas-zoom-controls button {
		min-width: 30px;
		height: 28px;
		border: 1px solid transparent;
		border-radius: 5px;
		padding: 0 8px;
		background: transparent;
		color: var(--fg-muted);
		font: inherit;
		font-size: 0.75rem;
		cursor: pointer;
	}
	.canvas-zoom-controls button:hover:not(:disabled),
	.canvas-zoom-controls button:focus-visible {
		border-color: var(--accent);
		color: var(--accent);
		outline: none;
	}
	.canvas-zoom-controls button:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}
	.zoom-value {
		min-width: 44px;
		color: var(--fg-dim);
		font-family: var(--mono);
		font-size: 0.72rem;
		text-align: center;
	}
	.canvas-zoom-layer {
		position: relative;
	}
	.canvas-board {
		position: relative;
		min-width: 100%;
		min-height: 100%;
		transform-origin: top left;
	}
</style>
