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
		CanvasTextDrafts
	} from '$lib/canvas/view';
	import type {
		CanvasTextEmbedResolver,
		CanvasTextWikilinkResolver
	} from '$lib/canvas/text-preview';
	import type { CanvasNotePreviewMap } from '$lib/canvas/note-previews';
	import type { CanvasMutationState } from '$lib/canvas/mutations';
	import CanvasBoard from './CanvasBoard.svelte';
	import CanvasEdgeList from './CanvasEdgeList.svelte';

	interface Props {
		vaultId: string;
		sourcePath: string;
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
		notePreviews: CanvasNotePreviewMap;
		edgeLabelDrafts: CanvasEdgeLabelDrafts;
		edgeRoutingDrafts: CanvasEdgeRoutingDrafts;
		resolveEmbedTarget: CanvasTextEmbedResolver;
		resolveWikilinkTarget: CanvasTextWikilinkResolver;
		mutationState: CanvasMutationState;
		zoom: number;
		zoomLabel: string;
		canZoomIn: boolean;
		canZoomOut: boolean;
		onEdgeLabelDraftChange: (edge: CanvasEdgeSummary, value: string) => void;
		onEdgeRoutingDraftChange: (edge: CanvasEdgeSummary, draft: CanvasEdgeRoutingDraft) => void;
		onSaveEdgeLabel: (edge: CanvasEdgeSummary) => void | Promise<void>;
		onSaveEdgeColor: (edge: CanvasEdgeSummary, color: string) => void | Promise<void>;
		onSaveEdgeRouting: (edge: CanvasEdgeSummary) => void | Promise<void>;
		onDeleteEdge: (edge: CanvasEdgeSummary) => void | Promise<void>;
		onDraftChange: (node: CanvasNode, value: string) => void;
		onGroupLabelDraftChange: (node: CanvasNode, value: string) => void;
		onRefDraftChange: (node: CanvasNode, draft: CanvasNodeRefDraft) => void;
		onSaveNode: (node: CanvasNode) => void | Promise<void>;
		onSaveGroupLabel: (node: CanvasNode) => void | Promise<void>;
		onSaveRefNode: (node: CanvasNode) => void | Promise<void>;
		onOpenRefNode: (node: CanvasNode) => void;
		onSaveNodeColor: (node: CanvasNode, color: string) => void | Promise<void>;
		onDuplicateNode: (node: CanvasNode) => void | Promise<void>;
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
		sourcePath,
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
		notePreviews,
		edgeLabelDrafts,
		edgeRoutingDrafts,
		resolveEmbedTarget,
		resolveWikilinkTarget,
		mutationState,
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
		onDuplicateNode,
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
		{mutationState}
		onLabelDraftChange={onEdgeLabelDraftChange}
		onRoutingDraftChange={onEdgeRoutingDraftChange}
		onSaveLabel={onSaveEdgeLabel}
		onColorChange={onSaveEdgeColor}
		onSaveRouting={onSaveEdgeRouting}
		onDelete={onDeleteEdge}
	/>
	<CanvasBoard
		{vaultId}
		{sourcePath}
		{nodes}
		{bounds}
		{lines}
		{textDrafts}
		{groupLabelDrafts}
		{refDrafts}
		{notePreviews}
		{resolveEmbedTarget}
		{resolveWikilinkTarget}
		{mutationState}
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
		onDuplicate={onDuplicateNode}
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
