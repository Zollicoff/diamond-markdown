import { test, expect } from '@playwright/test';
import type { NoteMeta, VaultIndex } from '../src/lib/server/indexer';
import { clampSearchLimit, clampSearchOffset, searchFullTextIndex } from '../src/lib/server/search';
import { searchResultRowStyle, visibleSearchWindow } from '../src/lib/search/view';

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
