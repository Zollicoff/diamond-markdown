<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { api } from '$lib/vault-api';
	import { on as onBus } from '$lib/events';
	import { openNote } from '$lib/workspace/actions';
	import { openModeForPointer } from '$lib/workspace/open-mode';
	import { buildGraphSimulationData } from '$lib/graph/data';
	import {
		type GNode,
		type GEdge
	} from '$lib/graph/sim';
	import { createGraphSimulationRunner } from '$lib/graph/simulation-runner';
	import {
		buildGraphProjection,
		selectNodesInBox,
		selectionBoxFromPoints
	} from '$lib/graph/view';
	import {
		centeredGraphTransform,
		graphDragMoved,
		graphNodePinnedPosition,
		graphNodeOpenTitle,
		graphViewportPoint,
		panGraphTransform,
		toggleGraphPathSelection,
		zoomGraphTransform
	} from '$lib/graph/interaction';
	import {
		createGraphSettingsState
	} from '$lib/graph/settings-state.svelte';
	import GraphStage from './GraphStage.svelte';
	import GraphToolbar from './GraphToolbar.svelte';

	interface Props {
		vaultId: string;
	}
	let { vaultId }: Props = $props();

	// --- Data ----------------------------------------------------------
	let nodes = $state<GNode[]>([]);
	let edges = $state<GEdge[]>([]);
	let loading = $state(false);
	let err = $state<string | null>(null);

	// --- View transform (pan + zoom) -----------------------------------
	let svgEl: SVGSVGElement | null = $state(null);
	let viewX = $state(0);
	let viewY = $state(0);
	let viewScale = $state(1);
	let isPanning = false;
	let panStartX = 0;
	let panStartY = 0;
	let panOrigX = 0;
	let panOrigY = 0;
	let selecting = $state(false);
	let selectStart = $state<{ x: number; y: number } | null>(null);
	let selectEnd = $state<{ x: number; y: number } | null>(null);

	// --- Drag state ----------------------------------------------------
	let draggingNode: GNode | null = null;
	let dragStart: { x: number; y: number } | null = null;
	let dragMoved = false;
	let suppressNextNodeClick = false;
	let hoverPath = $state<string | null>(null);
	let selectedPaths = $state<string[]>([]);

	// --- Tunable params (per-vault, persisted) -------------------------
	const graphSettings = createGraphSettingsState(() => vaultId);
	const settings = graphSettings.settings;
	let panelOpen = $state(false);
	const simulationRunner = createGraphSimulationRunner();

	function resetForces(): void {
		graphSettings.resetForces();
	}
	function resetFilters(): void {
		graphSettings.resetFilters();
	}

	$effect(() => {
		graphSettings.persist();
	});

	// --- Filter projection ---------------------------------------------
	const graphProjection = $derived.by(() => buildGraphProjection(
		nodes,
		edges,
		{ hideOrphans: settings.hideOrphans, searchQuery: settings.searchQuery },
		selectedPaths
	));
	const visiblePaths = $derived(graphProjection.visiblePaths);
	const visibleNodes = $derived(graphProjection.visibleNodes);
	const visibleEdges = $derived(graphProjection.visibleEdges);
	const filtersActive = $derived(graphProjection.filtersActive);
	const selectedCount = $derived(graphProjection.selectedCount);
	const selectionBox = $derived.by(() => selectionBoxFromPoints(selecting, selectStart, selectEnd));

	// --- Load + sim loop -----------------------------------------------
	let initialCenterDone = false;
	async function loadGraph(): Promise<void> {
		loading = true;
		err = null;
		try {
			const data = await api.graph(vaultId);
			const graph = buildGraphSimulationData(data);
			nodes = graph.nodes;
			edges = graph.edges;
			startSim();
			loading = false;
			if (!initialCenterDone) {
				await tick();
				center();
				initialCenterDone = true;
			}
		} catch (e) {
			err = (e as Error).message;
			loading = false;
		}
	}

	function startSim(): void {
		simulationRunner.start(
			nodes,
			edges,
			() => ({
				repulse: settings.repulse,
				linkForce: settings.linkForce,
				linkDist: settings.linkDist,
				centerForce: settings.centerForce
			}),
			() => {
				nodes = nodes; // nudge reactivity — sim mutates in place
			}
		);
	}

	// --- Pointer + view handlers ---------------------------------------
	function onWheel(e: WheelEvent): void {
		e.preventDefault();
		const rect = svgEl?.getBoundingClientRect();
		if (!rect) return;
		const next = zoomGraphTransform({
			screenPoint: graphViewportPoint({ x: e.clientX, y: e.clientY }, rect),
			deltaY: e.deltaY,
			transform: { viewX, viewY, viewScale }
		});
		viewX = next.viewX;
		viewY = next.viewY;
		viewScale = next.viewScale;
	}

	function capturePointer(el: Element, pointerId: number): void {
		try { el.setPointerCapture?.(pointerId); } catch { /* synthetic or already-captured pointer */ }
	}

	function releasePointer(el: Element, pointerId: number): void {
		try { el.releasePointerCapture?.(pointerId); } catch { /* synthetic or already-released pointer */ }
	}

	function screenPoint(e: PointerEvent): { x: number; y: number } | null {
		const rect = svgEl?.getBoundingClientRect();
		if (!rect) return null;
		return graphViewportPoint({ x: e.clientX, y: e.clientY }, rect);
	}

	function clearSelection(): void {
		selectedPaths = [];
	}

	function toggleSelection(path: string): void {
		selectedPaths = toggleGraphPathSelection(selectedPaths, path);
	}

	function finishSelection(additive: boolean): void {
		if (selectionBox) {
			selectedPaths = selectNodesInBox(
				visibleNodes,
				selectionBox,
				{ viewX, viewY, viewScale },
				selectedPaths,
				additive
			);
		}
		selecting = false;
		selectStart = null;
		selectEnd = null;
	}

	function onPointerDownBG(e: PointerEvent): void {
		if (e.shiftKey) {
			const point = screenPoint(e);
			if (!point) return;
			selecting = true;
			selectStart = point;
			selectEnd = point;
			isPanning = false;
			capturePointer(e.currentTarget as Element, e.pointerId);
			return;
		}
		isPanning = true;
		panStartX = e.clientX;
		panStartY = e.clientY;
		panOrigX = viewX;
		panOrigY = viewY;
		capturePointer(e.currentTarget as Element, e.pointerId);
	}

	function onPointerMoveBG(e: PointerEvent): void {
		if (selecting) {
			const point = screenPoint(e);
			if (point) selectEnd = point;
			return;
		}
		if (draggingNode) {
			if (!dragMoved) {
				dragMoved = graphDragMoved(
					dragStart ?? { x: e.clientX, y: e.clientY },
					{ x: e.clientX, y: e.clientY }
				);
			}
			const rect = svgEl?.getBoundingClientRect();
			if (!rect) return;
			const pinned = graphNodePinnedPosition(
				{ x: e.clientX, y: e.clientY },
				{ x: rect.left, y: rect.top },
				{ viewX, viewY, viewScale }
			);
			draggingNode.fx = pinned.x;
			draggingNode.fy = pinned.y;
			return;
		}
		if (!isPanning) return;
		const next = panGraphTransform(
			{ x: panOrigX, y: panOrigY },
			{ x: panStartX, y: panStartY },
			{ x: e.clientX, y: e.clientY }
		);
		viewX = next.viewX;
		viewY = next.viewY;
	}

	function onPointerUpBG(e: PointerEvent): void {
		if (selecting) {
			if (e.type === 'pointercancel') {
				selecting = false;
				selectStart = null;
				selectEnd = null;
			} else {
				finishSelection(e.metaKey || e.ctrlKey);
			}
			releasePointer(e.currentTarget as Element, e.pointerId);
			return;
		}
		if (draggingNode) {
			draggingNode.fx = null;
			draggingNode.fy = null;
			draggingNode = null;
			dragStart = null;
		}
		isPanning = false;
		releasePointer(e.currentTarget as Element, e.pointerId);
	}

	function onNodePointerDown(e: PointerEvent, n: GNode): void {
		e.stopPropagation();
		draggingNode = n;
		dragStart = { x: e.clientX, y: e.clientY };
		dragMoved = false;
		const rect = svgEl?.getBoundingClientRect();
		if (!rect) return;
		n.fx = n.x;
		n.fy = n.y;
		capturePointer(e.currentTarget as Element, e.pointerId);
	}

	function onNodePointerMove(e: PointerEvent): void {
		e.stopPropagation();
		onPointerMoveBG(e);
	}

	function onNodePointerUp(e: PointerEvent, n: GNode): void {
		e.stopPropagation();
		const shouldToggleSelection = e.type !== 'pointercancel' && e.shiftKey && !dragMoved;
		onPointerUpBG(e);
		if (shouldToggleSelection) {
			toggleSelection(n.path);
			suppressNextNodeClick = true;
		}
	}

	function onNodeClick(e: MouseEvent, n: GNode): void {
		e.stopPropagation();
		if (suppressNextNodeClick) {
			suppressNextNodeClick = false;
			return;
		}
		// Suppress the click the browser fires after a drag-release.
		if (dragMoved) {
			dragMoved = false;
			return;
		}
		if (e.shiftKey) {
			toggleSelection(n.path);
			return;
		}
		const title = graphNodeOpenTitle(n);
		openNote(vaultId, n.path, title, openModeForPointer(e, 'new-tab'));
	}

	function onNodeKeydown(e: KeyboardEvent, n: GNode): void {
		if (e.key !== 'Enter' && e.key !== ' ') return;
		e.preventDefault();
		e.stopPropagation();
		if (e.shiftKey) {
			toggleSelection(n.path);
			return;
		}
		const title = graphNodeOpenTitle(n);
		openNote(vaultId, n.path, title, 'new-tab');
	}

	function center(): void {
		if (!svgEl) return;
		const next = centeredGraphTransform(svgEl.getBoundingClientRect());
		viewX = next.viewX;
		viewY = next.viewY;
		viewScale = next.viewScale;
	}

	/** Restore force tunings + filters to factory defaults, then re-center
	 *  the viewport. (Distinct from Center, which only re-centers the
	 *  current view — useful when you've manually panned far off-screen
	 *  but want to keep your slider tweaks.) */
	function resetAll(): void {
		resetForces();
		resetFilters();
		center();
	}

	onMount(() => {
		graphSettings.hydrate();
		void loadGraph();
		const offs = [
			onBus('note:created', (e) => { if (e.vaultId === vaultId) void loadGraph(); }),
			onBus('note:deleted', (e) => { if (e.vaultId === vaultId) void loadGraph(); }),
			onBus('note:renamed', (e) => { if (e.vaultId === vaultId) void loadGraph(); }),
			onBus('note:saved',   (e) => { if (e.vaultId === vaultId) void loadGraph(); })
		];
		return () => offs.forEach((o) => o());
	});

	onDestroy(() => {
		simulationRunner.stop();
	});
</script>

<div class="graph-view">
	<GraphToolbar
		{filtersActive}
		visibleNodeCount={visibleNodes.length}
		totalNodeCount={nodes.length}
		visibleEdgeCount={visibleEdges.length}
		totalEdgeCount={edges.length}
		{selectedCount}
		{panelOpen}
		onClearSelection={clearSelection}
		onToggleSettings={() => (panelOpen = !panelOpen)}
		onReset={resetAll}
		onCenter={center}
	/>

	<GraphStage
		{loading}
		error={err}
		{nodes}
		{visibleNodes}
		{visibleEdges}
		{viewX}
		{viewY}
		{viewScale}
		nodeScale={settings.nodeScale}
		{hoverPath}
		{selectedPaths}
		{selectionBox}
		{panelOpen}
		{filtersActive}
		repulse={settings.repulse}
		linkForce={settings.linkForce}
		linkDist={settings.linkDist}
		centerForce={settings.centerForce}
		hideOrphans={settings.hideOrphans}
		searchQuery={settings.searchQuery}
		onSvgMount={(element) => (svgEl = element)}
		onWheelGraph={onWheel}
		onPointerDownBackground={onPointerDownBG}
		onPointerMoveGraph={onPointerMoveBG}
		onPointerUpGraph={onPointerUpBG}
		{onNodePointerDown}
		{onNodePointerMove}
		{onNodePointerUp}
		{onNodeClick}
		{onNodeKeydown}
		onHoverPath={(path) => (hoverPath = path)}
		onSetNodeScale={(value) => (settings.nodeScale = value)}
		onSetRepulse={(value) => (settings.repulse = value)}
		onSetLinkForce={(value) => (settings.linkForce = value)}
		onSetLinkDist={(value) => (settings.linkDist = value)}
		onSetCenterForce={(value) => (settings.centerForce = value)}
		onSetHideOrphans={(value) => (settings.hideOrphans = value)}
		onSetSearchQuery={(value) => (settings.searchQuery = value)}
		onResetForces={resetForces}
		onResetFilters={resetFilters}
		onCloseSettings={() => (panelOpen = false)}
	/>
</div>

<style>
	.graph-view {
		position: relative;
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		background: var(--bg);
	}
</style>
