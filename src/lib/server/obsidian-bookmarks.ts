import fs from 'node:fs';
import path from 'node:path';
import type { ObsidianBookmarksInfo, VaultRef } from '$lib/types';
import {
	BOOKMARKS_REL_PATH,
	bookmarkStoreExists,
	seedBookmarks,
	type SeedBookmarkInput
} from './bookmarks';
import { commitChange } from './git';
import { ensureMdExt, normalizeVaultPath, resolveInVault } from './paths';

type ObsidianBookmarkSource = 'bookmarks' | 'starred';

interface JsonReadResult {
	status: 'present' | 'missing' | 'invalid';
	value?: unknown;
	bytes?: number;
}

interface ObsidianBookmarkCandidate extends SeedBookmarkInput {
	path: string;
}

export interface ObsidianBookmarksImportResult {
	status: ObsidianBookmarksInfo['status'];
	source: ObsidianBookmarksInfo['source'];
	created: boolean;
	imported: number;
	skipped: number;
	paths: string[];
	sha: string | null;
	reason?: string;
}

const OBSIDIAN_BOOKMARK_SOURCES: { source: ObsidianBookmarkSource; relPath: string }[] = [
	{ source: 'bookmarks', relPath: '.obsidian/bookmarks.json' },
	{ source: 'starred', relPath: '.obsidian/starred.json' }
];

function readJsonFile(abs: string): JsonReadResult {
	if (!fs.existsSync(abs)) return { status: 'missing' };
	let content = '';
	try {
		content = fs.readFileSync(abs, 'utf-8');
		return { status: 'present', value: JSON.parse(content) as unknown, bytes: Buffer.byteLength(content, 'utf-8') };
	} catch {
		return { status: 'invalid', bytes: content ? Buffer.byteLength(content, 'utf-8') : undefined };
	}
}

function record(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? value as Record<string, unknown>
		: null;
}

function stringValue(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function timestampValue(value: unknown): string | undefined {
	if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
		return new Date(value).toISOString();
	}
	if (typeof value === 'string' && value.trim()) {
		const parsed = Date.parse(value);
		if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
	}
	return undefined;
}

function titleFromPath(rel: string): string {
	return path.basename(rel, path.extname(rel));
}

function cleanObsidianBookmarkPath(root: string, rawPath: string): string | null {
	const pathOnly = rawPath.split('#', 1)[0]?.trim();
	if (!pathOnly) return null;
	let rel: string;
	try {
		rel = ensureMdExt(normalizeVaultPath(pathOnly));
	} catch {
		return null;
	}
	if (!/\.(md|markdown)$/i.test(rel) || rel.split('/').some((segment) => segment.startsWith('.'))) {
		return null;
	}
	try {
		const abs = resolveInVault({ id: 'obsidian-import', name: 'Obsidian import', path: root }, rel);
		return fs.existsSync(abs) && fs.statSync(abs).isFile() ? rel : null;
	} catch {
		return null;
	}
}

function collectRawBookmarkItems(value: unknown, items: Record<string, unknown>[]): void {
	if (Array.isArray(value)) {
		for (const entry of value) collectRawBookmarkItems(entry, items);
		return;
	}
	const body = record(value);
	if (!body) return;
	const type = stringValue(body.type)?.toLowerCase();
	if (type === 'file' || stringValue(body.path)) items.push(body);
	if (Array.isArray(body.items)) {
		for (const entry of body.items) collectRawBookmarkItems(entry, items);
	}
}

function bookmarkCandidates(root: string, value: unknown): { total: number; bookmarks: ObsidianBookmarkCandidate[] } {
	const rawItems: Record<string, unknown>[] = [];
	const body = record(value);
	if (body && Array.isArray(body.items)) collectRawBookmarkItems(body.items, rawItems);
	else collectRawBookmarkItems(value, rawItems);

	const bookmarks: ObsidianBookmarkCandidate[] = [];
	for (const item of rawItems) {
		const rawPath = stringValue(item.path);
		if (!rawPath) continue;
		const rel = cleanObsidianBookmarkPath(root, rawPath);
		if (!rel) continue;
		const title = stringValue(item.title) ?? stringValue(item.name) ?? titleFromPath(rel);
		const createdAt = timestampValue(item.ctime) ?? timestampValue(item.createdAt);
		const updatedAt = timestampValue(item.mtime) ?? timestampValue(item.updatedAt) ?? createdAt;
		bookmarks.push({ path: rel, title, createdAt, updatedAt });
	}
	return { total: rawItems.length, bookmarks };
}

function readCandidateSource(root: string): {
	info: ObsidianBookmarksInfo;
	bookmarks: ObsidianBookmarkCandidate[];
} {
	for (const source of OBSIDIAN_BOOKMARK_SOURCES) {
		const abs = path.join(root, source.relPath);
		const file = readJsonFile(abs);
		if (file.status === 'missing') continue;
		const warnings: string[] = [];
		if (file.status === 'invalid') {
			warnings.push(`${source.relPath} is present but is not valid JSON.`);
			return {
				info: {
					path: source.relPath,
					status: 'invalid',
					source: source.source,
					bytes: file.bytes,
					totalItems: 0,
					importableBookmarks: 0,
					paths: [],
					warnings
				},
				bookmarks: []
			};
		}
		const parsed = bookmarkCandidates(root, file.value);
		return {
			info: {
				path: source.relPath,
				status: 'present',
				source: source.source,
				bytes: file.bytes,
				totalItems: parsed.total,
				importableBookmarks: parsed.bookmarks.length,
				paths: parsed.bookmarks.map((bookmark) => bookmark.path),
				warnings
			},
			bookmarks: parsed.bookmarks
		};
	}
	return {
		info: {
			status: 'missing',
			source: 'missing',
			totalItems: 0,
			importableBookmarks: 0,
			paths: [],
			warnings: []
		},
		bookmarks: []
	};
}

export function readObsidianBookmarks(root: string): ObsidianBookmarksInfo {
	return readCandidateSource(root).info;
}

export async function importObsidianBookmarks(vault: VaultRef): Promise<ObsidianBookmarksImportResult> {
	const { info, bookmarks } = readCandidateSource(vault.path);
	if (info.status !== 'present') {
		return {
			status: info.status,
			source: info.source,
			created: false,
			imported: 0,
			skipped: 0,
			paths: [],
			sha: null,
			reason: info.status === 'missing' ? 'no-obsidian-bookmarks' : 'invalid-obsidian-bookmarks'
		};
	}
	if (bookmarks.length === 0) {
		return {
			status: info.status,
			source: info.source,
			created: false,
			imported: 0,
			skipped: info.totalItems,
			paths: [],
			sha: null,
			reason: 'no-importable-bookmarks'
		};
	}
	if (bookmarkStoreExists(vault)) {
		return {
			status: info.status,
			source: info.source,
			created: false,
			imported: 0,
			skipped: bookmarks.length,
			paths: info.paths,
			sha: null,
			reason: 'diamond-bookmarks-exist'
		};
	}
	const seeded = seedBookmarks(vault, bookmarks);
	const commit = seeded.created && fs.existsSync(path.join(vault.path, '.git'))
		? await commitChange(vault, [BOOKMARKS_REL_PATH], 'create', 'imported Obsidian bookmarks')
		: null;
	return {
		status: info.status,
		source: info.source,
		created: seeded.created,
		imported: seeded.imported,
		skipped: Math.max(0, info.totalItems - seeded.imported),
		paths: seeded.bookmarks.map((bookmark) => bookmark.path),
		sha: commit?.sha ?? null
	};
}
