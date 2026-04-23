import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'node:fs';
import path from 'node:path';
import Fuse from 'fuse.js';
import { getVault } from '$lib/server/vault';
import { getIndex } from '$lib/server/indexer';
import { resolveInVault } from '$lib/server/paths';

/**
 * Two search modes, one endpoint:
 *   GET /api/vaults/{id}/search?q=foo           → fuzzy title match (quick switcher)
 *   GET /api/vaults/{id}/search?q=foo&full=1    → full-text body scan
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

	// Full-text — substring scan with ±40 char context.
	const qLower = q.toLowerCase();
	const results: { path: string; title: string; snippet: string }[] = [];
	for (const meta of idx.notes.values()) {
		try {
			const abs = resolveInVault(vault, meta.notePath);
			const content = fs.readFileSync(abs, 'utf-8');
			const i = content.toLowerCase().indexOf(qLower);
			if (i === -1) continue;
			const start = Math.max(0, i - 40);
			const end = Math.min(content.length, i + q.length + 40);
			const snippet = (start > 0 ? '…' : '') + content.slice(start, end).replace(/\s+/g, ' ').trim() + (end < content.length ? '…' : '');
			results.push({ path: meta.notePath, title: meta.title, snippet });
			if (results.length >= 50) break;
		} catch { /* skip */ }
	}
	return json({ results });
};
