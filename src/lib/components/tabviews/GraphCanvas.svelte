<script lang="ts">
	import { onMount } from 'svelte';
	import type { GEdge, GNode } from '$lib/graph/sim';
	import { buildGraphCanvasEdges, type GraphSelectionBox } from '$lib/graph/view';
	import GraphEdgeLayer from './GraphEdgeLayer.svelte';
	import GraphNodeLayer from './GraphNodeLayer.svelte';

	interface Props {
		nodes: GNode[];
		visibleNodes: GNode[];
		visibleEdges: GEdge[];
		viewX: number;
		viewY: number;
		viewScale: number;
		nodeScale: number;
		hoverPath: string | null;
		selectedPaths: string[];
		selectionBox: GraphSelectionBox | null;
		onSvgMount: (element: SVGSVGElement | null) => void;
		onWheelGraph: (event: WheelEvent) => void;
		onPointerDownBackground: (event: PointerEvent) => void;
		onPointerMoveGraph: (event: PointerEvent) => void;
		onPointerUpGraph: (event: PointerEvent) => void;
		onNodePointerDown: (event: PointerEvent, node: GNode) => void;
		onNodePointerMove: (event: PointerEvent) => void;
		onNodePointerUp: (event: PointerEvent, node: GNode) => void;
		onNodeClick: (event: MouseEvent, node: GNode) => void;
		onNodeKeydown: (event: KeyboardEvent, node: GNode) => void;
		onHoverPath: (path: string | null) => void;
	}

	let {
		nodes,
		visibleNodes,
		visibleEdges,
		viewX,
		viewY,
		viewScale,
		nodeScale,
		hoverPath,
		selectedPaths,
		selectionBox,
		onSvgMount,
		onWheelGraph,
		onPointerDownBackground,
		onPointerMoveGraph,
		onPointerUpGraph,
		onNodePointerDown,
		onNodePointerMove,
		onNodePointerUp,
		onNodeClick,
		onNodeKeydown,
		onHoverPath
	}: Props = $props();

	let svgEl: SVGSVGElement | null = $state(null);
	const canvasEdges = $derived(buildGraphCanvasEdges(nodes, visibleEdges));

	onMount(() => {
		if (svgEl) onSvgMount(svgEl);
		return () => onSvgMount(null);
	});
</script>

<svg
	bind:this={svgEl}
	class="canvas"
	role="img"
	aria-label="Vault graph"
	onwheel={onWheelGraph}
	onpointerdown={onPointerDownBackground}
	onpointermove={onPointerMoveGraph}
	onpointerup={onPointerUpGraph}
	onpointercancel={onPointerUpGraph}
>
	<g transform={`translate(${viewX}, ${viewY}) scale(${viewScale})`}>
		<GraphEdgeLayer {canvasEdges} {hoverPath} {selectedPaths} />
		<GraphNodeLayer
			{visibleNodes}
			{nodeScale}
			{hoverPath}
			{selectedPaths}
			{onNodePointerDown}
			{onNodePointerMove}
			{onNodePointerUp}
			{onNodeClick}
			{onNodeKeydown}
			{onHoverPath}
		/>
	</g>
	{#if selectionBox}
		<rect
			class="selection-box"
			x={selectionBox.x}
			y={selectionBox.y}
			width={selectionBox.width}
			height={selectionBox.height}
		/>
	{/if}
</svg>

<style>
	.canvas {
		flex: 1;
		min-height: 0;
		display: block;
		background: var(--bg);
		cursor: grab;
		user-select: none;
		touch-action: none;
	}
	.canvas:active { cursor: grabbing; }

	.selection-box {
		fill: var(--accent-soft);
		stroke: var(--accent);
		stroke-width: 1;
		stroke-dasharray: 4 3;
		pointer-events: none;
	}
</style>
