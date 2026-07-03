/**
 * Force-directed graph simulation — pure logic, no DOM.
 *
 * The integrator runs at ~60fps in the GraphView component; this module
 * just exposes the per-step force application, the tunable parameters,
 * and the node/edge types. Decoupled from the Svelte component so we
 * could later (1) port to a Worker for big graphs, (2) swap the O(n²)
 * repulsion for a quadtree without touching UI code, or (3) test in
 * isolation.
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

	// Pairwise repulsion. O(n²) — fine for <500 nodes.
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
			const f = params.repulse / d2;
			const fx = (dx / d) * f;
			const fy = (dy / d) * f;
			a.vx += fx * dt;
			a.vy += fy * dt;
			b.vx -= fx * dt;
			b.vy -= fy * dt;
		}
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
