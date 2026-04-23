/**
 * Workspace runes store — panes, layout, sidebar state — per vault.
 * Persisted to localStorage so reloads restore the exact working
 * setup. Hydrated lazily the first time a component reads for a
 * given vault.
 *
 * Keep this file focused on state + persistence only. Mutation helpers
 * live in ./actions.ts.
 */

import type { Pane, WorkspaceState, LayoutNode, PersistedWorkspace } from './types';

const STORAGE_KEY = (vaultId: string) => `diamond.workspace.${vaultId}`;

function emptyWorkspace(): WorkspaceState {
	const paneId = 'p1';
	return {
		panes: { [paneId]: { id: paneId, tabs: [], activeTabId: null } },
		layout: { kind: 'split', direction: 'row', children: [{ kind: 'pane', paneId }], sizes: [1] },
		activePaneId: paneId,
		leftSidebarCollapsed: false,
		rightSidebarCollapsed: false,
		leftPanelId: 'files',
		rightPanelId: 'backlinks'
	};
}

/** Shallow validation — reject obviously-wrong persisted blobs. */
function isValidState(x: unknown): x is PersistedWorkspace {
	if (!x || typeof x !== 'object') return false;
	const w = x as Partial<PersistedWorkspace>;
	if (!w.panes || typeof w.panes !== 'object') return false;
	if (!w.layout || typeof w.layout !== 'object') return false;
	if (typeof w.activePaneId !== 'string') return false;
	if (!w.panes[w.activePaneId]) return false;
	return true;
}

export const workspace = $state<WorkspaceState>(emptyWorkspace());

let hydratedFor: string | null = null;

function persistNow(vaultId: string): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY(vaultId), JSON.stringify($state.snapshot(workspace)));
	} catch { /* quota */ }
}

/** Hydrate from localStorage the first time a vault is viewed. */
export function hydrate(vaultId: string): void {
	if (hydratedFor === vaultId) return;
	const fresh = emptyWorkspace();
	Object.assign(workspace, fresh);
	if (typeof localStorage !== 'undefined') {
		try {
			const raw = localStorage.getItem(STORAGE_KEY(vaultId));
			if (raw) {
				const parsed = JSON.parse(raw);
				if (isValidState(parsed)) Object.assign(workspace, parsed);
			}
		} catch { /* ignore, keep defaults */ }
	}
	hydratedFor = vaultId;
}

/** Call after every state mutation to write-through to localStorage. */
export function persist(vaultId: string): void {
	persistNow(vaultId);
}

/** Reset the current workspace (e.g. on major trouble). */
export function reset(vaultId: string): void {
	Object.assign(workspace, emptyWorkspace());
	persistNow(vaultId);
}

/** Flat list of panes in layout order. Useful for rendering. */
export function panesInLayoutOrder(state: WorkspaceState = workspace): Pane[] {
	const out: Pane[] = [];
	const walk = (node: LayoutNode): void => {
		if (node.kind === 'pane') {
			const p = state.panes[node.paneId];
			if (p) out.push(p);
		} else {
			for (const c of node.children) walk(c);
		}
	};
	walk(state.layout);
	return out;
}
