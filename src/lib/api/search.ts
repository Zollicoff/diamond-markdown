import type {
	SavedSearch,
	SavedSearchMode,
	SavedSearchMutationResult,
	SearchHit,
	SearchResponse
} from '$lib/types';
import { emit } from '$lib/events';
import { json } from '$lib/api/request';

export interface SearchRequestOptions {
	full?: boolean;
	limit?: number;
	offset?: number;
	signal?: AbortSignal;
}

export interface SavedSearchSaveInput {
	id?: string;
	name: string;
	query: string;
	mode: SavedSearchMode;
}

export type SearchResponsePayload = Partial<SearchResponse>;

export function searchQueryParams(query: string, opts: SearchRequestOptions = {}): URLSearchParams {
	const params = new URLSearchParams({ q: query });
	if (opts.full) params.set('full', '1');
	if (opts.limit) params.set('limit', String(opts.limit));
	if (opts.offset) params.set('offset', String(opts.offset));
	return params;
}

export function normalizeSearchResponse(
	query: string,
	opts: SearchRequestOptions,
	res: SearchResponsePayload
): SearchResponse {
	const results = res.results ?? [];
	const offset = res.offset ?? opts.offset ?? 0;
	const total = res.total ?? results.length;
	const nextOffset = res.nextOffset ?? (offset + results.length < total ? offset + results.length : null);
	return {
		query: res.query ?? query.trim(),
		mode: res.mode ?? (opts.full ? 'full' : 'title'),
		limit: res.limit ?? opts.limit ?? (opts.full ? 50 : 25),
		offset,
		total,
		limited: res.limited ?? nextOffset !== null,
		hasMore: res.hasMore ?? nextOffset !== null,
		nextOffset,
		results
	};
}

export function savedSearchSavePayload(input: SavedSearchSaveInput): SavedSearchSaveInput {
	return { ...input };
}

async function searchWithMetaRequest(
	vaultId: string,
	query: string,
	opts: SearchRequestOptions = {}
): Promise<SearchResponse> {
	const params = searchQueryParams(query, opts);
	const res = await json<SearchResponsePayload>(`/api/vaults/${vaultId}/search?${params.toString()}`, {
		signal: opts.signal
	});
	return normalizeSearchResponse(query, opts, res);
}

export const searchApi = {
	async search(vaultId: string, query: string, opts: SearchRequestOptions = {}): Promise<SearchHit[]> {
		return (await searchWithMetaRequest(vaultId, query, opts)).results;
	},

	async searchWithMeta(vaultId: string, query: string, opts: SearchRequestOptions = {}): Promise<SearchResponse> {
		return searchWithMetaRequest(vaultId, query, opts);
	},

	async savedSearches(vaultId: string): Promise<SavedSearch[]> {
		const res = await json<{ searches: SavedSearch[] }>(`/api/vaults/${vaultId}/searches`);
		return res.searches ?? [];
	},

	async saveSavedSearch(vaultId: string, input: SavedSearchSaveInput): Promise<SavedSearchMutationResult> {
		const res = await json<SavedSearchMutationResult>(`/api/vaults/${vaultId}/searches`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(savedSearchSavePayload(input))
		});
		emit('searches:changed', { vaultId });
		return res;
	},

	async deleteSavedSearch(vaultId: string, id: string): Promise<SavedSearchMutationResult> {
		const res = await json<SavedSearchMutationResult>(
			`/api/vaults/${vaultId}/searches?id=${encodeURIComponent(id)}`,
			{ method: 'DELETE' }
		);
		emit('searches:changed', { vaultId });
		return res;
	}
};
