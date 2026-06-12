<script lang="ts">
	import type { CanvasNode } from '$lib/types';
	import {
		canvasDraftChanged,
		canvasDraftFor,
		canvasEdgeMarkerId,
		canvasEdgeMarkerStyle,
		canvasEdgeMarkerUrl,
		canvasEdgeStyle,
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
		type CanvasTextDrafts
	} from '$lib/canvas/view';
	import CanvasNodeCard from './CanvasNodeCard.svelte';

	interface Props {
		vaultId: string;
		nodes: CanvasNode[];
		bounds: CanvasBounds;
		lines: CanvasEdgeLine[];
		textDrafts: CanvasTextDrafts;
		groupLabelDrafts: CanvasGroupLabelDrafts;
		refDrafts: CanvasNodeRefDrafts;
		savingNodeId: string | null;
		movingNodeId: string | null;
		moveSavingNodeId: string | null;
		resizingNodeId: string | null;
		resizeSavingNodeId: string | null;
		deletingNodeId: string | null;
		savingEdgeId: string | null;
		deletingEdgeId: string | null;
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
	}

	let {
		vaultId,
		nodes,
		bounds,
		lines,
		textDrafts,
		groupLabelDrafts,
		refDrafts,
		savingNodeId,
		movingNodeId,
		moveSavingNodeId,
		resizingNodeId,
		resizeSavingNodeId,
		deletingNodeId,
		savingEdgeId,
		deletingEdgeId,
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
		onResizePointerDown
	}: Props = $props();

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
</script>

<div class="canvas-scroll">
	<div class="canvas-board" style={`width: ${bounds.width}px; height: ${bounds.height}px;`}>
		<svg class="edge-layer" width={bounds.width} height={bounds.height} aria-hidden="true">
			<defs>
				{#each lines as line (line.edge.id)}
					{#if canvasEdgeMarkerUrl(line.edge, 'from')}
						<marker
							id={canvasEdgeMarkerId(line.edge, 'from')}
							viewBox="0 0 8 8"
							refX="7"
							refY="4"
							markerWidth="6"
							markerHeight="6"
							orient="auto-start-reverse"
							markerUnits="strokeWidth"
						>
							<path class="edge-marker" style={canvasEdgeMarkerStyle(line.edge)} d="M 0 0 L 8 4 L 0 8 z" />
						</marker>
					{/if}
					{#if canvasEdgeMarkerUrl(line.edge, 'to')}
						<marker
							id={canvasEdgeMarkerId(line.edge, 'to')}
							viewBox="0 0 8 8"
							refX="7"
							refY="4"
							markerWidth="6"
							markerHeight="6"
							orient="auto-start-reverse"
							markerUnits="strokeWidth"
						>
							<path class="edge-marker" style={canvasEdgeMarkerStyle(line.edge)} d="M 0 0 L 8 4 L 0 8 z" />
						</marker>
					{/if}
				{/each}
			</defs>
			{#each lines as line (line.edge.id)}
				<line
					x1={line.x1}
					y1={line.y1}
					x2={line.x2}
					y2={line.y2}
					class="edge"
					style={canvasEdgeStyle(line.edge)}
					marker-start={canvasEdgeMarkerUrl(line.edge, 'from')}
					marker-end={canvasEdgeMarkerUrl(line.edge, 'to')}
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
	.edge-marker {
		fill: var(--border-strong);
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
