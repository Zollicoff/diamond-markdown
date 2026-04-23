/**
 * Workspace mutations. Every change to panes/tabs/layout goes through
 * here — no component pokes `workspace.panes[...]` directly.
 *
 * Each action calls `persist(vaultId)` at the end so localStorage is
 * always current.
 */

import type { Tab, Pane, LayoutNode, NoteTab, OpenMode } from './types';
import { workspace, persist } from './store.svelte';
import { on } from '$lib/events';

function randId(prefix = 'p'): string {
	return prefix + '_' + Math.random().toString(36).slice(2, 8);
}

function paneById(id: string): Pane | null {
	return workspace.panes[id] ?? null;
}

export function activePane(): Pane | null {
	return paneById(workspace.activePaneId);
}

export function activeTab(): Tab | null {
	const p = activePane();
	if (!p) return null;
	return p.tabs.find((t) => t.id === p.activeTabId) ?? null;
}

export function setActivePane(vaultId: string, paneId: string): void {
	if (!workspace.panes[paneId]) return;
	workspace.activePaneId = paneId;
	persist(vaultId);
}

export function activateTab(vaultId: string, paneId: string, tabId: string): void {
	const pane = paneById(paneId);
	if (!pane) return;
	if (!pane.tabs.find((t) => t.id === tabId)) return;
	pane.activeTabId = tabId;
	workspace.activePaneId = paneId;
	persist(vaultId);
}

/** Produce a stable id for a tab. For notes, we use the path — so the
 *  same note in one pane dedupes automatically. */
function tabIdFor(tab: Tab): string {
	if (tab.kind === 'note') return `note:${(tab as NoteTab).path}`;
	if (tab.kind === 'graph') return 'graph';
	if (tab.kind === 'tags') return `tags:${tab.filter ?? ''}`;
	if (tab.kind === 'search') return `search:${tab.query}`;
	if (tab.kind === 'settings') return 'settings';
	return randId('tab');
}

function ensureId(tab: Tab): Tab {
	if (tab.id) return tab;
	return { ...tab, id: tabIdFor(tab) };
}

/**
 * The heart of the open-a-tab behavior.
 *   replace  → active pane: if it has an active tab, swap its identity
 *              (same slot, new content). Otherwise append + activate.
 *   new-tab  → append to active pane, activate.
 *   new-pane → split off a new pane to the right, insert tab, activate.
 */
export function openTab(vaultId: string, tab: Tab, mode: OpenMode = 'replace'): void {
	const withId = ensureId(tab);

	if (mode === 'new-pane') {
		const newPaneId = randId('p');
		const newPane: Pane = { id: newPaneId, tabs: [withId], activeTabId: withId.id };
		workspace.panes[newPaneId] = newPane;
		workspace.layout = appendPaneRight(workspace.layout, newPaneId);
		workspace.activePaneId = newPaneId;
		persist(vaultId);
		return;
	}

	const pane = activePane();
	if (!pane) {
		// Defensive — should always have at least one pane.
		const fallbackId = randId('p');
		workspace.panes[fallbackId] = { id: fallbackId, tabs: [withId], activeTabId: withId.id };
		workspace.layout = { kind: 'split', direction: 'row', children: [{ kind: 'pane', paneId: fallbackId }], sizes: [1] };
		workspace.activePaneId = fallbackId;
		persist(vaultId);
		return;
	}

	if (mode === 'new-tab') {
		const existing = pane.tabs.find((t) => t.id === withId.id);
		if (existing) {
			pane.activeTabId = existing.id;
		} else {
			pane.tabs = [...pane.tabs, withId];
			pane.activeTabId = withId.id;
		}
		persist(vaultId);
		return;
	}

	// mode === 'replace'
	if (pane.tabs.length === 0) {
		pane.tabs = [withId];
		pane.activeTabId = withId.id;
	} else {
		// Already open? Just activate — don't duplicate.
		const existing = pane.tabs.find((t) => t.id === withId.id);
		if (existing) {
			pane.activeTabId = existing.id;
		} else {
			const idx = pane.tabs.findIndex((t) => t.id === pane.activeTabId);
			const replaceAt = idx >= 0 ? idx : pane.tabs.length - 1;
			const next = [...pane.tabs];
			next[replaceAt] = withId;
			pane.tabs = next;
			pane.activeTabId = withId.id;
		}
	}
	persist(vaultId);
}

export function openNote(vaultId: string, path: string, title: string, mode: OpenMode = 'replace'): void {
	const niceTitle = title || path.split('/').pop()!.replace(/\.md$/, '');
	openTab(vaultId, { id: `note:${path}`, kind: 'note', path, title: niceTitle }, mode);
}

/** Close the tab; returns the path of the note now showing in the active
 *  pane (for URL reconciliation), or null if no note is showing. */
export function closeTab(vaultId: string, paneId: string, tabId: string): NoteTab | null {
	const pane = paneById(paneId);
	if (!pane) return nextFocusedNoteTab();

	const idx = pane.tabs.findIndex((t) => t.id === tabId);
	if (idx < 0) return nextFocusedNoteTab();

	pane.tabs = pane.tabs.filter((t) => t.id !== tabId);

	// If we just emptied a non-primary pane, remove it entirely.
	if (pane.tabs.length === 0) {
		if (Object.keys(workspace.panes).length > 1) {
			removePane(paneId);
		} else {
			pane.activeTabId = null;
		}
	} else if (pane.activeTabId === tabId) {
		const nextIdx = Math.min(idx, pane.tabs.length - 1);
		pane.activeTabId = pane.tabs[nextIdx].id;
	}

	persist(vaultId);
	return nextFocusedNoteTab();
}

export function closePane(vaultId: string, paneId: string): NoteTab | null {
	if (Object.keys(workspace.panes).length <= 1) return nextFocusedNoteTab();
	removePane(paneId);
	persist(vaultId);
	return nextFocusedNoteTab();
}

function removePane(paneId: string): void {
	delete workspace.panes[paneId];
	workspace.layout = removePaneFromLayout(workspace.layout, paneId) ?? {
		kind: 'split',
		direction: 'row',
		children: [],
		sizes: []
	};
	if (workspace.activePaneId === paneId) {
		const remaining = Object.keys(workspace.panes);
		workspace.activePaneId = remaining[0] ?? '';
	}
	// If we removed the last pane, re-seed with an empty one so the
	// workspace stays valid.
	if (Object.keys(workspace.panes).length === 0) {
		const seedId = randId('p');
		workspace.panes[seedId] = { id: seedId, tabs: [], activeTabId: null };
		workspace.layout = { kind: 'split', direction: 'row', children: [{ kind: 'pane', paneId: seedId }], sizes: [1] };
		workspace.activePaneId = seedId;
	}
}

function appendPaneRight(layout: LayoutNode, paneId: string): LayoutNode {
	if (layout.kind === 'pane') {
		return {
			kind: 'split',
			direction: 'row',
			children: [layout, { kind: 'pane', paneId }],
			sizes: [1, 1]
		};
	}
	// At the outer row-split, append.
	if (layout.direction === 'row') {
		return {
			kind: 'split',
			direction: 'row',
			children: [...layout.children, { kind: 'pane', paneId }],
			sizes: [...layout.sizes, 1]
		};
	}
	// Non-row root — wrap.
	return {
		kind: 'split',
		direction: 'row',
		children: [layout, { kind: 'pane', paneId }],
		sizes: [1, 1]
	};
}

function removePaneFromLayout(node: LayoutNode, paneId: string): LayoutNode | null {
	if (node.kind === 'pane') return node.paneId === paneId ? null : node;
	const nextChildren: LayoutNode[] = [];
	const nextSizes: number[] = [];
	for (let i = 0; i < node.children.length; i++) {
		const pruned = removePaneFromLayout(node.children[i], paneId);
		if (pruned) {
			nextChildren.push(pruned);
			nextSizes.push(node.sizes[i]);
		}
	}
	if (nextChildren.length === 0) return null;
	if (nextChildren.length === 1) return nextChildren[0];
	return { ...node, children: nextChildren, sizes: nextSizes };
}

/** First active tab of the active pane that's a note, or any note tab
 *  still in the workspace, or null. Used for URL reconciliation after
 *  closures. */
function nextFocusedNoteTab(): NoteTab | null {
	const pane = activePane();
	if (pane) {
		const t = pane.tabs.find((x) => x.id === pane.activeTabId);
		if (t && t.kind === 'note') return t as NoteTab;
	}
	for (const p of Object.values(workspace.panes)) {
		for (const t of p.tabs) if (t.kind === 'note') return t as NoteTab;
	}
	return null;
}

/** Rewrite tabs when a note is renamed / moved, including folder-wide
 *  moves (prefix rewrite). Keeps tab positions intact. */
export function renameTabPath(vaultId: string, oldPath: string, newPath: string, newTitle?: string): void {
	let changed = false;
	for (const pane of Object.values(workspace.panes)) {
		for (let i = 0; i < pane.tabs.length; i++) {
			const t = pane.tabs[i];
			if (t.kind !== 'note') continue;
			if (t.path === oldPath) {
				const replaced: NoteTab = {
					...t,
					path: newPath,
					id: `note:${newPath}`,
					title: newTitle ?? newPath.split('/').pop()!.replace(/\.md$/, '')
				};
				pane.tabs[i] = replaced;
				if (pane.activeTabId === t.id) pane.activeTabId = replaced.id;
				changed = true;
			} else if (t.path.startsWith(oldPath + '/')) {
				// Folder prefix rewrite.
				const suffix = t.path.slice(oldPath.length);
				const merged = newPath + suffix;
				const replaced: NoteTab = {
					...t,
					path: merged,
					id: `note:${merged}`,
					title: merged.split('/').pop()!.replace(/\.md$/, '')
				};
				pane.tabs[i] = replaced;
				if (pane.activeTabId === t.id) pane.activeTabId = replaced.id;
				changed = true;
			}
		}
	}
	if (changed) persist(vaultId);
}

export function closeTabsByPath(vaultId: string, pathOrPrefix: string, isFolder: boolean): NoteTab | null {
	let changed = false;
	for (const pane of Object.values(workspace.panes)) {
		const before = pane.tabs.length;
		pane.tabs = pane.tabs.filter((t) => {
			if (t.kind !== 'note') return true;
			if (isFolder) return !(t.path === pathOrPrefix || t.path.startsWith(pathOrPrefix + '/'));
			return t.path !== pathOrPrefix;
		});
		if (pane.tabs.length !== before) {
			changed = true;
			if (!pane.tabs.find((t) => t.id === pane.activeTabId)) {
				pane.activeTabId = pane.tabs[pane.tabs.length - 1]?.id ?? null;
			}
		}
	}
	// Clean up empty non-primary panes.
	const paneIds = Object.keys(workspace.panes);
	for (const pid of paneIds) {
		const p = workspace.panes[pid];
		if (p.tabs.length === 0 && paneIds.length > 1) removePane(pid);
	}
	if (changed) persist(vaultId);
	return nextFocusedNoteTab();
}

export function setActiveTabTitle(vaultId: string, tabId: string, title: string): void {
	let changed = false;
	for (const pane of Object.values(workspace.panes)) {
		for (const t of pane.tabs) {
			if (t.id === tabId && t.title !== title) {
				t.title = title;
				changed = true;
			}
		}
	}
	if (changed) persist(vaultId);
}

export function moveTabBetween(vaultId: string, fromPaneId: string, tabId: string, toPaneId: string, toIndex: number): void {
	const from = paneById(fromPaneId);
	const to = paneById(toPaneId);
	if (!from || !to) return;
	const idx = from.tabs.findIndex((t) => t.id === tabId);
	if (idx < 0) return;
	const [tab] = from.tabs.splice(idx, 1);
	from.tabs = [...from.tabs]; // reactivity nudge
	const insertAt = Math.max(0, Math.min(toIndex, to.tabs.length));
	to.tabs = [...to.tabs.slice(0, insertAt), tab, ...to.tabs.slice(insertAt)];
	to.activeTabId = tab.id;
	if (!from.tabs.find((t) => t.id === from.activeTabId)) {
		from.activeTabId = from.tabs[from.tabs.length - 1]?.id ?? null;
	}
	if (from.tabs.length === 0 && Object.keys(workspace.panes).length > 1) {
		removePane(fromPaneId);
	}
	workspace.activePaneId = toPaneId;
	persist(vaultId);
}

export function reorderTab(vaultId: string, paneId: string, fromIdx: number, toIdx: number): void {
	const pane = paneById(paneId);
	if (!pane) return;
	if (fromIdx < 0 || fromIdx >= pane.tabs.length) return;
	const next = [...pane.tabs];
	const [t] = next.splice(fromIdx, 1);
	next.splice(Math.max(0, Math.min(toIdx, next.length)), 0, t);
	pane.tabs = next;
	persist(vaultId);
}

export function toggleLeftSidebar(vaultId: string): void {
	workspace.leftSidebarCollapsed = !workspace.leftSidebarCollapsed;
	persist(vaultId);
}

export function toggleRightSidebar(vaultId: string): void {
	workspace.rightSidebarCollapsed = !workspace.rightSidebarCollapsed;
	persist(vaultId);
}

/** One-time subscription: rewrite tabs on rename/delete events. Should
 *  be invoked once per vault load. */
export function bindVaultEvents(vaultId: string): () => void {
	const unsubs = [
		on('note:renamed', (e) => {
			if (e.vaultId !== vaultId) return;
			renameTabPath(vaultId, e.from, e.to);
		}),
		on('note:deleted', (e) => {
			if (e.vaultId !== vaultId) return;
			closeTabsByPath(vaultId, e.path, false);
		}),
		on('folder:renamed', (e) => {
			if (e.vaultId !== vaultId) return;
			renameTabPath(vaultId, e.from, e.to);
		}),
		on('folder:deleted', (e) => {
			if (e.vaultId !== vaultId) return;
			closeTabsByPath(vaultId, e.path, true);
		})
	];
	return () => unsubs.forEach((u) => u());
}
