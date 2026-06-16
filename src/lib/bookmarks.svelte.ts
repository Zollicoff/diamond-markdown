/**
 * Per-vault bookmark store. Bookmarks live in `.diamondmd/bookmarks.json`
 * inside the vault so they follow the same git/GitHub sync path as notes.
 */

import { api } from '$lib/vault-api';
import type { Bookmark } from '$lib/types';

interface State {
	byVault: Record<string, Bookmark[]>;
	loaded: Record<string, boolean>;
	loading: Record<string, boolean>;
	errors: Record<string, string | null>;
}

const state = $state<State>({
	byVault: {},
	loaded: {},
	loading: {},
	errors: {}
});

export async function hydrate(vaultId: string, force = false): Promise<void> {
	if (!force && (state.loaded[vaultId] || state.loading[vaultId])) return;
	state.loading[vaultId] = true;
	state.errors[vaultId] = null;
	try {
		state.byVault[vaultId] = await api.bookmarks(vaultId);
		state.loaded[vaultId] = true;
	} catch (e) {
		state.byVault[vaultId] = [];
		state.errors[vaultId] = (e as Error).message;
	} finally {
		state.loading[vaultId] = false;
	}
}

function ensureHydrating(vaultId: string): void {
	if (!state.loaded[vaultId] && !state.loading[vaultId]) void hydrate(vaultId);
}

export function list(vaultId: string): Bookmark[] {
	ensureHydrating(vaultId);
	return state.byVault[vaultId] ?? [];
}

export function isStarred(vaultId: string, path: string): boolean {
	ensureHydrating(vaultId);
	return (state.byVault[vaultId] ?? []).some((b) => b.path === path);
}

function setBookmarks(vaultId: string, bookmarks: Bookmark[]): void {
	state.byVault[vaultId] = bookmarks;
	state.loaded[vaultId] = true;
	state.errors[vaultId] = null;
}

export async function add(vaultId: string, path: string, title: string): Promise<void> {
	await hydrate(vaultId);
	const cur = state.byVault[vaultId] ?? [];
	if (cur.some((b) => b.path === path)) return;
	const response = await api.saveBookmark(vaultId, { path, title });
	setBookmarks(vaultId, response.bookmarks);
}

export async function remove(vaultId: string, path: string): Promise<void> {
	await hydrate(vaultId);
	const cur = state.byVault[vaultId] ?? [];
	if (!cur.some((b) => b.path === path)) return;
	const response = await api.deleteBookmark(vaultId, path);
	setBookmarks(vaultId, response.bookmarks);
}

export async function toggle(vaultId: string, path: string, title: string): Promise<void> {
	await hydrate(vaultId);
	if (isStarred(vaultId, path)) await remove(vaultId, path);
	else await add(vaultId, path, title);
}

export function rename(vaultId: string, oldPath: string, newPath: string, newTitle?: string): void {
	ensureHydrating(vaultId);
	const cur = state.byVault[vaultId] ?? [];
	let changed = false;
	state.byVault[vaultId] = cur.map((b) => {
		if (b.path === oldPath) { changed = true; return { ...b, path: newPath, title: newTitle ?? b.title }; }
		if (b.path.startsWith(oldPath + '/')) {
			changed = true;
			return { ...b, path: newPath + b.path.slice(oldPath.length) };
		}
		return b;
	});
	if (changed) state.loaded[vaultId] = true;
}

export function deleted(vaultId: string, path: string): void {
	ensureHydrating(vaultId);
	const cur = state.byVault[vaultId] ?? [];
	const next = cur.filter((b) => b.path !== path && !b.path.startsWith(path + '/'));
	if (next.length !== cur.length) {
		state.byVault[vaultId] = next;
		state.loaded[vaultId] = true;
	}
}

/** Reactive snapshot — components can $derive on this. */
export function snapshot(vaultId: string): Bookmark[] {
	ensureHydrating(vaultId);
	return state.byVault[vaultId] ?? [];
}

export const bookmarks = state;
