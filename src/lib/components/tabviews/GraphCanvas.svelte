<script lang="ts">
	import { onMount } from 'svelte';
	import { nodeRadius, type GEdge, type GNode } from '$lib/graph/sim';
	import type { GraphSelectionBox } from '$lib/graph/view';

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
		{#each visibleEdges as edge, i (i)}
			{@const a = nodes.find((node) => node.path === edge.from)}
			{@const b = nodes.find((node) => node.path === edge.to)}
			{#if a && b}
				<line
					x1={a.x} y1={a.y} x2={b.x} y2={b.y}
					class="edge"
					class:hl={hoverPath === edge.from || hoverPath === edge.to}
					class:selected={selectedPaths.includes(edge.from) && selectedPaths.includes(edge.to)}
				/>
			{/if}
		{/each}
		{#each visibleNodes as node (node.path)}
			<g
				class="node"
				class:hl={hoverPath === node.path}
				class:selected={selectedPaths.includes(node.path)}
				transform={`translate(${node.x}, ${node.y})`}
				onpointerdown={(event) => onNodePointerDown(event, node)}
				onpointermove={onNodePointerMove}
				onpointerup={(event) => onNodePointerUp(event, node)}
				onpointercancel={(event) => onNodePointerUp(event, node)}
				onclick={(event) => onNodeClick(event, node)}
				onkeydown={(event) => onNodeKeydown(event, node)}
				onmouseenter={() => onHoverPath(node.path)}
				onmouseleave={() => onHoverPath(null)}
				role="button"
				tabindex="0"
				aria-pressed={selectedPaths.includes(node.path)}
			>
				<circle r={nodeRadius(node, nodeScale)} />
				<text dy="-8">{node.title}</text>
			</g>
		{/each}
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

	.edge {
		stroke: var(--border-strong);
		stroke-width: 1;
		opacity: 0.55;
		pointer-events: none;
	}
	.edge.hl { stroke: var(--brand-cyan); opacity: 1; stroke-width: 1.4; }
	.edge.selected { stroke: var(--accent); opacity: 0.9; stroke-width: 1.5; }

	.node circle {
		fill: var(--fg-muted);
		stroke: var(--bg);
		stroke-width: 1.5;
		transition: fill 0.15s;
	}
	.node text {
		font-family: var(--sans);
		font-size: 11px;
		fill: var(--fg-dim);
		text-anchor: middle;
		pointer-events: none;
		paint-order: stroke;
		stroke: var(--bg);
		stroke-width: 3px;
		stroke-linejoin: round;
	}
	.node:hover circle, .node.hl circle {
		fill: var(--brand-cyan);
		cursor: pointer;
	}
	.node.selected circle {
		fill: var(--accent);
		stroke: var(--fg);
		stroke-width: 2;
	}
	.node:hover text, .node.hl text { fill: var(--fg); }
	.node.selected text { fill: var(--fg); }

	.selection-box {
		fill: var(--accent-soft);
		stroke: var(--accent);
		stroke-width: 1;
		stroke-dasharray: 4 3;
		pointer-events: none;
	}
</style>
