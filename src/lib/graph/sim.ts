/**
 * Force-directed graph simulation — pure logic, no DOM.
 *
 * The integrator runs at ~60fps in the GraphView component; this module
 * just exposes the per-step force application, the tunable parameters,
 * and the node/edge types. Decoupled from the Svelte component so we
 * could later (1) port to a Worker for big graphs, (2) tune the quadtree
 * approximation without touching UI code, or (3) test in isolation.
 */

export interface GNode {
	path: string;
	title: string;
	degree: number;
	x: number;
	y: number;
	vx: number;
	vy: number;
	/** When non-null, the integrator pins x/y to (fx, fy) — used during a drag. */
	fx: number | null;
	fy: number | null;
}

export interface GEdge {
	from: string;
	to: string;
}

export interface SimParams {
	/** Pairwise repulsion coefficient. Higher = nodes push each other away harder. */
	repulse: number;
	/** Spring stiffness along edges. */
	linkForce: number;
	/** Rest length of the spring. */
	linkDist: number;
	/** Pull toward (0, 0). Keeps the cluster from drifting off-screen. */
	centerForce: number;
}

export const SIM_DEFAULTS: SimParams & { nodeScale: number } = {
	nodeScale: 1,
	repulse: 1500,
	linkForce: 0.05,
	linkDist: 90,
	centerForce: 0.01
};

/** Slider ranges used by the settings panel. Kept here so the sim and the
 *  UI agree on what's a legal value. */
export const SIM_RANGES = {
	nodeScale:   { min: 0.5,  max: 3,    step: 0.1 },
	repulse:     { min: 200,  max: 4000, step: 50 },
	linkForce:   { min: 0.01, max: 0.30, step: 0.01 },
	linkDist:    { min: 30,   max: 250,  step: 5 },
	centerForce: { min: 0,    max: 0.05, step: 0.001 }
};

const DAMPING = 0.8;
export const QUADTREE_REPULSION_THRESHOLD = 180;

const BARNES_HUT_THETA = 0.85;
const MAX_QUADTREE_DEPTH = 24;
const MIN_QUAD_SIZE = 0.01;

interface QuadCell {
	x0: number;
	y0: number;
	x1: number;
	y1: number;
	width: number;
	mass: number;
	cx: number;
	cy: number;
	nodes?: GNode[];
	children?: QuadCell[];
}

export function repulsionModeForNodeCount(count: number): 'pairwise' | 'quadtree' {
	return count >= QUADTREE_REPULSION_THRESHOLD ? 'quadtree' : 'pairwise';
}

function applyRepulsionFromPoint(
	target: GNode,
	sourceX: number,
	sourceY: number,
	mass: number,
	dt: number,
	repulse: number
): void {
	let dx = target.x - sourceX;
	let dy = target.y - sourceY;
	let d2 = dx * dx + dy * dy;
	if (d2 < 0.01) {
		dx = (Math.random() - 0.5) * 0.5;
		dy = (Math.random() - 0.5) * 0.5;
		d2 = dx * dx + dy * dy + 0.01;
	}
	const d = Math.sqrt(d2);
	const f = (repulse * mass) / d2;
	target.vx += (dx / d) * f * dt;
	target.vy += (dy / d) * f * dt;
}

function applyPairwiseRepulsion(nodes: GNode[], dt: number, repulse: number): void {
	for (let i = 0; i < nodes.length; i++) {
		const a = nodes[i];
		for (let j = i + 1; j < nodes.length; j++) {
			const b = nodes[j];
			let dx = a.x - b.x;
			let dy = a.y - b.y;
			let d2 = dx * dx + dy * dy;
			if (d2 < 0.01) {
				// Jitter to escape the singularity at exact coincidence.
				dx = (Math.random() - 0.5) * 0.5;
				dy = (Math.random() - 0.5) * 0.5;
				d2 = dx * dx + dy * dy + 0.01;
			}
			const d = Math.sqrt(d2);
			const f = repulse / d2;
			const fx = (dx / d) * f;
			const fy = (dy / d) * f;
			a.vx += fx * dt;
			a.vy += fy * dt;
			b.vx -= fx * dt;
			b.vy -= fy * dt;
		}
	}
}

function buildQuadTree(nodes: GNode[]): QuadCell | null {
	if (nodes.length === 0) return null;

	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const n of nodes) {
		minX = Math.min(minX, n.x);
		minY = Math.min(minY, n.y);
		maxX = Math.max(maxX, n.x);
		maxY = Math.max(maxY, n.y);
	}

	const size = Math.max(maxX - minX, maxY - minY, 1);
	const pad = size * 0.05 + 1;
	const cx = (minX + maxX) / 2;
	const cy = (minY + maxY) / 2;
	const half = size / 2 + pad;
	return buildQuadCell(nodes, cx - half, cy - half, cx + half, cy + half, 0);
}

function buildQuadCell(nodes: GNode[], x0: number, y0: number, x1: number, y1: number, depth: number): QuadCell {
	let sumX = 0;
	let sumY = 0;
	for (const n of nodes) {
		sumX += n.x;
		sumY += n.y;
	}

	const cell: QuadCell = {
		x0,
		y0,
		x1,
		y1,
		width: x1 - x0,
		mass: nodes.length,
		cx: sumX / nodes.length,
		cy: sumY / nodes.length
	};

	if (nodes.length <= 1 || depth >= MAX_QUADTREE_DEPTH || cell.width <= MIN_QUAD_SIZE) {
		cell.nodes = nodes;
		return cell;
	}

	const mx = (x0 + x1) / 2;
	const my = (y0 + y1) / 2;
	const buckets: GNode[][] = [[], [], [], []];
	for (const n of nodes) {
		const east = n.x >= mx ? 1 : 0;
		const south = n.y >= my ? 2 : 0;
		buckets[east + south].push(n);
	}

	cell.children = [];
	if (buckets[0].length) cell.children.push(buildQuadCell(buckets[0], x0, y0, mx, my, depth + 1));
	if (buckets[1].length) cell.children.push(buildQuadCell(buckets[1], mx, y0, x1, my, depth + 1));
	if (buckets[2].length) cell.children.push(buildQuadCell(buckets[2], x0, my, mx, y1, depth + 1));
	if (buckets[3].length) cell.children.push(buildQuadCell(buckets[3], mx, my, x1, y1, depth + 1));
	return cell;
}

function cellContains(cell: QuadCell, node: GNode): boolean {
	return node.x >= cell.x0 && node.x <= cell.x1 && node.y >= cell.y0 && node.y <= cell.y1;
}

function applyQuadCellRepulsion(target: GNode, cell: QuadCell, dt: number, repulse: number): void {
	if (cell.nodes) {
		for (const source of cell.nodes) {
			if (source === target) continue;
			applyRepulsionFromPoint(target, source.x, source.y, 1, dt, repulse);
		}
		return;
	}

	const dx = target.x - cell.cx;
	const dy = target.y - cell.cy;
	const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
	if (!cellContains(cell, target) && cell.width / d < BARNES_HUT_THETA) {
		applyRepulsionFromPoint(target, cell.cx, cell.cy, cell.mass, dt, repulse);
		return;
	}

	for (const child of cell.children ?? []) {
		applyQuadCellRepulsion(target, child, dt, repulse);
	}
}

function applyQuadTreeRepulsion(nodes: GNode[], dt: number, repulse: number): void {
	const root = buildQuadTree(nodes);
	if (!root) return;
	for (const node of nodes) {
		applyQuadCellRepulsion(node, root, dt, repulse);
	}
}

/**
 * Apply one integration step to the node array in place.
 * Returns nothing — the caller mutates the same array reference.
 */
export function simulateStep(
	nodes: GNode[],
	edges: GEdge[],
	dt: number,
	params: SimParams
): void {
	if (nodes.length === 0) return;

	const byPath = new Map<string, GNode>(nodes.map((n) => [n.path, n]));

	if (repulsionModeForNodeCount(nodes.length) === 'quadtree') {
		applyQuadTreeRepulsion(nodes, dt, params.repulse);
	} else {
		applyPairwiseRepulsion(nodes, dt, params.repulse);
	}

	// Edge springs.
	for (const e of edges) {
		const a = byPath.get(e.from);
		const b = byPath.get(e.to);
		if (!a || !b) continue;
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
		const f = (d - params.linkDist) * params.linkForce;
		const fx = (dx / d) * f;
		const fy = (dy / d) * f;
		a.vx += fx * dt;
		a.vy += fy * dt;
		b.vx -= fx * dt;
		b.vy -= fy * dt;
	}

	// Gentle gravity toward origin.
	for (const n of nodes) {
		n.vx -= n.x * params.centerForce * dt;
		n.vy -= n.y * params.centerForce * dt;
	}

	// Integrate + damp. Pinned nodes (during drag) freeze in place.
	for (const n of nodes) {
		if (n.fx != null && n.fy != null) {
			n.x = n.fx;
			n.y = n.fy;
			n.vx = 0;
			n.vy = 0;
			continue;
		}
		n.vx *= DAMPING;
		n.vy *= DAMPING;
		n.x += n.vx * dt;
		n.y += n.vy * dt;
	}
}

/** Visual radius for a node. Scales with degree (more linked = bigger)
 *  and with the user's node-size slider. */
export function nodeRadius(n: GNode, scale: number): number {
	return (4 + Math.min(12, Math.sqrt(n.degree) * 3)) * scale;
}
