<script lang="ts">
	import { nodeRadius, type GNode } from '$lib/graph/sim';

	interface Props {
		visibleNodes: GNode[];
		nodeScale: number;
		hoverPath: string | null;
		selectedPaths: string[];
		onNodePointerDown: (event: PointerEvent, node: GNode) => void;
		onNodePointerMove: (event: PointerEvent) => void;
		onNodePointerUp: (event: PointerEvent, node: GNode) => void;
		onNodeClick: (event: MouseEvent, node: GNode) => void;
		onNodeKeydown: (event: KeyboardEvent, node: GNode) => void;
		onHoverPath: (path: string | null) => void;
	}

	let {
		visibleNodes,
		nodeScale,
		hoverPath,
		selectedPaths,
		onNodePointerDown,
		onNodePointerMove,
		onNodePointerUp,
		onNodeClick,
		onNodeKeydown,
		onHoverPath
	}: Props = $props();
</script>

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

<style>
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
	.node:hover circle,
	.node.hl circle {
		fill: var(--brand-cyan);
		cursor: pointer;
	}
	.node.selected circle {
		fill: var(--accent);
		stroke: var(--fg);
		stroke-width: 2;
	}
	.node:hover text,
	.node.hl text { fill: var(--fg); }
	.node.selected text { fill: var(--fg); }
</style>
