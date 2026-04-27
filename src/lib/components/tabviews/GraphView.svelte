<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { api } from '$lib/vault-api';
	import { on as onBus } from '$lib/events';
	import { openNote } from '$lib/workspace/actions';
	import {
		simulateStep,
		nodeRadius,
		SIM_DEFAULTS,
		type GNode,
		type GEdge
	} from '$lib/graph/sim';
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

	// --- Drag state ----------------------------------------------------
	let draggingNode: GNode | null = null;
	let dragStartX = 0;
	let dragStartY = 0;
	let dragMoved = false;
	const DRAG_THRESHOLD = 4; // px before a press counts as a drag, not a click
	let hoverPath = $state<string | null>(null);

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
	const visiblePaths = $derived.by<Set<string>>(() => {
		const q = searchQuery.trim().toLowerCase();
		const set = new Set<string>();
		for (const n of nodes) {
			if (hideOrphans && n.degree === 0) continue;
			if (q && !n.title.toLowerCase().includes(q) && !n.path.toLowerCase().includes(q)) continue;
			set.add(n.path);
		}
		return set;
	});
	const visibleNodes = $derived<GNode[]>(nodes.filter((n) => visiblePaths.has(n.path)));
	const visibleEdges = $derived<GEdge[]>(edges.filter((e) => visiblePaths.has(e.from) && visiblePaths.has(e.to)));
	const filtersActive = $derived<boolean>(hideOrphans || searchQuery.trim().length > 0);

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

	function onPointerDownBG(e: PointerEvent): void {
		isPanning = true;
		panStartX = e.clientX;
		panStartY = e.clientY;
		panOrigX = viewX;
		panOrigY = viewY;
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
	}

	function onPointerMoveBG(e: PointerEvent): void {
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
		if (draggingNode) {
			draggingNode.fx = null;
			draggingNode.fy = null;
			draggingNode = null;
		}
		isPanning = false;
		(e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
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
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
	}

	function onNodeClick(e: MouseEvent, n: GNode): void {
		e.stopPropagation();
		// Suppress the click the browser fires after a drag-release.
		if (dragMoved) {
			dragMoved = false;
			return;
		}
		if (e.shiftKey) return; // reserved for multiselect later
		const title = n.title || n.path.split('/').pop()!.replace(/\.md$/, '');
		const mode = e.altKey ? 'new-pane' : 'new-tab';
		openNote(vaultId, n.path, title, mode);
	}

	function resetView(): void {
		viewX = 0;
		viewY = 0;
		viewScale = 1;
	}
	function center(): void {
		if (!svgEl) return;
		const rect = svgEl.getBoundingClientRect();
		viewX = rect.width / 2;
		viewY = rect.height / 2;
		viewScale = 1;
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
		<span class="spacer"></span>
		<button class="mini" class:active={panelOpen} onclick={() => (panelOpen = !panelOpen)} title="Forces, filters, display">⚙ Settings</button>
		<button class="mini" onclick={resetView}>Reset</button>
		<button class="mini" onclick={center}>Center</button>
	</header>

	{#if loading && nodes.length === 0}
		<p class="status">Building graph…</p>
	{:else if err}
		<p class="err">{err}</p>
	{:else if nodes.length === 0}
		<p class="status">No notes yet — add some and come back.</p>
	{:else}
		<svg
			bind:this={svgEl}
			class="canvas"
			onwheel={onWheel}
			onpointerdown={onPointerDownBG}
			onpointermove={onPointerMoveBG}
			onpointerup={onPointerUpBG}
			onpointercancel={onPointerUpBG}
		>
			<g transform={`translate(${viewX}, ${viewY}) scale(${viewScale})`}>
				{#each visibleEdges as e, i (i)}
					{@const a = nodes.find((n) => n.path === e.from)}
					{@const b = nodes.find((n) => n.path === e.to)}
					{#if a && b}
						<line
							x1={a.x} y1={a.y} x2={b.x} y2={b.y}
							class="edge"
							class:hl={hoverPath === e.from || hoverPath === e.to}
						/>
					{/if}
				{/each}
				{#each visibleNodes as n (n.path)}
					<g
						class="node"
						class:hl={hoverPath === n.path}
						transform={`translate(${n.x}, ${n.y})`}
						onpointerdown={(e) => onNodePointerDown(e, n)}
						onclick={(e) => onNodeClick(e, n)}
						onmouseenter={() => (hoverPath = n.path)}
						onmouseleave={() => (hoverPath = null)}
						role="button"
						tabindex="0"
					>
						<circle r={nodeRadius(n, nodeScale)} />
						<text dy="-8">{n.title}</text>
					</g>
				{/each}
			</g>
		</svg>
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
		<span>Drag a node to pin · drag background to pan · scroll to zoom · click to open in new tab · alt+click for new pane</span>
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
	.node:hover text, .node.hl text { fill: var(--fg); }

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
