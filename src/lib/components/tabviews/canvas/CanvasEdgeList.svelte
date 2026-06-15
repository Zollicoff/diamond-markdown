<script lang="ts">
	import {
		type CanvasEdgeLabelDrafts,
		type CanvasEdgeRoutingDraft,
		type CanvasEdgeRoutingDrafts,
		type CanvasEdgeSummary
	} from '$lib/canvas/view';
	import {
		canvasEdgeMutationFlags,
		type CanvasMutationState
	} from '$lib/canvas/mutations';
	import CanvasEdgeListItem from './CanvasEdgeListItem.svelte';

	interface Props {
		edges: CanvasEdgeSummary[];
		edgeLabelDrafts: CanvasEdgeLabelDrafts;
		edgeRoutingDrafts: CanvasEdgeRoutingDrafts;
		mutationState: CanvasMutationState;
		onLabelDraftChange: (edge: CanvasEdgeSummary, value: string) => void;
		onRoutingDraftChange: (edge: CanvasEdgeSummary, draft: CanvasEdgeRoutingDraft) => void;
		onSaveLabel: (edge: CanvasEdgeSummary) => void | Promise<void>;
		onColorChange: (edge: CanvasEdgeSummary, color: string) => void | Promise<void>;
		onSaveRouting: (edge: CanvasEdgeSummary) => void | Promise<void>;
		onDelete: (edge: CanvasEdgeSummary) => void | Promise<void>;
	}

	let {
		edges,
		edgeLabelDrafts,
		edgeRoutingDrafts,
		mutationState,
		onLabelDraftChange,
		onRoutingDraftChange,
		onSaveLabel,
		onColorChange,
		onSaveRouting,
		onDelete
	}: Props = $props();
</script>

{#if edges.length > 0}
	<section class="edge-list" aria-label="Canvas edges">
		<div class="edge-list-title">Edges</div>
		<div class="edge-items">
			{#each edges as edge (edge.id)}
				<CanvasEdgeListItem
					{edge}
					{edgeLabelDrafts}
					{edgeRoutingDrafts}
					edgeMutation={canvasEdgeMutationFlags(edge.id, mutationState)}
					{onLabelDraftChange}
					{onRoutingDraftChange}
					{onSaveLabel}
					{onColorChange}
					{onSaveRouting}
					{onDelete}
				/>
			{/each}
		</div>
	</section>
{/if}

<style>
	.edge-list {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 10px;
		align-items: center;
		padding: 8px 14px;
		border-bottom: 1px solid var(--border);
		background: color-mix(in srgb, var(--bg-elev), transparent 42%);
	}
	.edge-list-title {
		color: var(--fg-dim);
		font-family: var(--mono);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.edge-items {
		display: flex;
		gap: 6px;
		min-width: 0;
		overflow-x: auto;
		padding-bottom: 1px;
	}

	@media (max-width: 760px) {
		.edge-list {
			grid-template-columns: 1fr;
			gap: 6px;
		}
	}
</style>
