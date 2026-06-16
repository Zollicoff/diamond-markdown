<script lang="ts">
	import type { GEdge, GNode } from '$lib/graph/sim';
	import type { GraphSelectionBox } from '$lib/graph/view';
	import GraphCanvas from './GraphCanvas.svelte';
	import GraphSettingsPanel from './GraphSettingsPanel.svelte';

	interface Props {
		loading: boolean;
		error: string | null;
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
		panelOpen: boolean;
		filtersActive: boolean;
		repulse: number;
		linkForce: number;
		linkDist: number;
		centerForce: number;
		hideOrphans: boolean;
		searchQuery: string;
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
		onSetNodeScale: (value: number) => void;
		onSetRepulse: (value: number) => void;
		onSetLinkForce: (value: number) => void;
		onSetLinkDist: (value: number) => void;
		onSetCenterForce: (value: number) => void;
		onSetHideOrphans: (value: boolean) => void;
		onSetSearchQuery: (value: string) => void;
		onResetForces: () => void;
		onResetFilters: () => void;
		onCloseSettings: () => void;
	}

	let {
		loading,
		error,
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
		panelOpen,
		filtersActive,
		repulse,
		linkForce,
		linkDist,
		centerForce,
		hideOrphans,
		searchQuery,
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
		onHoverPath,
		onSetNodeScale,
		onSetRepulse,
		onSetLinkForce,
		onSetLinkDist,
		onSetCenterForce,
		onSetHideOrphans,
		onSetSearchQuery,
		onResetForces,
		onResetFilters,
		onCloseSettings
	}: Props = $props();
</script>

<div class="graph-stage">
	{#if loading && nodes.length === 0}
		<p class="status">Building graph...</p>
	{:else if error}
		<p class="err">{error}</p>
	{:else if nodes.length === 0}
		<p class="status">No notes yet - add some and come back.</p>
	{:else}
		<GraphCanvas
			{nodes}
			{visibleNodes}
			{visibleEdges}
			{viewX}
			{viewY}
			{viewScale}
			{nodeScale}
			{hoverPath}
			{selectedPaths}
			{selectionBox}
			{onSvgMount}
			{onWheelGraph}
			{onPointerDownBackground}
			{onPointerMoveGraph}
			{onPointerUpGraph}
			{onNodePointerDown}
			{onNodePointerMove}
			{onNodePointerUp}
			{onNodeClick}
			{onNodeKeydown}
			{onHoverPath}
		/>
	{/if}

	{#if panelOpen}
		<GraphSettingsPanel
			{nodeScale}
			{repulse}
			{linkForce}
			{linkDist}
			{centerForce}
			{hideOrphans}
			{searchQuery}
			{filtersActive}
			{onSetNodeScale}
			{onSetRepulse}
			{onSetLinkForce}
			{onSetLinkDist}
			{onSetCenterForce}
			{onSetHideOrphans}
			{onSetSearchQuery}
			{onResetForces}
			{onResetFilters}
			onClose={onCloseSettings}
		/>
	{/if}

	<footer class="legend">
		<span>Drag a node to pin · drag background to pan · shift-click or shift-drag to select · scroll to zoom · click to open in new tab · alt+click for new pane</span>
	</footer>
</div>

<style>
	.graph-stage {
		display: flex;
		flex: 1;
		min-height: 0;
		flex-direction: column;
	}

	.status, .err {
		flex: 1;
		min-height: 0;
		padding: 2rem;
		text-align: center;
		color: var(--fg-dim);
		font-size: 0.9rem;
	}
	.err { color: var(--danger); }

	.legend {
		border-top: 1px solid var(--border);
		padding: 6px 14px;
		font-size: 0.74rem;
		color: var(--fg-dim);
	}
</style>
