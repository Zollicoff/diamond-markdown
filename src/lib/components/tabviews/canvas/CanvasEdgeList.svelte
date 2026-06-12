<script lang="ts">
	import type { CanvasEdgeSummary } from '$lib/canvas/view';

	interface Props {
		edges: CanvasEdgeSummary[];
		deletingEdgeId: string | null;
		onDelete: (edgeId: string) => void | Promise<void>;
	}

	let { edges, deletingEdgeId, onDelete }: Props = $props();
</script>

{#if edges.length > 0}
	<section class="edge-list" aria-label="Canvas edges">
		<div class="edge-list-title">Edges</div>
		<div class="edge-items">
			{#each edges as edge (edge.id)}
				<div class="edge-item">
					<span class="edge-copy" title={edge.description}>
						<span>{edge.fromLabel}</span>
						<span class="arrow" aria-hidden="true">→</span>
						<span>{edge.toLabel}</span>
						{#if edge.label !== 'unlabeled'}
							<span class="label">({edge.label})</span>
						{/if}
					</span>
					<button
						class="edge-remove"
						aria-label={`Remove canvas edge ${edge.description}`}
						disabled={deletingEdgeId !== null}
						onclick={() => void onDelete(edge.id)}
					>
						{deletingEdgeId === edge.id ? 'Removing...' : 'Remove'}
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
		max-width: 360px;
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
	.edge-remove:hover:not(:disabled) {
		border-color: var(--danger);
		color: var(--danger);
	}
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
