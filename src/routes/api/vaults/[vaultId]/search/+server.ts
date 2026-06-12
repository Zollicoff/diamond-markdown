import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Fuse from 'fuse.js';
import { getVault } from '$lib/server/vault';
import { getIndex } from '$lib/server/indexer';
import {
	buildSearchResponse,
	clampSearchLimit,
	DEFAULT_FULL_TEXT_SEARCH_LIMIT,
	DEFAULT_TITLE_SEARCH_LIMIT,
	emptySearchResponse,
	searchFullTextIndex
} from '$lib/server/search';

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
	const limit = clampSearchLimit(
		url.searchParams.get('limit'),
		full ? DEFAULT_FULL_TEXT_SEARCH_LIMIT : DEFAULT_TITLE_SEARCH_LIMIT
	);
	if (!q.trim()) return json(emptySearchResponse(q, full ? 'full' : 'title', limit));

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
		const hits = fuse.search(q);
		return json(buildSearchResponse(
			q,
			'title',
			limit,
			hits.slice(0, limit).map((h) => ({
				path: h.item.path,
				title: h.item.title,
				score: h.score ?? 0
			})),
			hits.length
		));
	}

	return json(searchFullTextIndex(idx, q, limit));
};
