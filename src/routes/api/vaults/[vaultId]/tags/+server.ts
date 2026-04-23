import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getVault } from '$lib/server/vault';
import { getIndex } from '$lib/server/indexer';

export const GET: RequestHandler = async ({ params, url }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	const idx = getIndex(vault);
	const specific = url.searchParams.get('tag');
	if (specific) {
		const notes = idx.tagIndex.get(specific);
		if (!notes) return json({ tag: specific, notes: [] });
		return json({
			tag: specific,
			notes: [...notes].map((p) => ({ path: p, title: idx.notes.get(p)?.title ?? p }))
		});
	}
	const tags = [...idx.tagIndex.entries()]
		.map(([tag, set]) => ({ tag, count: set.size }))
		.sort((a, b) => b.count - a.count);
	return json({ tags });
};
