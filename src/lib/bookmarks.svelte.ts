/**
 * Per-vault bookmark store. Persisted to localStorage so it survives
 * reloads but stays local to each device. (Cloud sync is the user's
 * problem — git the vault if you want bookmarks shared.)
 */

import { browser } from '$app/environment';

export interface Bookmark { path: string; title: string; }

interface State { byVault: Record<string, Bookmark[]>; }

const state = $state<State>({ byVault: {} });

function key(vaultId: string): string { return `diamond.bookmarks.${vaultId}`; }

export function hydrate(vaultId: string): void {
	if (!browser) return;
	if (state.byVault[vaultId]) return;
	try {
		const raw = localStorage.getItem(key(vaultId));
		state.byVault[vaultId] = raw ? (JSON.parse(raw) as Bookmark[]) : [];
	} catch {
		state.byVault[vaultId] = [];
	}
}

function persist(vaultId: string): void {
	if (!browser) return;
	try { localStorage.setItem(key(vaultId), JSON.stringify(state.byVault[vaultId] ?? [])); } catch { /* quota / disabled */ }
}

export function list(vaultId: string): Bookmark[] {
	hydrate(vaultId);
	return state.byVault[vaultId] ?? [];
}

export function isStarred(vaultId: string, path: string): boolean {
	hydrate(vaultId);
	return (state.byVault[vaultId] ?? []).some((b) => b.path === path);
}

export function add(vaultId: string, path: string, title: string): void {
	hydrate(vaultId);
	const cur = state.byVault[vaultId] ?? [];
	if (cur.some((b) => b.path === path)) return;
	state.byVault[vaultId] = [{ path, title }, ...cur];
	persist(vaultId);
}

export function remove(vaultId: string, path: string): void {
	hydrate(vaultId);
	const cur = state.byVault[vaultId] ?? [];
	state.byVault[vaultId] = cur.filter((b) => b.path !== path);
	persist(vaultId);
}

export function toggle(vaultId: string, path: string, title: string): void {
	if (isStarred(vaultId, path)) remove(vaultId, path);
	else add(vaultId, path, title);
}

export function rename(vaultId: string, oldPath: string, newPath: string, newTitle?: string): void {
	hydrate(vaultId);
	const cur = state.byVault[vaultId] ?? [];
	let changed = false;
	state.byVault[vaultId] = cur.map((b) => {
		if (b.path === oldPath) { changed = true; return { path: newPath, title: newTitle ?? b.title }; }
		if (b.path.startsWith(oldPath + '/')) {
			changed = true;
			return { path: newPath + b.path.slice(oldPath.length), title: b.title };
		}
		return b;
	});
	if (changed) persist(vaultId);
}

export function deleted(vaultId: string, path: string): void {
	hydrate(vaultId);
	const cur = state.byVault[vaultId] ?? [];
	const next = cur.filter((b) => b.path !== path && !b.path.startsWith(path + '/'));
	if (next.length !== cur.length) {
		state.byVault[vaultId] = next;
		persist(vaultId);
	}
}

/** Reactive snapshot — components can $derive on this. */
export function snapshot(vaultId: string): Bookmark[] {
	hydrate(vaultId);
	return state.byVault[vaultId] ?? [];
}

export const bookmarks = state;
