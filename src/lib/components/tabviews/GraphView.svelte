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
		const repulseK = 1500;
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
		const restLen = 90;
		const springK = 0.05;
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
		const gravityK = 0.01;
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
		return 4 + Math.min(12, Math.sqrt(n.degree) * 3);
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
		<span class="count mono">{nodes.length} nodes · {edges.length} edges</span>
		<span class="spacer"></span>
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
				{#each edges as e, i (i)}
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
				{#each nodes as n (n.path)}
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

	<footer class="legend">
		<span>Drag a node to pin · drag background to pan · scroll to zoom · click to open in new tab · alt+click for new pane</span>
	</footer>
</div>

<style>
	.graph-view {
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
