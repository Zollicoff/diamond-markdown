<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { api } from '$lib/vault-api';
	import { on as onBus } from '$lib/events';
	import { openNote } from '$lib/workspace/actions';
	import { buildGraphSimulationData } from '$lib/graph/data';
	import {
		simulateStep,
		type GNode,
		type GEdge
	} from '$lib/graph/sim';
	import {
		buildGraphProjection,
		selectNodesInBox,
		selectionBoxFromPoints
	} from '$lib/graph/view';
	import {
		graphDragMoved,
		graphNodeOpenTitle,
		panGraphTransform,
		toggleGraphPathSelection,
		zoomGraphTransform
	} from '$lib/graph/interaction';
	import {
		createGraphSettingsState
	} from '$lib/graph/settings-state.svelte';
	import GraphCanvas from './GraphCanvas.svelte';
	import GraphSettingsPanel from './GraphSettingsPanel.svelte';
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
	let dragStartX = 0;
	let dragStartY = 0;
	let dragMoved = false;
	let suppressNextNodeClick = false;
	let hoverPath = $state<string | null>(null);
	let selectedPaths = $state<string[]>([]);

	// --- Tunable params (per-vault, persisted) -------------------------
	const graphSettings = createGraphSettingsState(() => vaultId);
	const settings = graphSettings.settings;
	let panelOpen = $state(false);

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

	let rafId = 0;
	let lastTick = 0;
	function startSim(): void {
		cancelAnimationFrame(rafId);
		lastTick = performance.now();
		const tick = (now: number): void => {
			const dt = Math.min(32, now - lastTick) / 16; // normalize to ~60fps
			lastTick = now;
			simulateStep(nodes, edges, dt, {
				repulse: settings.repulse,
				linkForce: settings.linkForce,
				linkDist: settings.linkDist,
				centerForce: settings.centerForce
			});
			nodes = nodes; // nudge reactivity — sim mutates in place
			rafId = requestAnimationFrame(tick);
		};
		rafId = requestAnimationFrame(tick);
	}

	// --- Pointer + view handlers ---------------------------------------
	function onWheel(e: WheelEvent): void {
		e.preventDefault();
		const rect = svgEl?.getBoundingClientRect();
		if (!rect) return;
		const cx = e.clientX - rect.left;
		const cy = e.clientY - rect.top;
		const next = zoomGraphTransform({
			screenPoint: { x: cx, y: cy },
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
		return { x: e.clientX - rect.left, y: e.clientY - rect.top };
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
					{ x: dragStartX, y: dragStartY },
					{ x: e.clientX, y: e.clientY }
				);
			}
			const rect = svgEl?.getBoundingClientRect();
			if (!rect) return;
			draggingNode.fx = (e.clientX - rect.left - viewX) / viewScale;
			draggingNode.fy = (e.clientY - rect.top - viewY) / viewScale;
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
		}
		isPanning = false;
		releasePointer(e.currentTarget as Element, e.pointerId);
	}

	function onNodePointerDown(e: PointerEvent, n: GNode): void {
		e.stopPropagation();
		draggingNode = n;
		dragStartX = e.clientX;
		dragStartY = e.clientY;
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
		const mode = e.altKey ? 'new-pane' : 'new-tab';
		openNote(vaultId, n.path, title, mode);
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
		const rect = svgEl.getBoundingClientRect();
		viewX = rect.width / 2;
		viewY = rect.height / 2;
		viewScale = 1;
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
		cancelAnimationFrame(rafId);
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

	{#if loading && nodes.length === 0}
		<p class="status">Building graph…</p>
	{:else if err}
		<p class="err">{err}</p>
	{:else if nodes.length === 0}
		<p class="status">No notes yet — add some and come back.</p>
	{:else}
		<GraphCanvas
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
		/>
	{/if}

			{#if panelOpen}
		<GraphSettingsPanel
			nodeScale={settings.nodeScale}
			repulse={settings.repulse}
			linkForce={settings.linkForce}
			linkDist={settings.linkDist}
			centerForce={settings.centerForce}
			hideOrphans={settings.hideOrphans}
			searchQuery={settings.searchQuery}
			{filtersActive}
			onSetNodeScale={(v) => (settings.nodeScale = v)}
			onSetRepulse={(v) => (settings.repulse = v)}
			onSetLinkForce={(v) => (settings.linkForce = v)}
			onSetLinkDist={(v) => (settings.linkDist = v)}
			onSetCenterForce={(v) => (settings.centerForce = v)}
			onSetHideOrphans={(v) => (settings.hideOrphans = v)}
			onSetSearchQuery={(v) => (settings.searchQuery = v)}
			onResetForces={resetForces}
			onResetFilters={resetFilters}
			onClose={() => (panelOpen = false)}
		/>
	{/if}

	<footer class="legend">
		<span>Drag a node to pin · drag background to pan · shift-click or shift-drag to select · scroll to zoom · click to open in new tab · alt+click for new pane</span>
	</footer>
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

	.status, .err {
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
