import type { SearchHit } from '$lib/types';

export const SEARCH_RESULT_ROW_HEIGHT = 92;
export const SEARCH_RESULT_OVERSCAN = 8;
export const SEARCH_DEFAULT_VIEWPORT_HEIGHT = 560;

export interface VisibleSearchResult {
	hit: SearchHit;
	index: number;
}

export interface SearchResultWindow {
	totalHeight: number;
	startIndex: number;
	visibleCount: number;
	endIndex: number;
	visibleResults: VisibleSearchResult[];
}

export function visibleSearchWindow(
	results: SearchHit[],
	scrollTop: number,
	viewportHeight: number,
	rowHeight = SEARCH_RESULT_ROW_HEIGHT,
	overscan = SEARCH_RESULT_OVERSCAN,
	defaultViewportHeight = SEARCH_DEFAULT_VIEWPORT_HEIGHT
): SearchResultWindow {
	const totalHeight = results.length * rowHeight;
	const measuredHeight = viewportHeight || defaultViewportHeight;
	const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
	const visibleCount = Math.ceil(measuredHeight / rowHeight) + overscan * 2;
	const endIndex = Math.min(results.length, startIndex + visibleCount);
	const visibleResults = results.slice(startIndex, endIndex).map((hit, offset) => ({
		hit,
		index: startIndex + offset
	}));
	return { totalHeight, startIndex, visibleCount, endIndex, visibleResults };
}

export function searchResultRowStyle(row: VisibleSearchResult, rowHeight = SEARCH_RESULT_ROW_HEIGHT): string {
	return `--search-result-row-height: ${rowHeight}px; transform: translateY(${row.index * rowHeight}px);`;
}
