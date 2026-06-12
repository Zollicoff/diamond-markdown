import type { SearchHit } from '$lib/types';

export const SEARCH_RESULT_ROW_HEIGHT = 92;
export const SEARCH_GROUP_ROW_HEIGHT = 34;
export const SEARCH_RESULT_OVERSCAN = 8;
export const SEARCH_DEFAULT_VIEWPORT_HEIGHT = 560;

export type SearchGroupMode = 'none' | 'folder';

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

export interface SearchResultDataRow {
	kind: 'result';
	key: string;
	hit: SearchHit;
	resultIndex: number;
	offset: number;
	height: number;
}

export interface SearchResultGroupRow {
	kind: 'group';
	key: string;
	id: string;
	label: string;
	count: number;
	offset: number;
	height: number;
}

export type SearchResultDisplayRow = SearchResultDataRow | SearchResultGroupRow;

export interface SearchResultRows {
	rows: SearchResultDisplayRow[];
	totalHeight: number;
	groupCount: number;
	resultCount: number;
}

export interface VisibleSearchDisplayRow {
	row: SearchResultDisplayRow;
	index: number;
}

export interface SearchDisplayWindow {
	totalHeight: number;
	startIndex: number;
	visibleCount: number;
	endIndex: number;
	visibleRows: VisibleSearchDisplayRow[];
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

export function searchResultRowStyle(row: VisibleSearchResult | SearchResultDisplayRow, rowHeight = SEARCH_RESULT_ROW_HEIGHT): string {
	if ('offset' in row && 'height' in row) {
		return `--search-result-row-height: ${row.height}px; transform: translateY(${row.offset}px);`;
	}
	return `--search-result-row-height: ${rowHeight}px; transform: translateY(${row.index * rowHeight}px);`;
}

export function searchResultFolder(path: string): string {
	const clean = path.replace(/^\/+|\/+$/g, '');
	const parts = clean.split('/').filter(Boolean);
	return parts.length > 1 ? parts.slice(0, -1).join('/') : 'Vault root';
}

function searchResultGroupId(label: string): string {
	return label === 'Vault root' ? '__root__' : label.toLocaleLowerCase();
}

export function buildSearchResultRows(
	results: SearchHit[],
	groupMode: SearchGroupMode,
	resultHeight = SEARCH_RESULT_ROW_HEIGHT,
	groupHeight = SEARCH_GROUP_ROW_HEIGHT
): SearchResultRows {
	if (groupMode === 'none') {
		let offset = 0;
		const rows = results.map((hit, resultIndex) => {
			const row: SearchResultDataRow = {
				kind: 'result',
				key: `result:${resultIndex}:${hit.path}`,
				hit,
				resultIndex,
				offset,
				height: resultHeight
			};
			offset += resultHeight;
			return row;
		});
		return { rows, totalHeight: offset, groupCount: 0, resultCount: results.length };
	}

	const groups: { id: string; label: string; hits: { hit: SearchHit; resultIndex: number }[] }[] = [];
	const byId = new Map<string, { id: string; label: string; hits: { hit: SearchHit; resultIndex: number }[] }>();
	for (const [resultIndex, hit] of results.entries()) {
		const label = searchResultFolder(hit.path);
		const id = searchResultGroupId(label);
		let group = byId.get(id);
		if (!group) {
			group = { id, label, hits: [] };
			byId.set(id, group);
			groups.push(group);
		}
		group.hits.push({ hit, resultIndex });
	}

	let offset = 0;
	const rows: SearchResultDisplayRow[] = [];
	for (const group of groups) {
		rows.push({
			kind: 'group',
			key: `group:${group.id}`,
			id: group.id,
			label: group.label,
			count: group.hits.length,
			offset,
			height: groupHeight
		});
		offset += groupHeight;
		for (const { hit, resultIndex } of group.hits) {
			rows.push({
				kind: 'result',
				key: `result:${resultIndex}:${hit.path}`,
				hit,
				resultIndex,
				offset,
				height: resultHeight
			});
			offset += resultHeight;
		}
	}

	return { rows, totalHeight: offset, groupCount: groups.length, resultCount: results.length };
}

export function visibleSearchRows(
	resultRows: SearchResultRows,
	scrollTop: number,
	viewportHeight: number,
	overscan = SEARCH_RESULT_OVERSCAN,
	defaultViewportHeight = SEARCH_DEFAULT_VIEWPORT_HEIGHT
): SearchDisplayWindow {
	const rows = resultRows.rows;
	if (rows.length === 0) {
		return {
			totalHeight: 0,
			startIndex: 0,
			visibleCount: 0,
			endIndex: 0,
			visibleRows: []
		};
	}

	const measuredHeight = viewportHeight || defaultViewportHeight;
	const bottom = scrollTop + measuredHeight;
	const firstVisible = rows.findIndex((row) => row.offset + row.height > scrollTop);
	const startIndex = Math.max(0, (firstVisible < 0 ? rows.length : firstVisible) - overscan);
	let endIndex = startIndex;
	while (endIndex < rows.length && rows[endIndex].offset < bottom) endIndex += 1;
	endIndex = Math.min(rows.length, endIndex + overscan);
	const visibleRows = rows.slice(startIndex, endIndex).map((row, offset) => ({
		row,
		index: startIndex + offset
	}));
	return {
		totalHeight: resultRows.totalHeight,
		startIndex,
		visibleCount: visibleRows.length,
		endIndex,
		visibleRows
	};
}
