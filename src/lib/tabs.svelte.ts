/**
 * Open-tabs state per vault. Persisted to localStorage so browser reloads
 * restore the working set, and survives client-side navigation within
 * the SPA without re-hitting the server.
 */

export interface Tab {
	path: string;
	title: string;
}

const STORAGE_KEY = (vaultId: string) => `diamond.tabs.${vaultId}`;

let tabs = $state<Tab[]>([]);
let hydratedFor: string | null = null;

function persist(vaultId: string): void {
	if (typeof localStorage === 'undefined') return;
	try { localStorage.setItem(STORAGE_KEY(vaultId), JSON.stringify(tabs)); } catch { /* quota, etc */ }
}

function hydrate(vaultId: string): void {
	if (hydratedFor === vaultId) return;
	if (typeof localStorage === 'undefined') { tabs = []; return; }
	try {
		const raw = localStorage.getItem(STORAGE_KEY(vaultId));
		tabs = raw ? (JSON.parse(raw) as Tab[]) : [];
	} catch { tabs = []; }
	hydratedFor = vaultId;
}

export const tabsStore = {
	get tabs() { return tabs; },

	hydrate(vaultId: string) { hydrate(vaultId); },

	/** Open-or-update a tab. Idempotent. */
	open(vaultId: string, path: string, title: string): void {
		hydrate(vaultId);
		const idx = tabs.findIndex((t) => t.path === path);
		if (idx >= 0) {
			if (tabs[idx].title !== title) {
				tabs[idx] = { path, title };
				tabs = [...tabs];
				persist(vaultId);
			}
			return;
		}
		tabs = [...tabs, { path, title }];
		persist(vaultId);
	},

	/** Close a tab. Returns the path to navigate to next, or null. */
	close(vaultId: string, path: string): string | null {
		hydrate(vaultId);
		const idx = tabs.findIndex((t) => t.path === path);
		if (idx < 0) return null;
		tabs = tabs.filter((t) => t.path !== path);
		persist(vaultId);
		if (tabs.length === 0) return null;
		return tabs[Math.min(idx, tabs.length - 1)].path;
	},

	/** Rename: update the entry in place, preserving position. */
	rename(vaultId: string, oldPath: string, newPath: string, newTitle: string): void {
		hydrate(vaultId);
		const idx = tabs.findIndex((t) => t.path === oldPath);
		if (idx < 0) return;
		tabs[idx] = { path: newPath, title: newTitle };
		tabs = [...tabs];
		persist(vaultId);
	},

	/** Close every tab (e.g. vault switch). */
	clear(vaultId: string): void {
		tabs = [];
		persist(vaultId);
	},

	/** Reorder — move `fromIdx` to `toIdx`. Used by drag-drop. */
	reorder(vaultId: string, fromIdx: number, toIdx: number): void {
		hydrate(vaultId);
		if (fromIdx < 0 || fromIdx >= tabs.length) return;
		const next = [...tabs];
		const [moved] = next.splice(fromIdx, 1);
		next.splice(Math.max(0, Math.min(toIdx, next.length)), 0, moved);
		tabs = next;
		persist(vaultId);
	}
};
