import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
	BOOKMARKS_REL_PATH,
	deleteBookmark,
	listBookmarks,
	removeBookmarksForPath,
	renameBookmarksForPath,
	saveBookmark,
	seedBookmarks
} from '../src/lib/server/bookmarks';
import { readObsidianBookmarks } from '../src/lib/server/obsidian-bookmarks';
import type { VaultRef } from '../src/lib/types';

function vaultFixture(): { vaultDir: string; vault: VaultRef } {
	const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diamondmd-bookmarks-'));
	fs.mkdirSync(path.join(vaultDir, 'Notes', 'Archive'), { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Notes', 'Solar.md'), '# Solar\n');
	fs.writeFileSync(path.join(vaultDir, 'Notes', 'Archive', 'Old.md'), '# Old\n');
	return {
		vaultDir,
		vault: { id: 'bookmarks', name: 'Bookmarks', path: vaultDir }
	};
}

test.describe('git-backed bookmarks', () => {
	test('stores normalized vault bookmarks in .diamondmd', () => {
		const { vaultDir, vault } = vaultFixture();
		const created = saveBookmark(vault, {
			path: './Notes/Solar',
			title: '  Solar   Visit  '
		});

		expect(created.created).toBe(true);
		expect(created.bookmark).toMatchObject({
			path: 'Notes/Solar.md',
			title: 'Solar Visit'
		});
		expect(fs.existsSync(path.join(vaultDir, BOOKMARKS_REL_PATH))).toBe(true);
		expect(listBookmarks(vault).map((bookmark) => bookmark.path)).toEqual(['Notes/Solar.md']);

		const updated = saveBookmark(vault, {
			path: 'Notes/Solar.md',
			title: 'Solar Followup'
		});
		expect(updated.created).toBe(false);
		expect(updated.bookmarks).toHaveLength(1);
		expect(updated.bookmarks[0]).toMatchObject({
			path: 'Notes/Solar.md',
			title: 'Solar Followup'
		});

		const removed = deleteBookmark(vault, 'Notes/Solar.md');
		expect(removed.deleted).toBe(true);
		expect(removed.bookmarks).toEqual([]);
	});

	test('rejects non-note and hidden config bookmark paths', () => {
		const { vault } = vaultFixture();
		expect(() => saveBookmark(vault, { path: 'Board.canvas', title: 'Board' })).toThrow('markdown note');
		expect(() => saveBookmark(vault, { path: '.diamondmd/bookmarks.json', title: 'Config' })).toThrow('markdown note');
		expect(() => saveBookmark(vault, { path: '.hidden/Secret.md', title: 'Secret' })).toThrow('visible markdown note');
	});

	test('updates bookmark paths when notes and folders move', () => {
		const { vault, vaultDir } = vaultFixture();
		saveBookmark(vault, { path: 'Notes/Solar.md', title: 'Solar' });
		saveBookmark(vault, { path: 'Notes/Archive/Old.md', title: 'Old' });

		const renamedNote = renameBookmarksForPath(vault, 'Notes/Solar.md', 'Notes/Solar Visit.md');
		expect(renamedNote.changed).toBe(true);
		expect(renamedNote.bookmarks.map((bookmark) => bookmark.path)).toContain('Notes/Solar Visit.md');

		const renamedFolder = renameBookmarksForPath(vault, 'Notes/Archive', 'Projects/Archive', { folder: true });
		expect(renamedFolder.changed).toBe(true);
		expect(renamedFolder.bookmarks.map((bookmark) => bookmark.path)).toContain('Projects/Archive/Old.md');

		const removedFolder = removeBookmarksForPath(vault, 'Projects', { folder: true });
		expect(removedFolder.changed).toBe(true);
		expect(removedFolder.bookmarks.map((bookmark) => bookmark.path)).toEqual(['Notes/Solar Visit.md']);

		const body = JSON.parse(fs.readFileSync(path.join(vaultDir, BOOKMARKS_REL_PATH), 'utf-8')) as { bookmarks: { path: string }[] };
		expect(body.bookmarks.map((bookmark) => bookmark.path)).toEqual(['Notes/Solar Visit.md']);
	});

	test('seeds Diamond bookmarks without overwriting existing stores', () => {
		const { vault } = vaultFixture();
		const seeded = seedBookmarks(vault, [
			{ path: 'Notes/Solar.md', title: 'Solar' },
			{ path: 'Notes/Solar.md', title: 'Duplicate' },
			{ path: 'Board.canvas', title: 'Board' }
		]);
		expect(seeded.created).toBe(true);
		expect(seeded.imported).toBe(1);
		expect(seeded.bookmarks.map((bookmark) => bookmark.path)).toEqual(['Notes/Solar.md']);

		const skipped = seedBookmarks(vault, [{ path: 'Notes/Archive/Old.md', title: 'Old' }]);
		expect(skipped.created).toBe(false);
		expect(skipped.imported).toBe(0);
		expect(skipped.bookmarks.map((bookmark) => bookmark.path)).toEqual(['Notes/Solar.md']);
	});

	test('reads current and legacy Obsidian bookmarks as visible note bookmarks', () => {
		const { vaultDir } = vaultFixture();
		fs.mkdirSync(path.join(vaultDir, '.obsidian'), { recursive: true });
		fs.writeFileSync(path.join(vaultDir, 'Loose.md'), '# Loose\n');
		fs.writeFileSync(path.join(vaultDir, '.obsidian', 'bookmarks.json'), JSON.stringify({
			items: [
				{
					type: 'group',
					title: 'Pinned',
					items: [
						{ type: 'file', path: 'Notes/Solar.md', title: 'Solar Bookmark', ctime: 1_700_000_000_000 },
						{ type: 'file', path: 'Missing.md', title: 'Missing' },
						{ type: 'file', path: 'Board.canvas', title: 'Board' }
					]
				},
				{ type: 'search', query: 'tag:#todo' },
				{ path: 'Loose.md#Heading', title: 'Loose heading' }
			]
		}));

		const current = readObsidianBookmarks(vaultDir);
		expect(current).toMatchObject({
			path: '.obsidian/bookmarks.json',
			status: 'present',
			source: 'bookmarks',
			totalItems: 4,
			importableBookmarks: 2,
			paths: ['Notes/Solar.md', 'Loose.md']
		});

		fs.rmSync(path.join(vaultDir, '.obsidian', 'bookmarks.json'));
		fs.writeFileSync(path.join(vaultDir, '.obsidian', 'starred.json'), JSON.stringify({
			items: [
				{ type: 'file', path: 'Notes/Archive/Old.md', title: 'Legacy Old' },
				{ type: 'file', path: '.obsidian/Secret.md', title: 'Secret' }
			]
		}));
		const legacy = readObsidianBookmarks(vaultDir);
		expect(legacy).toMatchObject({
			path: '.obsidian/starred.json',
			status: 'present',
			source: 'starred',
			totalItems: 2,
			importableBookmarks: 1,
			paths: ['Notes/Archive/Old.md']
		});
	});
});
