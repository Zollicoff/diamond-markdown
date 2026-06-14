import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
	deleteSavedSearch,
	listSavedSearches,
	SAVED_SEARCHES_REL_PATH,
	saveSavedSearch
} from '../src/lib/server/saved-searches';
import type { NoteMeta, VaultIndex } from '../src/lib/server/indexer';
import { clampSearchLimit, clampSearchOffset, searchFullTextIndex } from '../src/lib/server/search';
import { searchHighlightParts, searchHighlightTerms } from '../src/lib/search/highlight';
import { isActiveSavedSearch, savedSearchButtonLabel, savedSearchModeLabel, savedSearchName, searchModeFromFullText } from '../src/lib/search/saved';
import {
	canLoadMoreSearch,
	canSaveCurrentSearch,
	isSearchAbortError,
	mergeSearchResults,
	savedSearchDraftAfterExternalQuery,
	savedSearchDraftAfterQueryInput,
	saveSearchTitle,
	searchRequestLimit,
	searchRequestOffset,
	searchRequestOptions
} from '../src/lib/search/session';
import {
	buildSearchResultRows,
	searchFolderFacets,
	searchQueryHasPathFilter,
	searchQueryWithFolder,
	searchResultFolder,
	searchResultRowStyle,
	visibleSearchRows,
	visibleSearchWindow
} from '../src/lib/search/view';

function emptyIndex(): VaultIndex {
	return {
		notes: new Map(),
		titleIndex: new Map(),
		linksOutRaw: new Map(),
		linksOut: new Map(),
		backlinks: new Map(),
		tagIndex: new Map(),
		searchDocs: new Map()
	};
}

function addNote(idx: VaultIndex, notePath: string, title: string, text: string, aliases: string[] = [], tags: string[] = []): void {
	const stem = notePath.replace(/\.md$/i, '').split('/').pop()?.toLowerCase() ?? notePath.toLowerCase();
	const meta: NoteMeta = {
		notePath,
		title,
		aliases,
		tags,
		stem
	};
	const normalized = text.replace(/\s+/g, ' ').trim();
	idx.notes.set(notePath, meta);
	idx.searchDocs.set(notePath, {
		notePath,
		text: normalized,
		textLower: normalized.toLowerCase()
	});
	for (const tag of tags) {
		let notes = idx.tagIndex.get(tag);
		if (!notes) idx.tagIndex.set(tag, (notes = new Set()));
		notes.add(notePath);
	}
}

test('indexed full-text search ranks title and phrase matches before loose body matches', () => {
	const idx = emptyIndex();
	addNote(idx, 'Notes/Daily.md', 'Daily', 'github sync github sync keeps remote work up to date');
	addNote(idx, 'Reference/GitHub Sync.md', 'GitHub Sync', 'Release checklist and setup notes.');
	addNote(idx, 'Archive/Sync Troubleshooting.md', 'Sync Troubleshooting', 'GitHub notes mention sync separately here.');

	const response = searchFullTextIndex(idx, 'github sync', 10);
	const spacedResponse = searchFullTextIndex(idx, 'github   sync', 10);

	expect(response.mode).toBe('full');
	expect(response.total).toBe(3);
	expect(response.limited).toBe(false);
	expect(spacedResponse.results[0].path).toBe('Reference/GitHub Sync.md');
	expect(response.results.map((hit) => hit.path)).toEqual([
		'Reference/GitHub Sync.md',
		'Notes/Daily.md',
		'Archive/Sync Troubleshooting.md'
	]);
	expect(response.results[1].snippet).toContain('github sync');
	expect(searchFullTextIndex(idx, '???', 10).total).toBe(0);
});

test('indexed full-text search reports capped result sets separately from returned rows', () => {
	const idx = emptyIndex();
	for (let i = 0; i < 40; i += 1) {
		addNote(idx, `Notes/Needle ${String(i).padStart(2, '0')}.md`, `Needle ${i}`, `needle result ${i}`);
	}

	const response = searchFullTextIndex(idx, 'needle', 7);
	const secondPage = searchFullTextIndex(idx, 'needle', 7, 7);
	const lastPage = searchFullTextIndex(idx, 'needle', 7, 35);

	expect(response.total).toBe(40);
	expect(response.limit).toBe(7);
	expect(response.offset).toBe(0);
	expect(response.limited).toBe(true);
	expect(response.hasMore).toBe(true);
	expect(response.nextOffset).toBe(7);
	expect(response.results).toHaveLength(7);
	expect(secondPage.offset).toBe(7);
	expect(secondPage.nextOffset).toBe(14);
	expect(secondPage.results[0].path).toBe('Notes/Needle 07.md');
	expect(lastPage.offset).toBe(35);
	expect(lastPage.hasMore).toBe(false);
	expect(lastPage.nextOffset).toBeNull();
	expect(lastPage.results).toHaveLength(5);
	expect(clampSearchLimit('500', 50)).toBe(200);
	expect(clampSearchLimit('bad', 50)).toBe(50);
	expect(clampSearchOffset('12')).toBe(12);
	expect(clampSearchOffset('-1')).toBe(0);
	expect(clampSearchOffset('bad')).toBe(0);
});

test('indexed full-text search supports filters, quoted phrases, and exclusions', () => {
	const idx = emptyIndex();
	addNote(idx, 'Projects/Solar Plan.md', 'Solar Plan', 'Illinois Shines site survey steps and roof photos.', [], ['client/solar', 'active']);
	addNote(idx, 'Archive/Solar Draft.md', 'Solar Draft', 'Illinois Shines retired draft with old wording.', [], ['client/solar', 'draft']);
	addNote(idx, 'Projects/Meeting Notes.md', 'Meeting Notes', 'Illinois Shines roof survey from the call.', ['Call Notes'], ['client/water', 'active']);
	addNote(idx, 'Inbox/Random.md', 'Random', 'Loose note without the program phrase.', [], ['misc']);

	expect(searchFullTextIndex(idx, 'tag:#client/solar content:"Illinois Shines" -draft', 10).results.map((hit) => hit.path)).toEqual([
		'Projects/Solar Plan.md'
	]);
	expect(searchFullTextIndex(idx, 'path:Projects file:Meeting', 10).results.map((hit) => hit.path)).toEqual([
		'Projects/Meeting Notes.md'
	]);
	expect(searchFullTextIndex(idx, 'title:"Solar Plan"', 10).results.map((hit) => hit.path)).toEqual([
		'Projects/Solar Plan.md'
	]);
	expect(searchFullTextIndex(idx, 'tag:client', 10).total).toBe(3);
	expect(searchFullTextIndex(idx, 'content:roof -tag:client/water', 10).results.map((hit) => hit.path)).toEqual([
		'Projects/Solar Plan.md'
	]);
});

test('indexed full-text search supports boolean OR and safe regex terms', () => {
	const idx = emptyIndex();
	addNote(idx, 'Projects/Solar Plan.md', 'Solar Plan', 'Illinois Shines site survey steps and roof photos.', [], ['client/solar', 'active']);
	addNote(idx, 'Archive/Solar Draft.md', 'Solar Draft', 'Illinois Shines retired draft with old wording.', [], ['client/solar', 'draft']);
	addNote(idx, 'Projects/Meeting Notes.md', 'Meeting Notes', 'Illinois Shines roof survey from the call.', ['Call Notes'], ['client/water', 'active']);
	addNote(idx, 'Inbox/Apple Login.md', 'Apple Login', 'OAuth callback returned to the dashboard after Apple auth.', [], ['auth']);
	addNote(idx, 'Inbox/Random.md', 'Random', 'A normal sentence with or as a lowercase word.', [], ['misc']);

	expect(searchFullTextIndex(idx, 'file:/^Apple/ OR content:/roof\\s+photos/', 10).results.map((hit) => hit.path)).toEqual([
		'Inbox/Apple Login.md',
		'Projects/Solar Plan.md'
	]);
	expect(searchFullTextIndex(idx, 'content:/site\\s+survey/ -content:/retired|old/', 10).results.map((hit) => hit.path)).toEqual([
		'Projects/Solar Plan.md'
	]);
	expect(searchFullTextIndex(idx, 'tag:/client\\/(solar|water)/ content:/roof\\s+survey|roof\\s+photos/', 10).results.map((hit) => hit.path).sort()).toEqual([
		'Projects/Meeting Notes.md',
		'Projects/Solar Plan.md',
	]);
	const lowercaseOrPaths = searchFullTextIndex(idx, 'or', 10).results.map((hit) => hit.path);
	expect(lowercaseOrPaths).toContain('Inbox/Random.md');
	expect(lowercaseOrPaths).toContain('Archive/Solar Draft.md');
	expect(searchFullTextIndex(idx, 'content:/([a]+)+$/', 10).total).toBe(0);
	expect(searchFullTextIndex(idx, 'content:/[/', 10).total).toBe(0);
});

test('search result view helpers virtualize large returned result sets', () => {
	const results = Array.from({ length: 120 }, (_, i) => ({
		path: `Notes/Result ${String(i).padStart(3, '0')}.md`,
		title: `Result ${i}`,
		snippet: `snippet ${i}`
	}));

	const first = visibleSearchWindow(results, 0, 90, 30, 2);
	expect(first.totalHeight).toBe(3600);
	expect(first.startIndex).toBe(0);
	expect(first.endIndex).toBe(7);
	expect(first.visibleResults.map((row) => row.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);

	const middle = visibleSearchWindow(results, 900, 90, 30, 2);
	expect(middle.startIndex).toBe(28);
	expect(middle.endIndex).toBe(35);
	expect(middle.visibleResults[0].hit.path).toBe('Notes/Result 028.md');
	expect(searchResultRowStyle(middle.visibleResults[0], 30)).toBe(
		'--search-result-row-height: 30px; transform: translateY(840px);'
	);
});

test('search result view helpers group virtualized rows by folder', () => {
	const results = [
		{ path: 'Projects/Solar Plan.md', title: 'Solar Plan', snippet: 'roof survey' },
		{ path: 'Archive/Solar Draft.md', title: 'Solar Draft', snippet: 'old survey' },
		{ path: 'Projects/Water Plan.md', title: 'Water Plan', snippet: 'water survey' },
		{ path: 'Inbox.md', title: 'Inbox', snippet: 'root survey' }
	];

	expect(searchResultFolder('Projects/Solar Plan.md')).toBe('Projects');
	expect(searchResultFolder('Inbox.md')).toBe('Vault root');

	const rows = buildSearchResultRows(results, 'folder', 40, 12);
	expect(rows.groupCount).toBe(3);
	expect(rows.resultCount).toBe(4);
	expect(rows.totalHeight).toBe(196);
	expect(rows.rows.map((row) => row.kind === 'group' ? `${row.label}:${row.count}` : row.hit.path)).toEqual([
		'Projects:2',
		'Projects/Solar Plan.md',
		'Projects/Water Plan.md',
		'Archive:1',
		'Archive/Solar Draft.md',
		'Vault root:1',
		'Inbox.md'
	]);

	const middle = visibleSearchRows(rows, 52, 50, 1);
	expect(middle.visibleRows.map((item) => item.row.key)).toEqual([
		'result:0:Projects/Solar Plan.md',
		'result:2:Projects/Water Plan.md',
		'group:archive',
		'result:1:Archive/Solar Draft.md'
	]);
	expect(searchResultRowStyle(rows.rows[2])).toBe(
		'--search-result-row-height: 40px; transform: translateY(52px);'
	);
});

test('search result view helpers build folder facets and filter queries', () => {
	const results = [
		{ path: 'Projects/Solar Plan.md', title: 'Solar Plan', snippet: 'roof survey' },
		{ path: 'Archive/Solar Draft.md', title: 'Solar Draft', snippet: 'old survey' },
		{ path: 'Projects/Water Plan.md', title: 'Water Plan', snippet: 'water survey' },
		{ path: 'Client Work/Solar Prep.md', title: 'Solar Prep', snippet: 'prep' },
		{ path: 'Inbox.md', title: 'Inbox', snippet: 'root survey' }
	];

	expect(searchQueryHasPathFilter('roof path:Projects')).toBe(true);
	expect(searchQueryHasPathFilter('roof -path:Archive')).toBe(true);
	expect(searchQueryHasPathFilter('roof content:pathology')).toBe(false);
	expect(searchQueryWithFolder('roof survey', 'Projects')).toBe('roof survey path:"Projects"');
	expect(searchQueryWithFolder('roof survey', 'Client Work')).toBe('roof survey path:"Client Work"');
	expect(searchQueryWithFolder('roof survey', 'Vault root')).toBe('roof survey path:/^[^/]+\\.md$/');
	expect(searchQueryWithFolder('roof path:Projects', 'Archive')).toBe('roof path:Projects');

	expect(searchFolderFacets(results, 'roof survey', 3)).toEqual([
		{ label: 'Projects', count: 2, query: 'roof survey path:"Projects"' },
		{ label: 'Archive', count: 1, query: 'roof survey path:"Archive"' },
		{ label: 'Client Work', count: 1, query: 'roof survey path:"Client Work"' }
	]);
	expect(searchFolderFacets(results, 'roof path:Projects')).toEqual([]);
});

test('search highlight helpers split visible result text conservatively', () => {
	expect(searchHighlightTerms('content:"Illinois Shines" roof OR file:Solar -archive tag:client path:"Client Work" content:/roof\\s+survey/', 'title')).toEqual([
		'Solar',
		'roof'
	]);
	expect(searchHighlightTerms('content:"Illinois Shines" roof OR file:Solar -archive tag:client path:"Client Work" content:/roof\\s+survey/', 'path')).toEqual([
		'Client Work',
		'roof'
	]);
	expect(searchHighlightTerms('content:"Illinois Shines" roof OR file:Solar -archive tag:client path:"Client Work" content:/roof\\s+survey/', 'snippet')).toEqual([
		'Illinois Shines',
		'roof'
	]);
	expect(searchHighlightParts('Illinois Shines roof survey', 'content:"Illinois Shines" roof', 'snippet')).toEqual([
		{ text: 'Illinois Shines', match: true },
		{ text: ' ', match: false },
		{ text: 'roof', match: true },
		{ text: ' survey', match: false }
	]);
	expect(searchHighlightParts('Solar Shines', 'sol solar', 'title')).toEqual([
		{ text: 'Solar', match: true },
		{ text: ' Shines', match: false }
	]);
	expect(searchHighlightParts('Solar Shines', '-solar tag:client /shines/', 'title')).toEqual([
		{ text: 'Solar Shines', match: false }
	]);
});

test('saved search helpers persist sanitized vault-local search groups', () => {
	const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diamondmd-saved-searches-'));
	const vault = { id: 'saved-search-test', name: 'Saved Search Test', path: vaultDir };

	const created = saveSavedSearch(vault, {
		name: 'Client Solar',
		query: '  tag:client   content:"Illinois Shines"  ',
		mode: 'full'
	});
	expect(created.created).toBe(true);
	expect(created.search).toMatchObject({
		id: 'client-solar',
		name: 'Client Solar',
		query: 'tag:client content:"Illinois Shines"',
		mode: 'full'
	});
	expect(fs.existsSync(path.join(vaultDir, SAVED_SEARCHES_REL_PATH))).toBe(true);
	expect(listSavedSearches(vault).map((search) => search.name)).toEqual(['Client Solar']);

	const updated = saveSavedSearch(vault, {
		name: 'Client Solar',
		query: 'tag:client/solar -archive',
		mode: 'title'
	});
	expect(updated.created).toBe(false);
	expect(updated.searches).toHaveLength(1);
	expect(updated.searches[0]).toMatchObject({
		id: 'client-solar',
		query: 'tag:client/solar -archive',
		mode: 'title'
	});
	expect(savedSearchName('  long   search phrase  ')).toBe('long search phrase');
	expect(savedSearchModeLabel('full')).toBe('Notes');
	expect(savedSearchModeLabel('title')).toBe('Title');
	expect(searchModeFromFullText(true)).toBe('full');
	expect(savedSearchButtonLabel(updated.search)).toBe('Title Client Solar');
	expect(isActiveSavedSearch(updated.search, 'tag:client/solar -archive', 'title')).toBe(true);

	const removed = deleteSavedSearch(vault, 'client-solar');
	expect(removed.deleted).toBe(true);
	expect(removed.searches).toEqual([]);
});

test('search session helpers keep SearchView orchestration deterministic', () => {
	const firstPage = {
		query: 'roof',
		mode: 'full' as const,
		limit: 200,
		offset: 0,
		total: 3,
		limited: true,
		hasMore: true,
		nextOffset: 2,
		results: [
			{ path: 'Notes/Roof.md', title: 'Roof', snippet: 'roof notes' },
			{ path: 'Notes/Meter.md', title: 'Meter', snippet: 'meter notes' }
		]
	};
	const secondPage = {
		...firstPage,
		offset: 2,
		hasMore: false,
		nextOffset: null,
		results: [{ path: 'Notes/Bill.md', title: 'Bill', snippet: 'bill notes' }]
	};

	expect(searchRequestLimit(false)).toBe(100);
	expect(searchRequestLimit(true)).toBe(200);
	expect(searchRequestOffset(false, firstPage, 2)).toBe(0);
	expect(searchRequestOffset(true, firstPage, 2)).toBe(2);
	expect(searchRequestOffset(true, null, 5)).toBe(5);
	expect(searchRequestOptions(true, true, firstPage, 2)).toEqual({
		full: true,
		limit: 200,
		offset: 2
	});
	expect(canLoadMoreSearch(false, false, firstPage)).toBe(true);
	expect(canLoadMoreSearch(true, false, firstPage)).toBe(false);
	expect(canLoadMoreSearch(false, false, secondPage)).toBe(false);
	expect(mergeSearchResults(firstPage.results, secondPage, true).map((hit) => hit.path)).toEqual([
		'Notes/Roof.md',
		'Notes/Meter.md',
		'Notes/Bill.md'
	]);
	expect(mergeSearchResults(firstPage.results, secondPage, false).map((hit) => hit.path)).toEqual([
		'Notes/Bill.md'
	]);
	expect(canSaveCurrentSearch('  roof  ', false, false)).toBe(true);
	expect(canSaveCurrentSearch('', false, false)).toBe(false);
	expect(canSaveCurrentSearch('roof', true, false)).toBe(false);
	expect(canSaveCurrentSearch('roof', false, true)).toBe(false);
	expect(saveSearchTitle('', false)).toBe('Type a search to save it');
	expect(saveSearchTitle('roof', true)).toBe('This search is already saved');
	expect(saveSearchTitle('roof', false)).toBe('Save current search');
	expect(savedSearchDraftAfterQueryInput('roof photos', 'Saved search', false)).toEqual({
		savedName: 'roof photos',
		savedNameTouched: false
	});
	expect(savedSearchDraftAfterQueryInput('roof photos', 'Custom name', true)).toEqual({
		savedName: 'Custom name',
		savedNameTouched: true
	});
	expect(savedSearchDraftAfterExternalQuery(' tag:client   roof ')).toEqual({
		savedName: 'tag:client roof',
		savedNameTouched: false
	});
	expect(isSearchAbortError({ name: 'AbortError' })).toBe(true);
	expect(isSearchAbortError(new Error('AbortError'))).toBe(false);
});
