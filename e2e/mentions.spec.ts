import { expect, test } from '@playwright/test';
import type { NoteMeta, VaultIndex } from '../src/lib/server/indexer';
import { unlinkedMentionsForNote } from '../src/lib/server/mentions';

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

function addNote(idx: VaultIndex, notePath: string, title: string, text: string, aliases: string[] = []): void {
	const stem = notePath.replace(/\.md$/i, '').split('/').pop()?.toLowerCase() ?? notePath.toLowerCase();
	const meta: NoteMeta = {
		notePath,
		title,
		aliases,
		tags: [],
		stem
	};
	const normalized = text.replace(/\s+/g, ' ').trim();
	idx.notes.set(notePath, meta);
	idx.searchDocs.set(notePath, {
		notePath,
		text: normalized,
		textLower: normalized.toLowerCase()
	});
}

test('unlinked mention helper finds title and alias mentions while skipping linked notes', () => {
	const idx = emptyIndex();
	addNote(idx, 'Projects/Solar Plan.md', 'Solar Plan', '# Solar Plan', ['Illinois Shines']);
	addNote(idx, 'Daily.md', 'Daily', 'Illinois Shines came up on the call.');
	addNote(idx, 'Linked.md', 'Linked', 'See [[Solar Plan]] before the meeting.');
	addNote(idx, 'Noise.md', 'Noise', 'The solarized theme is unrelated.');
	idx.backlinks.set('Projects/Solar Plan.md', new Set(['Linked.md']));

	expect(unlinkedMentionsForNote(idx, 'Projects/Solar Plan.md')).toEqual([
		{ path: 'Daily.md', title: 'Daily' }
	]);
});
