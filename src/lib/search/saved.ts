import type { SavedSearch, SavedSearchMode } from '$lib/types';

export function normalizeSearchQuery(query: string): string {
	return query.replace(/\s+/g, ' ').trim();
}

export function savedSearchName(query: string): string {
	const normalized = normalizeSearchQuery(query);
	return normalized.length > 60 ? normalized.slice(0, 60).trim() : normalized || 'Saved search';
}

export function savedSearchModeLabel(mode: SavedSearchMode): 'Notes' | 'Title' {
	return mode === 'full' ? 'Notes' : 'Title';
}

export function searchModeFromFullText(fullText: boolean): SavedSearchMode {
	return fullText ? 'full' : 'title';
}

export function isActiveSavedSearch(search: SavedSearch, query: string, mode: SavedSearchMode): boolean {
	return search.query === normalizeSearchQuery(query) && search.mode === mode;
}

export function savedSearchButtonLabel(search: SavedSearch): string {
	return `${savedSearchModeLabel(search.mode)} ${search.name}`;
}
