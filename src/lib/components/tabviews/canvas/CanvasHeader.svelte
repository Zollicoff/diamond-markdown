<script lang="ts">
	import type { CanvasDoc } from '$lib/types';
	import {
		canvasSummary,
		type CanvasAddNodeType,
		type CanvasNodeOption
	} from '$lib/canvas/view';
	import CanvasAddNodeForm from './CanvasAddNodeForm.svelte';
	import CanvasEdgeForm from './CanvasEdgeForm.svelte';

	interface Props {
		doc: CanvasDoc | null;
		path: string;
		addingNode: boolean;
		addingEdge: boolean;
		canAddEdge: boolean;
		nodeOptions: CanvasNodeOption[];
		edgeFromNodeId: string;
		edgeToNodeId: string;
		edgeLabel: string;
		exportHref: string;
		exportName: string;
		onAddNode: (type: CanvasAddNodeType, value: string) => void | Promise<void>;
		onAddEdge: () => void | Promise<void>;
		onEdgeFromNodeChange: (nodeId: string) => void;
		onEdgeToNodeChange: (nodeId: string) => void;
		onEdgeLabelChange: (label: string) => void;
	}

	let {
		doc,
		path,
		addingNode,
		addingEdge,
		canAddEdge,
		nodeOptions,
		edgeFromNodeId,
		edgeToNodeId,
		edgeLabel,
		exportHref,
		exportName,
		onAddNode,
		onAddEdge,
		onEdgeFromNodeChange,
		onEdgeToNodeChange,
		onEdgeLabelChange
	}: Props = $props();

	const title = $derived(doc?.title ?? path.split('/').pop()?.replace(/\.canvas$/i, '') ?? 'Canvas');
</script>

<header class="canvas-head">
	<div>
		<h2>{title}</h2>
		<p class="mono">{path}</p>
	</div>
	{#if doc}
		<div class="canvas-actions">
			<div class="canvas-stats mono">{canvasSummary(doc)} · editable text cards</div>
			<CanvasAddNodeForm adding={addingNode} onAdd={onAddNode} />
			<CanvasEdgeForm
				{nodeOptions}
				fromNodeId={edgeFromNodeId}
				toNodeId={edgeToNodeId}
				label={edgeLabel}
				adding={addingEdge}
				canAdd={canAddEdge}
				onFromNodeChange={onEdgeFromNodeChange}
				onToNodeChange={onEdgeToNodeChange}
				onLabelChange={onEdgeLabelChange}
				onSubmit={onAddEdge}
			/>
			<a class="mini" href={exportHref} download={exportName}>Download SVG</a>
		</div>
	{/if}
</header>

<style>
	.canvas-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 10px 14px;
		border-bottom: 1px solid var(--border);
	}
	h2 {
		margin: 0;
		font-family: 'Bricolage Grotesque', var(--sans);
		font-size: 0.96rem;
	}
	.canvas-head p {
		margin: 3px 0 0;
		color: var(--fg-dim);
		font-size: 0.72rem;
	}
	.canvas-stats {
		color: var(--fg-dim);
		font-size: 0.72rem;
		white-space: nowrap;
	}
	.canvas-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 10px;
	}
	.mini {
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 3px 9px;
		color: var(--fg-muted);
		font: inherit;
		font-size: 0.76rem;
		text-decoration: none;
		white-space: nowrap;
	}
	.mini:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	.mono {
		font-family: var(--mono);
		font-variant-numeric: tabular-nums;
	}

	@media (max-width: 900px) {
		.canvas-head {
			align-items: flex-start;
		}
		.canvas-actions {
			justify-content: flex-start;
		}
	}
</style>
