<script lang="ts">
	import type { CanvasDoc, CanvasNode } from '$lib/types';
	import type {
		CanvasBounds,
		CanvasEdgeLabelDrafts,
		CanvasEdgeLine,
		CanvasEdgeRoutingDraft,
		CanvasEdgeRoutingDrafts,
		CanvasEdgeSummary,
		CanvasGroupLabelDrafts,
		CanvasNodeRefDraft,
		CanvasNodeRefDrafts,
		CanvasTextDrafts,
		CanvasTextEmbedResolver,
		CanvasTextWikilinkResolver
	} from '$lib/canvas/view';
	import CanvasBoard from './CanvasBoard.svelte';
	import CanvasEdgeList from './CanvasEdgeList.svelte';

	interface Props {
		vaultId: string;
		loading: boolean;
		error: string | null;
		doc: CanvasDoc | null;
		nodes: CanvasNode[];
		bounds: CanvasBounds;
		lines: CanvasEdgeLine[];
		edgeSummaries: CanvasEdgeSummary[];
		textDrafts: CanvasTextDrafts;
		groupLabelDrafts: CanvasGroupLabelDrafts;
		refDrafts: CanvasNodeRefDrafts;
		edgeLabelDrafts: CanvasEdgeLabelDrafts;
		edgeRoutingDrafts: CanvasEdgeRoutingDrafts;
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
		onEdgeLabelDraftChange: (edge: CanvasEdgeSummary, value: string) => void;
		onEdgeRoutingDraftChange: (edge: CanvasEdgeSummary, draft: CanvasEdgeRoutingDraft) => void;
		onSaveEdgeLabel: (edge: CanvasEdgeSummary) => void | Promise<void>;
		onSaveEdgeColor: (edge: CanvasEdgeSummary, color: string) => void | Promise<void>;
		onSaveEdgeRouting: (edge: CanvasEdgeSummary) => void | Promise<void>;
		onDeleteEdge: (edgeId: string) => void | Promise<void>;
		onDraftChange: (node: CanvasNode, value: string) => void;
		onGroupLabelDraftChange: (node: CanvasNode, value: string) => void;
		onRefDraftChange: (node: CanvasNode, draft: CanvasNodeRefDraft) => void;
		onSaveNode: (node: CanvasNode) => void | Promise<void>;
		onSaveGroupLabel: (node: CanvasNode) => void | Promise<void>;
		onSaveRefNode: (node: CanvasNode) => void | Promise<void>;
		onOpenRefNode: (node: CanvasNode) => void;
		onSaveNodeColor: (node: CanvasNode, color: string) => void | Promise<void>;
		onDeleteNode: (node: CanvasNode) => void | Promise<void>;
		onMovePointerDown: (node: CanvasNode, event: PointerEvent) => void;
		onResizePointerDown: (node: CanvasNode, event: PointerEvent) => void;
		onZoomIn: () => void;
		onZoomOut: () => void;
		onZoomReset: () => void;
		onZoomFit: (viewportWidth: number, viewportHeight: number) => void;
	}

	let {
		vaultId,
		loading,
		error,
		doc,
		nodes,
		bounds,
		lines,
		edgeSummaries,
		textDrafts,
		groupLabelDrafts,
		refDrafts,
		edgeLabelDrafts,
		edgeRoutingDrafts,
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
		onEdgeLabelDraftChange,
		onEdgeRoutingDraftChange,
		onSaveEdgeLabel,
		onSaveEdgeColor,
		onSaveEdgeRouting,
		onDeleteEdge,
		onDraftChange,
		onGroupLabelDraftChange,
		onRefDraftChange,
		onSaveNode,
		onSaveGroupLabel,
		onSaveRefNode,
		onOpenRefNode,
		onSaveNodeColor,
		onDeleteNode,
		onMovePointerDown,
		onResizePointerDown,
		onZoomIn,
		onZoomOut,
		onZoomReset,
		onZoomFit
	}: Props = $props();
</script>

{#if loading}
	<div class="state">Loading Canvas...</div>
{:else if error}
	<div class="state error">{error}</div>
{:else if doc && doc.nodes.length === 0}
	<div class="state">This Canvas has no readable nodes yet.</div>
{:else if doc}
	{#if doc.warnings.length > 0}
		<ul class="warnings">
			{#each doc.warnings as warning}
				<li>{warning}</li>
			{/each}
		</ul>
	{/if}
	<CanvasEdgeList
		edges={edgeSummaries}
		{edgeLabelDrafts}
		{edgeRoutingDrafts}
		{savingEdgeId}
		{deletingEdgeId}
		onLabelDraftChange={onEdgeLabelDraftChange}
		onRoutingDraftChange={onEdgeRoutingDraftChange}
		onSaveLabel={onSaveEdgeLabel}
		onColorChange={onSaveEdgeColor}
		onSaveRouting={onSaveEdgeRouting}
		onDelete={onDeleteEdge}
	/>
	<CanvasBoard
		{vaultId}
		{nodes}
		{bounds}
		{lines}
		{textDrafts}
		{groupLabelDrafts}
		{refDrafts}
		{resolveEmbedTarget}
		{resolveWikilinkTarget}
		{savingNodeId}
		{movingNodeId}
		{moveSavingNodeId}
		{resizingNodeId}
		{resizeSavingNodeId}
		{deletingNodeId}
		{savingEdgeId}
		{deletingEdgeId}
		{zoom}
		{zoomLabel}
		{canZoomIn}
		{canZoomOut}
		onDraftChange={onDraftChange}
		onGroupLabelDraftChange={onGroupLabelDraftChange}
		onRefDraftChange={onRefDraftChange}
		onSave={onSaveNode}
		onSaveGroupLabel={onSaveGroupLabel}
		onSaveRef={onSaveRefNode}
		onOpenRef={onOpenRefNode}
		onColorChange={onSaveNodeColor}
		onDelete={onDeleteNode}
		{onMovePointerDown}
		{onResizePointerDown}
		{onZoomIn}
		{onZoomOut}
		{onZoomReset}
		{onZoomFit}
	/>
{/if}

<style>
	.warnings {
		margin: 0;
		padding: 8px 14px 8px 28px;
		border-bottom: 1px solid color-mix(in srgb, var(--warning, #fbbf24), var(--border) 70%);
		background: color-mix(in srgb, var(--warning, #fbbf24), transparent 92%);
		color: var(--fg-muted);
		font-size: 0.78rem;
	}
	.state {
		display: grid;
		place-items: center;
		height: 100%;
		color: var(--fg-dim);
		font-size: 0.88rem;
	}
	.state.error {
		color: var(--danger);
		padding: 20px;
		text-align: center;
	}
</style>
