import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Fuse from 'fuse.js';
import { getVault } from '$lib/server/vault';
import { getIndex } from '$lib/server/indexer';

/**
 * Two search modes, one endpoint:
 *   GET /api/vaults/{id}/search?q=foo           → fuzzy title match (quick switcher)
 *   GET /api/vaults/{id}/search?q=foo&full=1    → indexed full-text search
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	const q = url.searchParams.get('q') ?? '';
	const full = url.searchParams.get('full') === '1';
	if (!q.trim()) return json({ results: [] });

	const idx = getIndex(vault);
	const entries = [...idx.notes.values()].map((m) => ({
		path: m.notePath,
		title: m.title,
		aliases: m.aliases,
		stem: m.stem
	}));

	if (!full) {
		const fuse = new Fuse(entries, {
			keys: ['title', 'aliases', 'stem', 'path'],
			threshold: 0.4,
			includeScore: true
		});
		const hits = fuse.search(q, { limit: 25 });
		return json({
			results: hits.map((h) => ({
				path: h.item.path,
				title: h.item.title,
				score: h.score ?? 0
			}))
		});
	}

	// Full-text — index-backed substring search with ±40 char context.
	const qLower = q.toLowerCase();
	const results: { path: string; title: string; snippet: string }[] = [];
	for (const meta of idx.notes.values()) {
		const doc = idx.searchDocs.get(meta.notePath);
		if (!doc) continue;
		const i = doc.textLower.indexOf(qLower);
		if (i === -1) continue;
		const start = Math.max(0, i - 40);
		const end = Math.min(doc.text.length, i + q.length + 40);
		const snippet = (start > 0 ? '…' : '') + doc.text.slice(start, end).trim() + (end < doc.text.length ? '…' : '');
		results.push({ path: meta.notePath, title: meta.title, snippet });
		if (results.length >= 50) break;
	}
	return json({ results });
};
