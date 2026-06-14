<script lang="ts">
	import {
		CANVAS_EDGE_END_OPTIONS,
		CANVAS_EDGE_SIDE_OPTIONS,
		canvasEdgeLabelChanged,
		canvasEdgeLabelDraftFor,
		canvasEdgeRoutingChanged,
		canvasEdgeRoutingDraftFor,
		type CanvasEdgeLabelDrafts,
		type CanvasEdgeEnd,
		type CanvasEdgeRoutingDraft,
		type CanvasEdgeRoutingDrafts,
		type CanvasEdgeSide,
		type CanvasEdgeSummary
	} from '$lib/canvas/view';
	import {
		canvasEdgeMutationFlags,
		type CanvasMutationState
	} from '$lib/canvas/mutations';
	import CanvasColorPalette from './CanvasColorPalette.svelte';

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

	function updateRoutingDraft(edge: CanvasEdgeSummary, patch: Partial<CanvasEdgeRoutingDraft>): void {
		onRoutingDraftChange(edge, {
			...canvasEdgeRoutingDraftFor(edge, edgeRoutingDrafts),
			...patch
		});
	}
</script>

{#if edges.length > 0}
	<section class="edge-list" aria-label="Canvas edges">
		<div class="edge-list-title">Edges</div>
		<div class="edge-items">
			{#each edges as edge (edge.id)}
				{@const routingDraft = canvasEdgeRoutingDraftFor(edge, edgeRoutingDrafts)}
				{@const edgeMutation = canvasEdgeMutationFlags(edge.id, mutationState)}
				<div class="edge-item">
					<span class="edge-copy" title={edge.description}>
						<span>{edge.fromLabel}</span>
						<span class="arrow" aria-hidden="true">→</span>
						<span>{edge.toLabel}</span>
						{#if edge.label !== 'unlabeled'}
							<span class="label">({edge.label})</span>
						{/if}
					</span>
					<CanvasColorPalette
						kind="edge"
						label={edge.description}
						color={edge.color}
						saving={edgeMutation.saving}
						disabled={edgeMutation.disabled}
						onColorChange={(color) => onColorChange(edge, color)}
					/>
					<form
						class="edge-edit"
						onsubmit={(event) => {
							event.preventDefault();
							void onSaveLabel(edge);
						}}
					>
						<input
							class="edge-label-input"
							aria-label={`Edit label for canvas edge ${edge.description}`}
							placeholder="label"
							value={canvasEdgeLabelDraftFor(edge, edgeLabelDrafts)}
							disabled={edgeMutation.disabled}
							oninput={(event) => onLabelDraftChange(edge, event.currentTarget.value)}
						/>
						<button
							class="edge-save"
							aria-label={`Save canvas edge ${edge.description}`}
							disabled={!canvasEdgeLabelChanged(edge, edgeLabelDrafts) || edgeMutation.disabled}
						>
							{edgeMutation.saving ? 'Saving...' : 'Save'}
						</button>
					</form>
					<form
						class="edge-routing"
						onsubmit={(event) => {
							event.preventDefault();
							void onSaveRouting(edge);
						}}
					>
						<select
							aria-label={`Canvas edge ${edge.description} from side`}
							value={routingDraft.fromSide}
							disabled={edgeMutation.disabled}
							onchange={(event) => updateRoutingDraft(edge, {
								fromSide: event.currentTarget.value as CanvasEdgeSide
							})}
						>
							{#each CANVAS_EDGE_SIDE_OPTIONS as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
						<select
							aria-label={`Canvas edge ${edge.description} to side`}
							value={routingDraft.toSide}
							disabled={edgeMutation.disabled}
							onchange={(event) => updateRoutingDraft(edge, {
								toSide: event.currentTarget.value as CanvasEdgeSide
							})}
						>
							{#each CANVAS_EDGE_SIDE_OPTIONS as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
						<select
							aria-label={`Canvas edge ${edge.description} start endpoint`}
							value={routingDraft.fromEnd}
							disabled={edgeMutation.disabled}
							onchange={(event) => updateRoutingDraft(edge, {
								fromEnd: event.currentTarget.value as CanvasEdgeEnd
							})}
						>
							{#each CANVAS_EDGE_END_OPTIONS as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
						<select
							aria-label={`Canvas edge ${edge.description} end endpoint`}
							value={routingDraft.toEnd}
							disabled={edgeMutation.disabled}
							onchange={(event) => updateRoutingDraft(edge, {
								toEnd: event.currentTarget.value as CanvasEdgeEnd
							})}
						>
							{#each CANVAS_EDGE_END_OPTIONS as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
						<button
							class="edge-save"
							aria-label={`Save canvas edge routing ${edge.description}`}
							disabled={!canvasEdgeRoutingChanged(edge, edgeRoutingDrafts) || edgeMutation.disabled}
						>
							{edgeMutation.saving ? 'Saving...' : 'Route'}
						</button>
					</form>
					<button
						class="edge-remove"
						aria-label={`Remove canvas edge ${edge.description}`}
						disabled={edgeMutation.disabled}
						onclick={() => void onDelete(edge)}
					>
						{edgeMutation.deleting ? 'Removing...' : 'Remove'}
					</button>
				</div>
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
	.edge-item {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		min-width: 0;
		max-width: 860px;
		flex: 0 0 auto;
		border: 1px solid var(--border);
		border-radius: 5px;
		background: var(--bg);
		padding: 4px 5px 4px 8px;
	}
	.edge-copy {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		min-width: 0;
		color: var(--fg-muted);
		font-size: 0.73rem;
		white-space: nowrap;
	}
	.edge-copy span:first-child,
	.edge-copy span:nth-child(3) {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 110px;
	}
	.arrow,
	.label {
		color: var(--fg-dim);
	}
	.edge-edit {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		min-width: 0;
	}
	.edge-routing {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-width: 0;
	}
	.edge-routing select {
		width: 70px;
		border: 1px solid var(--border);
		border-radius: 4px;
		background: color-mix(in srgb, var(--bg-elev), transparent 28%);
		color: var(--fg-muted);
		font: inherit;
		font-size: 0.66rem;
		padding: 2px 4px;
	}
	.edge-routing select:focus {
		border-color: var(--accent);
		outline: none;
	}
	.edge-label-input {
		width: 112px;
		min-width: 80px;
		border: 1px solid var(--border);
		border-radius: 4px;
		background: color-mix(in srgb, var(--bg-elev), transparent 28%);
		color: var(--fg);
		font: inherit;
		font-size: 0.68rem;
		padding: 3px 6px;
	}
	.edge-label-input:focus {
		border-color: var(--accent);
		outline: none;
	}
	.edge-save,
	.edge-remove {
		border: 1px solid var(--border);
		border-radius: 4px;
		background: transparent;
		color: var(--fg-dim);
		font: inherit;
		font-size: 0.68rem;
		padding: 2px 6px;
		cursor: pointer;
	}
	.edge-save:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}
	.edge-remove:hover:not(:disabled) {
		border-color: var(--danger);
		color: var(--danger);
	}
	.edge-save:disabled,
	.edge-remove:disabled {
		cursor: default;
		opacity: 0.55;
	}

	@media (max-width: 760px) {
		.edge-list {
			grid-template-columns: 1fr;
			gap: 6px;
		}
	}
</style>
