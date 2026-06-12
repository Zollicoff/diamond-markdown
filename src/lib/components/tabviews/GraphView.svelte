<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { api } from '$lib/vault-api';
	import { on as onBus } from '$lib/events';
	import { openNote } from '$lib/workspace/actions';
	import {
		simulateStep,
		SIM_DEFAULTS,
		type GNode,
		type GEdge
	} from '$lib/graph/sim';
	import {
		buildGraphProjection,
		selectNodesInBox,
		selectionBoxFromPoints
	} from '$lib/graph/view';
	import GraphCanvas from './GraphCanvas.svelte';
	import GraphSettingsPanel from './GraphSettingsPanel.svelte';

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
	const DRAG_THRESHOLD = 4; // px before a press counts as a drag, not a click
	let hoverPath = $state<string | null>(null);
	let selectedPaths = $state<string[]>([]);

	// --- Tunable params (per-vault, persisted) -------------------------
	let nodeScale = $state(SIM_DEFAULTS.nodeScale);
	let repulse = $state(SIM_DEFAULTS.repulse);
	let linkForce = $state(SIM_DEFAULTS.linkForce);
	let linkDist = $state(SIM_DEFAULTS.linkDist);
	let centerForce = $state(SIM_DEFAULTS.centerForce);
	let hideOrphans = $state(false);
	let searchQuery = $state('');
	let panelOpen = $state(false);
	let settingsHydrated = false;

	const settingsKey = (): string => `diamondmd:graph-settings:${vaultId}`;

	function hydrateSettings(): void {
		if (typeof localStorage === 'undefined') return;
		try {
			const raw = localStorage.getItem(settingsKey());
			if (!raw) return;
			const v = JSON.parse(raw) as Partial<typeof SIM_DEFAULTS> & { hideOrphans?: boolean; searchQuery?: string };
			if (typeof v.nodeScale === 'number') nodeScale = v.nodeScale;
			if (typeof v.repulse === 'number') repulse = v.repulse;
			if (typeof v.linkForce === 'number') linkForce = v.linkForce;
			if (typeof v.linkDist === 'number') linkDist = v.linkDist;
			if (typeof v.centerForce === 'number') centerForce = v.centerForce;
			if (typeof v.hideOrphans === 'boolean') hideOrphans = v.hideOrphans;
			if (typeof v.searchQuery === 'string') searchQuery = v.searchQuery;
		} catch { /* corrupt JSON — stick with defaults */ }
	}

	function resetForces(): void {
		nodeScale = SIM_DEFAULTS.nodeScale;
		repulse = SIM_DEFAULTS.repulse;
		linkForce = SIM_DEFAULTS.linkForce;
		linkDist = SIM_DEFAULTS.linkDist;
		centerForce = SIM_DEFAULTS.centerForce;
	}
	function resetFilters(): void {
		hideOrphans = false;
		searchQuery = '';
	}

	$effect(() => {
		const snapshot = { nodeScale, repulse, linkForce, linkDist, centerForce, hideOrphans, searchQuery };
		if (!settingsHydrated || typeof localStorage === 'undefined') return;
		try { localStorage.setItem(settingsKey(), JSON.stringify(snapshot)); } catch { /* quota / private mode */ }
	});

	// --- Filter projection ---------------------------------------------
	const graphProjection = $derived.by(() => buildGraphProjection(
		nodes,
		edges,
		{ hideOrphans, searchQuery },
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
			const byPath = new Map<string, GNode>();
			for (const n of data.nodes) {
				byPath.set(n.path, {
					path: n.path,
					title: n.title,
					degree: n.degree,
					x: (Math.random() - 0.5) * 400,
					y: (Math.random() - 0.5) * 400,
					vx: 0,
					vy: 0,
					fx: null,
					fy: null
				});
			}
			nodes = [...byPath.values()];
			edges = data.edges.filter((e) => byPath.has(e.from) && byPath.has(e.to));
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
			simulateStep(nodes, edges, dt, { repulse, linkForce, linkDist, centerForce });
			nodes = nodes; // nudge reactivity — sim mutates in place
			rafId = requestAnimationFrame(tick);
		};
		rafId = requestAnimationFrame(tick);
	}

	// --- Pointer + view handlers ---------------------------------------
	function onWheel(e: WheelEvent): void {
		e.preventDefault();
		const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
		const rect = svgEl?.getBoundingClientRect();
		if (!rect) return;
		const cx = e.clientX - rect.left;
		const cy = e.clientY - rect.top;
		const wx = (cx - viewX) / viewScale;
		const wy = (cy - viewY) / viewScale;
		viewScale = Math.max(0.2, Math.min(4, viewScale * factor));
		viewX = cx - wx * viewScale;
		viewY = cy - wy * viewScale;
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
		selectedPaths = selectedPaths.includes(path)
			? selectedPaths.filter((p) => p !== path)
			: [...selectedPaths, path];
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
				const dx = e.clientX - dragStartX;
				const dy = e.clientY - dragStartY;
				if (dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) dragMoved = true;
			}
			const rect = svgEl?.getBoundingClientRect();
			if (!rect) return;
			draggingNode.fx = (e.clientX - rect.left - viewX) / viewScale;
			draggingNode.fy = (e.clientY - rect.top - viewY) / viewScale;
			return;
		}
		if (!isPanning) return;
		viewX = panOrigX + (e.clientX - panStartX);
		viewY = panOrigY + (e.clientY - panStartY);
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
		const title = n.title || n.path.split('/').pop()!.replace(/\.md$/, '');
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
		const title = n.title || n.path.split('/').pop()!.replace(/\.md$/, '');
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
		hydrateSettings();
		settingsHydrated = true;
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
	<header class="bar">
		<h2>Graph</h2>
		<span class="count mono">
			{#if filtersActive}
				{visibleNodes.length} of {nodes.length} nodes · {visibleEdges.length} edges
			{:else}
				{nodes.length} nodes · {edges.length} edges
			{/if}
		</span>
		{#if selectedCount > 0}
			<span class="selected-count mono">{selectedCount} selected</span>
			<button class="mini" onclick={clearSelection} title="Clear graph selection">Clear</button>
		{/if}
		<span class="spacer"></span>
		<button class="mini" class:active={panelOpen} onclick={() => (panelOpen = !panelOpen)} title="Forces, filters, display">⚙ Settings</button>
		<button class="mini" onclick={resetAll} title="Restore force defaults, clear filters, re-center">Reset</button>
		<button class="mini" onclick={center} title="Re-center the current view">Center</button>
	</header>

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
			{nodeScale}
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
			{nodeScale}
			{repulse}
			{linkForce}
			{linkDist}
			{centerForce}
			{hideOrphans}
			{searchQuery}
			{filtersActive}
			onSetNodeScale={(v) => (nodeScale = v)}
			onSetRepulse={(v) => (repulse = v)}
			onSetLinkForce={(v) => (linkForce = v)}
			onSetLinkDist={(v) => (linkDist = v)}
			onSetCenterForce={(v) => (centerForce = v)}
			onSetHideOrphans={(v) => (hideOrphans = v)}
			onSetSearchQuery={(v) => (searchQuery = v)}
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
	.bar {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 14px;
		border-bottom: 1px solid var(--border);
	}
	h2 {
		font-family: 'Bricolage Grotesque', var(--sans);
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;
	}
	.count { font-size: 0.72rem; color: var(--fg-dim); }
	.selected-count {
		font-size: 0.72rem;
		color: var(--accent);
		background: var(--accent-soft);
		border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
		border-radius: 999px;
		padding: 2px 8px;
	}
	.spacer { flex: 1; }
	.mini {
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 3px 9px;
		color: var(--fg-muted);
		cursor: pointer;
		font: inherit;
		font-size: 0.76rem;
	}
	.mini:hover { color: var(--accent); border-color: var(--accent); }
	.mini.active { color: var(--accent); border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }

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
	.mono { font-family: var(--mono); font-variant-numeric: tabular-nums; }
</style>
