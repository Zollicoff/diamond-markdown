<script lang="ts">
	import type { CanvasDoc, CanvasNode } from '$lib/types';
	import type {
		CanvasBounds,
		CanvasEdgeLabelDrafts,
		CanvasEdgeLine,
		CanvasEdgeSummary,
		CanvasGroupLabelDrafts,
		CanvasNodeRefDraft,
		CanvasNodeRefDrafts,
		CanvasTextDrafts
	} from '$lib/canvas/view';
	import CanvasBoard from './CanvasBoard.svelte';
	import CanvasEdgeList from './CanvasEdgeList.svelte';

	interface Props {
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
		savingNodeId: string | null;
		movingNodeId: string | null;
		moveSavingNodeId: string | null;
		deletingNodeId: string | null;
		savingEdgeId: string | null;
		deletingEdgeId: string | null;
		onEdgeLabelDraftChange: (edge: CanvasEdgeSummary, value: string) => void;
		onSaveEdgeLabel: (edge: CanvasEdgeSummary) => void | Promise<void>;
		onDeleteEdge: (edgeId: string) => void | Promise<void>;
		onDraftChange: (node: CanvasNode, value: string) => void;
		onGroupLabelDraftChange: (node: CanvasNode, value: string) => void;
		onRefDraftChange: (node: CanvasNode, draft: CanvasNodeRefDraft) => void;
		onSaveNode: (node: CanvasNode) => void | Promise<void>;
		onSaveGroupLabel: (node: CanvasNode) => void | Promise<void>;
		onSaveRefNode: (node: CanvasNode) => void | Promise<void>;
		onOpenRefNode: (node: CanvasNode) => void;
		onDeleteNode: (node: CanvasNode) => void | Promise<void>;
		onMovePointerDown: (node: CanvasNode, event: PointerEvent) => void;
	}

	let {
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
		savingNodeId,
		movingNodeId,
		moveSavingNodeId,
		deletingNodeId,
		savingEdgeId,
		deletingEdgeId,
		onEdgeLabelDraftChange,
		onSaveEdgeLabel,
		onDeleteEdge,
		onDraftChange,
		onGroupLabelDraftChange,
		onRefDraftChange,
		onSaveNode,
		onSaveGroupLabel,
		onSaveRefNode,
		onOpenRefNode,
		onDeleteNode,
		onMovePointerDown
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
		{savingEdgeId}
		{deletingEdgeId}
		onLabelDraftChange={onEdgeLabelDraftChange}
		onSaveLabel={onSaveEdgeLabel}
		onDelete={onDeleteEdge}
	/>
	<CanvasBoard
		{nodes}
		{bounds}
		{lines}
		{textDrafts}
		{groupLabelDrafts}
		{refDrafts}
		{savingNodeId}
		{movingNodeId}
		{moveSavingNodeId}
		{deletingNodeId}
		{savingEdgeId}
		{deletingEdgeId}
		onDraftChange={onDraftChange}
		onGroupLabelDraftChange={onGroupLabelDraftChange}
		onRefDraftChange={onRefDraftChange}
		onSave={onSaveNode}
		onSaveGroupLabel={onSaveGroupLabel}
		onSaveRef={onSaveRefNode}
		onOpenRef={onOpenRefNode}
		onDelete={onDeleteNode}
		{onMovePointerDown}
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
