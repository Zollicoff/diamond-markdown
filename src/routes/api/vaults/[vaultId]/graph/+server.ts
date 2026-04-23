import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getVault } from '$lib/server/vault';
import { getIndex } from '$lib/server/indexer';

export interface GraphNode {
	path: string;
	title: string;
	degree: number;
}

export interface GraphEdge {
	from: string;
	to: string;
}

export const GET: RequestHandler = async ({ params }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');

	const idx = getIndex(vault);
	const nodes: GraphNode[] = [];
	const edges: GraphEdge[] = [];

	const degree = new Map<string, number>();
	const bump = (p: string): void => { degree.set(p, (degree.get(p) ?? 0) + 1); };

	for (const [from, outs] of idx.linksOut) {
		for (const to of outs) {
			edges.push({ from, to });
			bump(from);
			bump(to);
		}
	}

	for (const meta of idx.notes.values()) {
		nodes.push({
			path: meta.notePath,
			title: meta.title,
			degree: degree.get(meta.notePath) ?? 0
		});
	}

	return json({ nodes, edges });
};
