import type { SearchHit, SearchResponse } from '$lib/types';
import { normalizeSearchQuery, savedSearchName } from './saved';

export const SEARCH_DEBOUNCE_MS = 120;
export const SEARCH_TITLE_LIMIT = 100;
export const SEARCH_FULL_TEXT_LIMIT = 200;

export interface SearchRequestOptions {
	full: boolean;
	limit: number;
	offset: number;
}

export interface SavedSearchDraft {
	savedName: string;
	savedNameTouched: boolean;
}

export function searchRequestLimit(fullText: boolean): number {
	return fullText ? SEARCH_FULL_TEXT_LIMIT : SEARCH_TITLE_LIMIT;
}

export function searchRequestOffset(
	append: boolean,
	meta: SearchResponse | null,
	resultsLength: number
): number {
	return append ? meta?.nextOffset ?? resultsLength : 0;
}

export function searchRequestOptions(
	fullText: boolean,
	append: boolean,
	meta: SearchResponse | null,
	resultsLength: number
): SearchRequestOptions {
	return {
		full: fullText,
		limit: searchRequestLimit(fullText),
		offset: searchRequestOffset(append, meta, resultsLength)
	};
}

export function canLoadMoreSearch(
	loading: boolean,
	loadingMore: boolean,
	meta: SearchResponse | null
): boolean {
	return !loading && !loadingMore && Boolean(meta?.nextOffset);
}

export function mergeSearchResults(
	current: SearchHit[],
	response: SearchResponse,
	append: boolean
): SearchHit[] {
	return append ? [...current, ...response.results] : response.results;
}

export function canSaveCurrentSearch(
	query: string,
	savingSearch: boolean,
	searchAlreadySaved: boolean
): boolean {
	return normalizeSearchQuery(query).length > 0 && !savingSearch && !searchAlreadySaved;
}

export function saveSearchTitle(
	query: string,
	searchAlreadySaved: boolean
): string {
	if (!normalizeSearchQuery(query)) return 'Type a search to save it';
	return searchAlreadySaved ? 'This search is already saved' : 'Save current search';
}

export function savedSearchDraftAfterQueryInput(
	query: string,
	savedName: string,
	savedNameTouched: boolean
): SavedSearchDraft {
	if (!savedNameTouched || !savedName.trim() || savedName === 'Saved search') {
		return { savedName: savedSearchName(query), savedNameTouched };
	}
	return { savedName, savedNameTouched };
}

export function savedSearchDraftAfterExternalQuery(query: string): SavedSearchDraft {
	return { savedName: savedSearchName(query), savedNameTouched: false };
}

export function isSearchAbortError(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'name' in error &&
		(error as { name?: unknown }).name === 'AbortError'
	);
}
