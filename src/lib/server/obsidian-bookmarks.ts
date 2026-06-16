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
import {
	SAVED_SEARCHES_REL_PATH,
	savedSearchStoreExists,
	seedSavedSearches,
	type SeedSavedSearchInput
} from './saved-searches';

type ObsidianBookmarkSource = 'bookmarks' | 'starred';

interface JsonReadResult {
	status: 'present' | 'missing' | 'invalid';
	value?: unknown;
	bytes?: number;
}

interface ObsidianBookmarkCandidate extends SeedBookmarkInput {
	path: string;
}

interface ObsidianSearchBookmarkCandidate extends SeedSavedSearchInput {
	query: string;
}

export interface ObsidianBookmarksImportResult {
	status: ObsidianBookmarksInfo['status'];
	source: ObsidianBookmarksInfo['source'];
	created: boolean;
	imported: number;
	importedSearches: number;
	skipped: number;
	paths: string[];
	searchQueries: string[];
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

function searchQueryValue(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const query = value.replace(/\s+/g, ' ').trim();
	return query || undefined;
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
	if (type === 'file' || type === 'search' || stringValue(body.path)) items.push(body);
	if (Array.isArray(body.items)) {
		for (const entry of body.items) collectRawBookmarkItems(entry, items);
	}
}

function searchBookmarkQuery(item: Record<string, unknown>): string | undefined {
	const state = record(item.state);
	return searchQueryValue(item.query)
		?? searchQueryValue(item.search)
		?? searchQueryValue(item.searchText)
		?? searchQueryValue(state?.query)
		?? searchQueryValue(state?.search)
		?? searchQueryValue(state?.searchText);
}

function bookmarkCandidates(root: string, value: unknown): {
	total: number;
	bookmarks: ObsidianBookmarkCandidate[];
	searches: ObsidianSearchBookmarkCandidate[];
} {
	const rawItems: Record<string, unknown>[] = [];
	const body = record(value);
	if (body && Array.isArray(body.items)) collectRawBookmarkItems(body.items, rawItems);
	else collectRawBookmarkItems(value, rawItems);

	const bookmarks: ObsidianBookmarkCandidate[] = [];
	const searches: ObsidianSearchBookmarkCandidate[] = [];
	for (const item of rawItems) {
		const type = stringValue(item.type)?.toLowerCase();
		if (type === 'search') {
			const query = searchBookmarkQuery(item);
			if (!query) continue;
			const title = stringValue(item.title) ?? stringValue(item.name) ?? query;
			const createdAt = timestampValue(item.ctime) ?? timestampValue(item.createdAt);
			const updatedAt = timestampValue(item.mtime) ?? timestampValue(item.updatedAt) ?? createdAt;
			searches.push({ name: title, query, mode: 'full', createdAt, updatedAt });
			continue;
		}
		const rawPath = stringValue(item.path);
		if (!rawPath) continue;
		const rel = cleanObsidianBookmarkPath(root, rawPath);
		if (!rel) continue;
		const title = stringValue(item.title) ?? stringValue(item.name) ?? titleFromPath(rel);
		const createdAt = timestampValue(item.ctime) ?? timestampValue(item.createdAt);
		const updatedAt = timestampValue(item.mtime) ?? timestampValue(item.updatedAt) ?? createdAt;
		bookmarks.push({ path: rel, title, createdAt, updatedAt });
	}
	return { total: rawItems.length, bookmarks, searches };
}

function readCandidateSource(root: string): {
	info: ObsidianBookmarksInfo;
	bookmarks: ObsidianBookmarkCandidate[];
	searches: ObsidianSearchBookmarkCandidate[];
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
					importableSearches: 0,
					paths: [],
					searchQueries: [],
					warnings
				},
				bookmarks: [],
				searches: []
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
				importableSearches: parsed.searches.length,
				paths: parsed.bookmarks.map((bookmark) => bookmark.path),
				searchQueries: parsed.searches.map((search) => search.query),
				warnings
			},
			bookmarks: parsed.bookmarks,
			searches: parsed.searches
		};
	}
	return {
		info: {
			status: 'missing',
			source: 'missing',
			totalItems: 0,
			importableBookmarks: 0,
			importableSearches: 0,
			paths: [],
			searchQueries: [],
			warnings: []
		},
		bookmarks: [],
		searches: []
	};
}

export function readObsidianBookmarks(root: string): ObsidianBookmarksInfo {
	return readCandidateSource(root).info;
}

export async function importObsidianBookmarks(vault: VaultRef): Promise<ObsidianBookmarksImportResult> {
	const { info, bookmarks, searches } = readCandidateSource(vault.path);
	if (info.status !== 'present') {
		return {
			status: info.status,
			source: info.source,
			created: false,
			imported: 0,
			importedSearches: 0,
			skipped: 0,
			paths: [],
			searchQueries: [],
			sha: null,
			reason: info.status === 'missing' ? 'no-obsidian-bookmarks' : 'invalid-obsidian-bookmarks'
		};
	}
	if (bookmarks.length === 0 && searches.length === 0) {
		return {
			status: info.status,
			source: info.source,
			created: false,
			imported: 0,
			importedSearches: 0,
			skipped: info.totalItems,
			paths: [],
			searchQueries: [],
			sha: null,
			reason: 'no-importable-bookmarks-or-searches'
		};
	}
	const canSeedBookmarks = bookmarks.length > 0 && !bookmarkStoreExists(vault);
	const canSeedSearches = searches.length > 0 && !savedSearchStoreExists(vault);
	if (!canSeedBookmarks && !canSeedSearches) {
		return {
			status: info.status,
			source: info.source,
			created: false,
			imported: 0,
			importedSearches: 0,
			skipped: bookmarks.length + searches.length,
			paths: info.paths,
			searchQueries: info.searchQueries,
			sha: null,
			reason: bookmarkStoreExists(vault) && savedSearchStoreExists(vault)
				? 'diamond-bookmarks-and-searches-exist'
				: bookmarkStoreExists(vault)
					? 'diamond-bookmarks-exist'
					: 'diamond-saved-searches-exist'
		};
	}
	const seededBookmarks = canSeedBookmarks
		? seedBookmarks(vault, bookmarks)
		: { created: false, imported: 0, bookmarks: [] };
	const seededSearches = canSeedSearches
		? seedSavedSearches(vault, searches)
		: { created: false, imported: 0, searches: [] };
	const createdFiles = [
		seededBookmarks.created ? BOOKMARKS_REL_PATH : null,
		seededSearches.created ? SAVED_SEARCHES_REL_PATH : null
	].filter((file): file is string => !!file);
	const commitLabel = seededBookmarks.created && seededSearches.created
		? 'imported Obsidian bookmarks and searches'
		: seededSearches.created
			? 'imported Obsidian searches'
			: 'imported Obsidian bookmarks';
	const commit = createdFiles.length > 0 && fs.existsSync(path.join(vault.path, '.git'))
		? await commitChange(vault, createdFiles, 'create', commitLabel)
		: null;
	return {
		status: info.status,
		source: info.source,
		created: createdFiles.length > 0,
		imported: seededBookmarks.imported,
		importedSearches: seededSearches.imported,
		skipped: Math.max(0, info.totalItems - seededBookmarks.imported - seededSearches.imported),
		paths: seededBookmarks.bookmarks.length > 0
			? seededBookmarks.bookmarks.map((bookmark) => bookmark.path)
			: info.paths,
		searchQueries: seededSearches.searches.length > 0
			? seededSearches.searches.map((search) => search.query)
			: info.searchQueries,
		sha: commit?.sha ?? null
	};
}
