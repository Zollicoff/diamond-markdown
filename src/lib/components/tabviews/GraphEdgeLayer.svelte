<script lang="ts">
	import type { GraphCanvasEdge } from '$lib/graph/view';

	interface Props {
		canvasEdges: GraphCanvasEdge[];
		hoverPath: string | null;
		selectedPaths: string[];
	}

	let { canvasEdges, hoverPath, selectedPaths }: Props = $props();
</script>

{#each canvasEdges as canvasEdge (canvasEdge.key)}
	<line
		x1={canvasEdge.from.x} y1={canvasEdge.from.y} x2={canvasEdge.to.x} y2={canvasEdge.to.y}
		class="edge"
		class:hl={hoverPath === canvasEdge.edge.from || hoverPath === canvasEdge.edge.to}
		class:selected={selectedPaths.includes(canvasEdge.edge.from) && selectedPaths.includes(canvasEdge.edge.to)}
	/>
{/each}

<style>
	.edge {
		stroke: var(--border-strong);
		stroke-width: 1;
		opacity: 0.55;
		pointer-events: none;
	}
	.edge.hl { stroke: var(--brand-cyan); opacity: 1; stroke-width: 1.4; }
	.edge.selected { stroke: var(--accent); opacity: 0.9; stroke-width: 1.5; }
</style>
