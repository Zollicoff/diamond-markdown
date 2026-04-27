<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { api } from '$lib/vault-api';
	import { on as onBus } from '$lib/events';
	import { openNote } from '$lib/workspace/actions';

	interface Props {
		vaultId: string;
	}

	let { vaultId }: Props = $props();

	interface GNode {
		path: string;
		title: string;
		degree: number;
		x: number;
		y: number;
		vx: number;
		vy: number;
		fx: number | null;
		fy: number | null;
	}

	interface GEdge {
		from: string;
		to: string;
	}

	let nodes = $state<GNode[]>([]);
	let edges = $state<GEdge[]>([]);
	let loading = $state(false);
	let err = $state<string | null>(null);

	let svgEl: SVGSVGElement | null = $state(null);
	let rafId = 0;
	let lastTick = 0;

	// View transform — pan + zoom.
	let viewX = $state(0);
	let viewY = $state(0);
	let viewScale = $state(1);
	let isPanning = false;
	let panStartX = 0;
	let panStartY = 0;
	let panOrigX = 0;
	let panOrigY = 0;

	// Drag state.
	let draggingNode: GNode | null = null;
	let dragStartX = 0;
	let dragStartY = 0;
	let dragMoved = false;
	const DRAG_THRESHOLD = 4; // px before a press counts as a drag, not a click
	let hoverPath = $state<string | null>(null);

	// Tunable simulation parameters — persisted per-vault to localStorage.
	// Sim reads these live each tick; changing a slider re-shapes the graph
	// even after it's settled, because forces are applied unconditionally.
	const DEFAULTS = {
		nodeScale: 1,
		repulse: 1500,
		linkForce: 0.05,
		linkDist: 90,
		centerForce: 0.01
	};
	let nodeScale = $state(DEFAULTS.nodeScale);
	let repulse = $state(DEFAULTS.repulse);
	let linkForce = $state(DEFAULTS.linkForce);
	let linkDist = $state(DEFAULTS.linkDist);
	let centerForce = $state(DEFAULTS.centerForce);

	// Filter state — purely visual; sim still runs over all nodes so layout
	// stays stable when toggling. Persisted alongside the force settings.
	let hideOrphans = $state(false);
	let searchQuery = $state('');
	let panelOpen = $state(false);
	let panelTab = $state<'forces' | 'filters'>('forces');
	let settingsHydrated = false;

	const settingsKey = (): string => `diamondmd:graph-settings:${vaultId}`;

	function hydrateSettings(): void {
		if (typeof localStorage === 'undefined') return;
		try {
			const raw = localStorage.getItem(settingsKey());
			if (!raw) return;
			const v = JSON.parse(raw) as Partial<typeof DEFAULTS> & { hideOrphans?: boolean; searchQuery?: string };
			if (typeof v.nodeScale === 'number') nodeScale = v.nodeScale;
			if (typeof v.repulse === 'number') repulse = v.repulse;
			if (typeof v.linkForce === 'number') linkForce = v.linkForce;
			if (typeof v.linkDist === 'number') linkDist = v.linkDist;
			if (typeof v.centerForce === 'number') centerForce = v.centerForce;
			if (typeof v.hideOrphans === 'boolean') hideOrphans = v.hideOrphans;
			if (typeof v.searchQuery === 'string') searchQuery = v.searchQuery;
		} catch {
			// Corrupt JSON — ignore and stick with defaults.
		}
	}

	function resetSettings(): void {
		nodeScale = DEFAULTS.nodeScale;
		repulse = DEFAULTS.repulse;
		linkForce = DEFAULTS.linkForce;
		linkDist = DEFAULTS.linkDist;
		centerForce = DEFAULTS.centerForce;
	}

	function resetFilters(): void {
		hideOrphans = false;
		searchQuery = '';
	}

	$effect(() => {
		// Persist whenever any setting changes — but skip the initial run
		// before hydrate has had a chance to load existing values.
		const snapshot = { nodeScale, repulse, linkForce, linkDist, centerForce, hideOrphans, searchQuery };
		if (!settingsHydrated || typeof localStorage === 'undefined') return;
		try { localStorage.setItem(settingsKey(), JSON.stringify(snapshot)); } catch { /* quota / private mode */ }
	});

	// Visible set — sim still runs over `nodes`/`edges`, but rendering
	// only walks the filtered set, so toggling a filter doesn't disrupt
	// the live layout.
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
		} catch (e) {
			err = (e as Error).message;
		} finally {
			loading = false;
		}
	}

	function startSim(): void {
		cancelAnimationFrame(rafId);
		lastTick = performance.now();
		const tick = (now: number): void => {
			const dt = Math.min(32, now - lastTick) / 16; // normalize to ~60fps
			lastTick = now;
			simulateStep(dt);
			rafId = requestAnimationFrame(tick);
		};
		rafId = requestAnimationFrame(tick);
	}

	function simulateStep(dt: number): void {
		if (nodes.length === 0) return;

		const byPath = new Map<string, GNode>(nodes.map((n) => [n.path, n]));

		// Repulsive force between every pair. O(n²) — fine for <500 nodes.
		const repulseK = repulse;
		for (let i = 0; i < nodes.length; i++) {
			const a = nodes[i];
			for (let j = i + 1; j < nodes.length; j++) {
				const b = nodes[j];
				let dx = a.x - b.x;
				let dy = a.y - b.y;
				let d2 = dx * dx + dy * dy;
				if (d2 < 0.01) {
					// Jitter to avoid singularity.
					dx = (Math.random() - 0.5) * 0.5;
					dy = (Math.random() - 0.5) * 0.5;
					d2 = dx * dx + dy * dy + 0.01;
				}
				const d = Math.sqrt(d2);
				const f = repulseK / d2;
				const fx = (dx / d) * f;
				const fy = (dy / d) * f;
				a.vx += fx * dt;
				a.vy += fy * dt;
				b.vx -= fx * dt;
				b.vy -= fy * dt;
			}
		}

		// Spring force along edges.
		const restLen = linkDist;
		const springK = linkForce;
		for (const e of edges) {
			const a = byPath.get(e.from)!;
			const b = byPath.get(e.to)!;
			const dx = b.x - a.x;
			const dy = b.y - a.y;
			const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
			const f = (d - restLen) * springK;
			const fx = (dx / d) * f;
			const fy = (dy / d) * f;
			a.vx += fx * dt;
			a.vy += fy * dt;
			b.vx -= fx * dt;
			b.vy -= fy * dt;
		}

		// Gentle gravity toward origin.
		const gravityK = centerForce;
		for (const n of nodes) {
			n.vx -= n.x * gravityK * dt;
			n.vy -= n.y * gravityK * dt;
		}

		// Integrate + damping.
		const damping = 0.8;
		for (const n of nodes) {
			if (n.fx != null && n.fy != null) {
				n.x = n.fx;
				n.y = n.fy;
				n.vx = 0;
				n.vy = 0;
				continue;
			}
			n.vx *= damping;
			n.vy *= damping;
			n.x += n.vx * dt;
			n.y += n.vy * dt;
		}
		// Nudge reactivity — replace the array ref.
		nodes = nodes;
	}

	function nodeRadius(n: GNode): number {
		return (4 + Math.min(12, Math.sqrt(n.degree) * 3)) * nodeScale;
	}

	function onWheel(e: WheelEvent): void {
		e.preventDefault();
		const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
		// Zoom around cursor.
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
		// Don't start pan if user clicked a node (those stop propagation).
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
			const wx = (e.clientX - rect.left - viewX) / viewScale;
			const wy = (e.clientY - rect.top - viewY) / viewScale;
			draggingNode.fx = wx;
			draggingNode.fy = wy;
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
		// Suppress the click the browser fires after a drag-release on the
		// same node — otherwise dragging triggers a navigation.
		if (dragMoved) {
			dragMoved = false;
			return;
		}
		if (e.shiftKey) return; // shift-click reserved for future multiselect
		const title = n.title || n.path.split('/').pop()!.replace(/\.md$/, '');
		// Graph is an app-style tab — keep it open. alt → new pane,
		// everything else → new tab beside the graph.
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
			onBus('note:saved', (e) => { if (e.vaultId === vaultId) void loadGraph(); })
		];
		// Center once the SVG mounts + knows its size.
		setTimeout(center, 50);
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
						<circle r={nodeRadius(n)} />
						<text dy="-8">{n.title}</text>
					</g>
				{/each}
			</g>
		</svg>
	{/if}

	{#if panelOpen}
		<aside class="forces-panel" role="dialog" aria-label="Graph settings">
			<div class="fp-head">
				<div class="fp-tabs" role="tablist">
					<button
						class="fp-tab"
						class:active={panelTab === 'forces'}
						role="tab"
						aria-selected={panelTab === 'forces'}
						onclick={() => (panelTab = 'forces')}
					>Forces</button>
					<button
						class="fp-tab"
						class:active={panelTab === 'filters'}
						role="tab"
						aria-selected={panelTab === 'filters'}
						onclick={() => (panelTab = 'filters')}
					>
						Filters
						{#if filtersActive}<span class="fp-dot" aria-label="Filters active"></span>{/if}
					</button>
				</div>
				<button class="fp-close" onclick={() => (panelOpen = false)} aria-label="Close">×</button>
			</div>

			{#if panelTab === 'forces'}
				<label class="fp-row">
					<span class="fp-label">Node size</span>
					<input type="range" min="0.5" max="3" step="0.1" bind:value={nodeScale} />
					<span class="fp-val mono">{nodeScale.toFixed(1)}×</span>
				</label>

				<label class="fp-row">
					<span class="fp-label">Repel force</span>
					<input type="range" min="200" max="4000" step="50" bind:value={repulse} />
					<span class="fp-val mono">{Math.round(repulse)}</span>
				</label>

				<label class="fp-row">
					<span class="fp-label">Link force</span>
					<input type="range" min="0.01" max="0.30" step="0.01" bind:value={linkForce} />
					<span class="fp-val mono">{linkForce.toFixed(2)}</span>
				</label>

				<label class="fp-row">
					<span class="fp-label">Link distance</span>
					<input type="range" min="30" max="250" step="5" bind:value={linkDist} />
					<span class="fp-val mono">{Math.round(linkDist)}</span>
				</label>

				<label class="fp-row">
					<span class="fp-label">Center force</span>
					<input type="range" min="0" max="0.05" step="0.001" bind:value={centerForce} />
					<span class="fp-val mono">{centerForce.toFixed(3)}</span>
				</label>

				<button class="fp-reset" onclick={resetSettings}>Restore defaults</button>
			{:else}
				<label class="fp-search">
					<span class="fp-label">Search</span>
					<input type="search" placeholder="Filter by name or path…" bind:value={searchQuery} />
				</label>

				<label class="fp-toggle">
					<input type="checkbox" bind:checked={hideOrphans} />
					<span>Hide orphans <span class="fp-hint">(no links in or out)</span></span>
				</label>

				<button class="fp-reset" onclick={resetFilters}>Clear filters</button>
			{/if}
		</aside>
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

	.forces-panel {
		position: absolute;
		top: 50px;
		right: 12px;
		z-index: 10;
		width: 250px;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		border-radius: 8px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
		padding: 10px 12px 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.fp-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		padding-bottom: 4px;
		border-bottom: 1px solid var(--border);
	}
	.fp-tabs {
		display: flex;
		gap: 4px;
	}
	.fp-tab {
		background: transparent;
		border: 0;
		border-bottom: 2px solid transparent;
		color: var(--fg-muted);
		cursor: pointer;
		font: inherit;
		font-size: 0.78rem;
		padding: 4px 8px 5px;
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.fp-tab:hover { color: var(--fg); }
	.fp-tab.active {
		color: var(--fg);
		border-bottom-color: var(--accent);
		font-weight: 600;
	}
	.fp-dot {
		display: inline-block;
		width: 6px; height: 6px; border-radius: 50%;
		background: var(--accent);
	}
	.fp-close {
		background: transparent;
		border: 0;
		color: var(--fg-muted);
		cursor: pointer;
		font-size: 1.1rem;
		line-height: 1;
		padding: 0 4px;
	}
	.fp-close:hover { color: var(--fg); }
	.fp-row {
		display: grid;
		grid-template-columns: auto 1fr 44px;
		align-items: center;
		gap: 8px;
		font-size: 0.74rem;
		color: var(--fg-dim);
	}
	.fp-label {
		white-space: nowrap;
		min-width: 84px;
	}
	.fp-row input[type='range'] {
		width: 100%;
		accent-color: var(--accent);
	}
	.fp-val {
		text-align: right;
		font-size: 0.7rem;
		color: var(--fg-muted);
	}
	.fp-reset {
		margin-top: 4px;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 4px 8px;
		color: var(--fg-muted);
		font: inherit;
		font-size: 0.74rem;
		cursor: pointer;
	}
	.fp-reset:hover { color: var(--accent); border-color: var(--accent); }

	.fp-search {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 0.74rem;
		color: var(--fg-dim);
	}
	.fp-search input[type='search'] {
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 4px;
		color: var(--fg);
		font: inherit;
		font-size: 0.78rem;
		padding: 5px 8px;
	}
	.fp-search input[type='search']:focus {
		outline: none;
		border-color: var(--accent);
	}
	.fp-toggle {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.78rem;
		color: var(--fg);
		cursor: pointer;
	}
	.fp-toggle input { accent-color: var(--accent); cursor: pointer; }
	.fp-hint { color: var(--fg-dim); font-size: 0.72rem; }

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
	.edge.hl { stroke: #7dd3fc; opacity: 1; stroke-width: 1.4; }

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
		fill: #7dd3fc;
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
