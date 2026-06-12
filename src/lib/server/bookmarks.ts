import fs from 'node:fs';
import path from 'node:path';
import type { Bookmark, VaultRef } from '$lib/types';
import { ensureMdExt, normalizeVaultPath } from './paths';

export const BOOKMARKS_REL_PATH = '.diamondmd/bookmarks.json';

const MAX_BOOKMARKS = 500;
const MAX_BOOKMARK_TITLE_LENGTH = 120;

interface BookmarkStore {
	version: 1;
	bookmarks: Bookmark[];
}

export interface SaveBookmarkInput {
	path?: unknown;
	title?: unknown;
}

export interface SaveBookmarkResult {
	bookmark: Bookmark;
	bookmarks: Bookmark[];
	created: boolean;
}

function bookmarksPath(vault: VaultRef): string {
	return path.join(vault.path, BOOKMARKS_REL_PATH);
}

function nowIso(): string {
	return new Date().toISOString();
}

function titleFromPath(rel: string): string {
	return path.basename(rel, path.extname(rel));
}

function cleanBookmarkPath(value: unknown): string {
	if (typeof value !== 'string' || !value.trim()) throw new Error('bookmark path required');
	const rel = ensureMdExt(value.trim());
	if (!/\.(md|markdown)$/i.test(rel)) throw new Error('bookmark path must be a markdown note');
	if (rel.split('/').some((segment) => segment.startsWith('.'))) {
		throw new Error('bookmark path must be a visible markdown note');
	}
	return rel;
}

function cleanFolderPath(value: string): string {
	return normalizeVaultPath(value.replace(/\/+$/g, ''));
}

function cleanBookmarkTitle(value: unknown, rel: string): string {
	const raw = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
	return (raw || titleFromPath(rel)).slice(0, MAX_BOOKMARK_TITLE_LENGTH).trim() || titleFromPath(rel);
}

function normalizeBookmark(raw: unknown): Bookmark | null {
	if (!raw || typeof raw !== 'object') return null;
	const obj = raw as Record<string, unknown>;
	let rel: string;
	try {
		rel = cleanBookmarkPath(obj.path);
	} catch {
		return null;
	}
	const title = cleanBookmarkTitle(obj.title, rel);
	return {
		path: rel,
		title,
		createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : nowIso(),
		updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : nowIso()
	};
}

function sortBookmarks(bookmarks: Bookmark[]): Bookmark[] {
	return [...bookmarks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title));
}

function readStore(vault: VaultRef): BookmarkStore {
	const file = bookmarksPath(vault);
	if (!fs.existsSync(file)) return { version: 1, bookmarks: [] };
	let raw: unknown;
	try {
		raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as unknown;
	} catch {
		throw new Error('bookmarks file is invalid JSON');
	}
	const source = Array.isArray(raw)
		? raw
		: raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).bookmarks)
			? (raw as Record<string, unknown>).bookmarks as unknown[]
			: null;
	if (!source) throw new Error('bookmarks file must contain a bookmarks array');
	return {
		version: 1,
		bookmarks: sortBookmarks(source.map(normalizeBookmark).filter((bookmark): bookmark is Bookmark => !!bookmark))
			.slice(0, MAX_BOOKMARKS)
	};
}

function writeStore(vault: VaultRef, store: BookmarkStore): void {
	const file = bookmarksPath(vault);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, JSON.stringify(store, null, 2) + '\n', 'utf-8');
}

export function listBookmarks(vault: VaultRef): Bookmark[] {
	return readStore(vault).bookmarks;
}

export function saveBookmark(vault: VaultRef, input: SaveBookmarkInput): SaveBookmarkResult {
	const store = readStore(vault);
	const rel = cleanBookmarkPath(input.path);
	const title = cleanBookmarkTitle(input.title, rel);
	const existingIndex = store.bookmarks.findIndex((bookmark) => bookmark.path === rel);
	const createdAt = existingIndex >= 0 ? store.bookmarks[existingIndex].createdAt : nowIso();
	const bookmark: Bookmark = {
		path: rel,
		title,
		createdAt,
		updatedAt: nowIso()
	};
	const next = existingIndex >= 0
		? store.bookmarks.map((item, index) => index === existingIndex ? bookmark : item)
		: [bookmark, ...store.bookmarks];
	const bookmarks = sortBookmarks(next).slice(0, MAX_BOOKMARKS);
	writeStore(vault, { version: 1, bookmarks });
	return { bookmark, bookmarks, created: existingIndex < 0 };
}

export function deleteBookmark(vault: VaultRef, inputPath: unknown): { deleted: boolean; bookmarks: Bookmark[] } {
	const rel = cleanBookmarkPath(inputPath);
	const store = readStore(vault);
	const bookmarks = store.bookmarks.filter((bookmark) => bookmark.path !== rel);
	const deleted = bookmarks.length !== store.bookmarks.length;
	if (deleted) writeStore(vault, { version: 1, bookmarks });
	return { deleted, bookmarks };
}

export function renameBookmarksForPath(
	vault: VaultRef,
	fromPath: string,
	toPath: string,
	options: { folder?: boolean; title?: string } = {}
): { changed: boolean; bookmarks: Bookmark[] } {
	const store = readStore(vault);
	const from = options.folder ? cleanFolderPath(fromPath) : cleanBookmarkPath(fromPath);
	const to = options.folder ? cleanFolderPath(toPath) : cleanBookmarkPath(toPath);
	const fromPrefix = `${from}/`;
	const toPrefix = `${to}/`;
	let changed = false;
	const updatedAt = nowIso();
	const bookmarks = store.bookmarks.map((bookmark) => {
		if (options.folder) {
			if (!bookmark.path.startsWith(fromPrefix)) return bookmark;
			changed = true;
			return { ...bookmark, path: `${toPrefix}${bookmark.path.slice(fromPrefix.length)}`, updatedAt };
		}
		if (bookmark.path !== from) return bookmark;
		changed = true;
		return { ...bookmark, path: to, title: options.title ?? titleFromPath(to), updatedAt };
	});
	if (changed) writeStore(vault, { version: 1, bookmarks: sortBookmarks(bookmarks).slice(0, MAX_BOOKMARKS) });
	return { changed, bookmarks: changed ? listBookmarks(vault) : store.bookmarks };
}

export function removeBookmarksForPath(
	vault: VaultRef,
	inputPath: string,
	options: { folder?: boolean } = {}
): { changed: boolean; bookmarks: Bookmark[] } {
	const store = readStore(vault);
	const rel = options.folder ? cleanFolderPath(inputPath) : cleanBookmarkPath(inputPath);
	const prefix = `${rel}/`;
	const bookmarks = store.bookmarks.filter((bookmark) => (
		options.folder ? !bookmark.path.startsWith(prefix) : bookmark.path !== rel
	));
	const changed = bookmarks.length !== store.bookmarks.length;
	if (changed) writeStore(vault, { version: 1, bookmarks });
	return { changed, bookmarks };
}
