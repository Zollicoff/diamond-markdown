import fs from 'node:fs';
import path from 'node:path';
import type { SavedSearch, SavedSearchMode, VaultRef } from '$lib/types';
import { slugify } from '$lib/util/strings';

export const SAVED_SEARCHES_REL_PATH = '.diamondmd/searches.json';

const MAX_SAVED_SEARCHES = 200;
const MAX_SEARCH_NAME_LENGTH = 80;
const MAX_SEARCH_QUERY_LENGTH = 512;
const SEARCH_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

interface SavedSearchStore {
	version: 1;
	searches: SavedSearch[];
}

export interface SaveSavedSearchInput {
	id?: unknown;
	name?: unknown;
	query?: unknown;
	mode?: unknown;
}

export interface SaveSavedSearchResult {
	search: SavedSearch;
	searches: SavedSearch[];
	created: boolean;
}

function savedSearchesPath(vault: VaultRef): string {
	return path.join(vault.path, SAVED_SEARCHES_REL_PATH);
}

function nowIso(): string {
	return new Date().toISOString();
}

function cleanSearchMode(value: unknown): SavedSearchMode {
	return value === 'full' ? 'full' : 'title';
}

function cleanQuery(value: unknown): string {
	const query = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
	if (!query) throw new Error('saved search query required');
	if (query.length > MAX_SEARCH_QUERY_LENGTH) {
		throw new Error(`saved search query must be ${MAX_SEARCH_QUERY_LENGTH} characters or fewer`);
	}
	return query;
}

function cleanName(value: unknown, query: string): string {
	const raw = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
	const fallback = query.slice(0, MAX_SEARCH_NAME_LENGTH).trim();
	const name = (raw || fallback || 'Saved search').slice(0, MAX_SEARCH_NAME_LENGTH).trim();
	if (!name) throw new Error('saved search name required');
	return name;
}

function cleanId(value: unknown, fallbackName: string): string {
	const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
	if (raw) {
		if (!SEARCH_ID_RE.test(raw)) throw new Error('saved search id is invalid');
		return raw;
	}
	return slugify(fallbackName, { maxLength: 48, fallback: 'search' });
}

function normalizeSearch(raw: unknown): SavedSearch | null {
	if (!raw || typeof raw !== 'object') return null;
	const obj = raw as Record<string, unknown>;
	const id = typeof obj.id === 'string' ? obj.id.trim().toLowerCase() : '';
	const name = typeof obj.name === 'string' ? obj.name.trim() : '';
	const query = typeof obj.query === 'string' ? obj.query.trim() : '';
	if (!SEARCH_ID_RE.test(id) || !name || !query) return null;
	return {
		id,
		name: name.slice(0, MAX_SEARCH_NAME_LENGTH),
		query: query.slice(0, MAX_SEARCH_QUERY_LENGTH),
		mode: cleanSearchMode(obj.mode),
		createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : nowIso(),
		updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : nowIso()
	};
}

function sortSavedSearches(searches: SavedSearch[]): SavedSearch[] {
	return [...searches].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name));
}

function readStore(vault: VaultRef): SavedSearchStore {
	const file = savedSearchesPath(vault);
	if (!fs.existsSync(file)) return { version: 1, searches: [] };
	let raw: unknown;
	try {
		raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as unknown;
	} catch {
		throw new Error('saved searches file is invalid JSON');
	}
	const source = Array.isArray(raw)
		? raw
		: raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).searches)
			? (raw as Record<string, unknown>).searches as unknown[]
			: null;
	if (!source) throw new Error('saved searches file must contain a searches array');
	return {
		version: 1,
		searches: sortSavedSearches(source.map(normalizeSearch).filter((search): search is SavedSearch => !!search))
			.slice(0, MAX_SAVED_SEARCHES)
	};
}

function writeStore(vault: VaultRef, store: SavedSearchStore): void {
	const file = savedSearchesPath(vault);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, JSON.stringify(store, null, 2) + '\n', 'utf-8');
}

export function listSavedSearches(vault: VaultRef): SavedSearch[] {
	return readStore(vault).searches;
}

export function saveSavedSearch(vault: VaultRef, input: SaveSavedSearchInput): SaveSavedSearchResult {
	const store = readStore(vault);
	const query = cleanQuery(input.query);
	const name = cleanName(input.name, query);
	const id = cleanId(input.id, name);
	const existingIndex = store.searches.findIndex((search) => search.id === id);
	const createdAt = existingIndex >= 0 ? store.searches[existingIndex].createdAt : nowIso();
	const search: SavedSearch = {
		id,
		name,
		query,
		mode: cleanSearchMode(input.mode),
		createdAt,
		updatedAt: nowIso()
	};
	const next = existingIndex >= 0
		? store.searches.map((item, index) => index === existingIndex ? search : item)
		: [search, ...store.searches];
	const searches = sortSavedSearches(next).slice(0, MAX_SAVED_SEARCHES);
	writeStore(vault, { version: 1, searches });
	return { search, searches, created: existingIndex < 0 };
}

export function deleteSavedSearch(vault: VaultRef, id: unknown): { deleted: boolean; searches: SavedSearch[] } {
	const clean = cleanId(id, 'search');
	const store = readStore(vault);
	const searches = store.searches.filter((search) => search.id !== clean);
	const deleted = searches.length !== store.searches.length;
	if (deleted) writeStore(vault, { version: 1, searches });
	return { deleted, searches };
}
