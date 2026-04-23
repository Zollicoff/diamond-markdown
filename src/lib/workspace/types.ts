/**
 * Workspace data model. Polymorphic tabs + recursive layout tree.
 *
 * v1 only renders flat rows of panes, but the tree type is in place
 * so nested splits can land without a data migration — we'd only need
 * to change the renderer, not the store.
 */

export type TabKind = 'note' | 'graph' | 'tags' | 'search' | 'settings';

interface TabBase {
	id: string;
	kind: TabKind;
	title: string;
}

export interface NoteTab extends TabBase {
	kind: 'note';
	path: string; // vault-relative with .md
}

export interface GraphTab extends TabBase {
	kind: 'graph';
}

export interface TagsTab extends TabBase {
	kind: 'tags';
	filter?: string;
}

export interface SearchTab extends TabBase {
	kind: 'search';
	query: string;
}

export interface SettingsTab extends TabBase {
	kind: 'settings';
}

export type Tab = NoteTab | GraphTab | TagsTab | SearchTab | SettingsTab;

export interface Pane {
	id: string;
	tabs: Tab[];
	activeTabId: string | null;
}

/**
 * Recursive layout tree. v1 always produces a single flat row:
 *   { kind: 'split', direction: 'row', children: [{kind:'pane', paneId:'p1'}], sizes: [1] }
 *
 * Future vertical / nested splits append to children + sizes.
 */
export type LayoutNode =
	| { kind: 'split'; direction: 'row' | 'col'; children: LayoutNode[]; sizes: number[] }
	| { kind: 'pane'; paneId: string };

export interface WorkspaceState {
	panes: Record<string, Pane>;
	layout: LayoutNode;
	activePaneId: string;
	leftSidebarCollapsed: boolean;
	rightSidebarCollapsed: boolean;
	leftPanelId: string;  // which panel in the left sidebar is active (v1: 'files')
	rightPanelId: string; // v1: 'backlinks'
}

/** Where to open a newly-requested tab. */
export type OpenMode = 'replace' | 'new-tab' | 'new-pane';

/** A shape safe to serialize — matches WorkspaceState 1:1 currently. */
export type PersistedWorkspace = WorkspaceState;
