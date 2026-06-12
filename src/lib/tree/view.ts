import type { TreeNode } from '$lib/types';

export const TREE_SORT_LABELS = {
	'name-asc': 'File name (A → Z)',
	'name-desc': 'File name (Z → A)',
	'mtime-desc': 'Modified time (new → old)',
	'mtime-asc': 'Modified time (old → new)',
	'ctime-desc': 'Created time (new → old)',
	'ctime-asc': 'Created time (old → new)'
} as const;

export type TreeSortMode = keyof typeof TREE_SORT_LABELS;

export interface SortMenuPosition {
	top: number;
	left: number;
}

export interface TreePanelPreferences {
	sortMode: TreeSortMode;
	autoReveal: boolean;
}

export interface FlatTreeRow {
	node: TreeNode;
	depth: number;
}

export interface VisibleTreeRow extends FlatTreeRow {
	index: number;
}

export interface VisibleTreeWindow {
	totalHeight: number;
	startIndex: number;
	visibleCount: number;
	endIndex: number;
	visibleRows: VisibleTreeRow[];
}

const COLLATOR_OPTIONS: Intl.CollatorOptions = { sensitivity: 'base', numeric: true };
export const TREE_SORT_MENU_WIDTH = 220;
export const TREE_ROW_HEIGHT = 26;
export const TREE_OVERSCAN = 12;
export const TREE_DEFAULT_VIEWPORT_HEIGHT = 520;

export function isTreeSortMode(value: unknown): value is TreeSortMode {
	return typeof value === 'string' && value in TREE_SORT_LABELS;
}

export function defaultTreePanelPreferences(): TreePanelPreferences {
	return { sortMode: 'name-asc', autoReveal: false };
}

export function treePreferencesStorageKey(vaultId: string): string {
	return `diamond.tree-prefs.${vaultId}`;
}

export function treeExpansionStorageKey(vaultId: string): string {
	return `diamond.tree-expand.${vaultId}`;
}

function record(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? value as Record<string, unknown>
		: null;
}

export function parseTreePanelPreferences(raw: string | null): Partial<TreePanelPreferences> {
	if (!raw) return {};
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return {};
	}

	const source = record(parsed);
	if (!source) return {};

	const prefs: Partial<TreePanelPreferences> = {};
	if (isTreeSortMode(source.sortMode)) prefs.sortMode = source.sortMode;
	if (typeof source.autoReveal === 'boolean') prefs.autoReveal = source.autoReveal;
	return prefs;
}

export function parseTreeExpansion(raw: string | null): Set<string> | null {
	if (!raw) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!Array.isArray(parsed)) return null;
	return new Set(parsed.filter((item): item is string => typeof item === 'string'));
}

export function treePanelPreferencesSnapshot(prefs: TreePanelPreferences): TreePanelPreferences {
	return {
		sortMode: prefs.sortMode,
		autoReveal: prefs.autoReveal
	};
}

export function compareTreeNodes(a: TreeNode, b: TreeNode, mode: TreeSortMode): number {
	if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;

	const direction = mode.endsWith('-asc') ? 1 : -1;
	if (mode.startsWith('name')) return direction * compareNames(a.name, b.name);

	const aTime = mode.startsWith('mtime') ? (a.mtime ?? 0) : (a.ctime ?? 0);
	const bTime = mode.startsWith('mtime') ? (b.mtime ?? 0) : (b.ctime ?? 0);

	if (a.type === 'directory' || aTime === bTime) return compareNames(a.name, b.name);
	return direction * (aTime - bTime);
}

export function sortTreeNodes(nodes: TreeNode[], mode: TreeSortMode): TreeNode[] {
	return [...nodes]
		.sort((a, b) => compareTreeNodes(a, b, mode))
		.map((node) => node.children ? { ...node, children: sortTreeNodes(node.children, mode) } : node);
}

export function collectDirectoryPaths(nodes: TreeNode[], out: Set<string> = new Set()): Set<string> {
	for (const node of nodes) {
		if (node.type !== 'directory') continue;
		out.add(node.path);
		if (node.children) collectDirectoryPaths(node.children, out);
	}
	return out;
}

export function topLevelDirectoryPaths(nodes: TreeNode[]): Set<string> {
	return new Set(nodes.filter((node) => node.type === 'directory').map((node) => node.path));
}

export function flattenVisibleTreeRows(
	nodes: TreeNode[],
	expanded: Set<string>,
	depth = 0,
	out: FlatTreeRow[] = []
): FlatTreeRow[] {
	for (const node of nodes) {
		out.push({ node, depth });
		if (node.type === 'directory' && expanded.has(node.path) && node.children?.length) {
			flattenVisibleTreeRows(node.children, expanded, depth + 1, out);
		}
	}
	return out;
}

export function visibleTreeWindow(
	flatRows: FlatTreeRow[],
	scrollTop: number,
	viewportHeight: number,
	rowHeight = TREE_ROW_HEIGHT,
	overscan = TREE_OVERSCAN,
	defaultViewportHeight = TREE_DEFAULT_VIEWPORT_HEIGHT
): VisibleTreeWindow {
	const totalHeight = flatRows.length * rowHeight;
	const measuredHeight = viewportHeight || defaultViewportHeight;
	const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
	const visibleCount = Math.ceil(measuredHeight / rowHeight) + overscan * 2;
	const endIndex = Math.min(flatRows.length, startIndex + visibleCount);
	const visibleRows = flatRows.slice(startIndex, endIndex).map((row, offset) => ({
		...row,
		index: startIndex + offset
	}));
	return { totalHeight, startIndex, visibleCount, endIndex, visibleRows };
}

export function treeRowStyle(row: VisibleTreeRow, rowHeight = TREE_ROW_HEIGHT): string {
	return `--tree-depth: ${row.depth}; transform: translateY(${row.index * rowHeight}px);`;
}

export function parentDirectoriesForPath(path: string): string[] {
	const parts = path.split('/').filter(Boolean).slice(0, -1);
	const parents: string[] = [];
	let current = '';
	for (const part of parts) {
		current = current ? `${current}/${part}` : part;
		parents.push(current);
	}
	return parents;
}

export function revealParentDirectories(expanded: Set<string>, path: string | null): Set<string> {
	if (!path) return expanded;
	const parents = parentDirectoriesForPath(path);
	if (parents.length === 0) return expanded;

	const next = new Set(expanded);
	let changed = false;
	for (const parent of parents) {
		if (next.has(parent)) continue;
		next.add(parent);
		changed = true;
	}
	return changed ? next : expanded;
}

export function treePathParent(path: string): string {
	return path.split('/').slice(0, -1).join('/');
}

export function treePathIsDescendant(parent: string, maybeChild: string): boolean {
	return maybeChild === parent || maybeChild.startsWith(parent + '/');
}

export function sortMenuPositionFromRect(rect: Pick<DOMRect, 'bottom' | 'right'>, width = TREE_SORT_MENU_WIDTH): SortMenuPosition {
	return {
		top: rect.bottom + 4,
		left: rect.right - width
	};
}

export function treeFileDisplayName(node: TreeNode): string {
	return node.name.replace(/\.(md|markdown|canvas)$/i, '');
}

export function treeInitialRenameValue(node: TreeNode): string {
	return node.type === 'file' ? treeFileDisplayName(node) : node.name;
}

export function treeFileHref(vaultId: string, node: TreeNode): string {
	const route = isCanvasTreeFile(node) ? 'canvas' : 'note';
	return `/vault/${vaultId}/${route}/${encodeURI(node.path)}`;
}

export function renamedTreeNodePath(node: TreeNode, newName: string): string {
	const parent = node.path.split('/').slice(0, -1).join('/');
	const trimmed = newName.trim().replace(/^\/+|\/+$/g, '');
	if (!trimmed) return node.path;
	if (node.type === 'directory') return parent ? `${parent}/${trimmed}` : trimmed;

	const existingExt = node.name.match(/\.(md|markdown|canvas)$/i)?.[0] ?? '';
	const hasKnownExt = /\.(md|markdown|canvas)$/i.test(trimmed);
	const fileName = hasKnownExt || !existingExt ? trimmed : `${trimmed}${existingExt}`;
	return parent ? `${parent}/${fileName}` : fileName;
}

export function isCanvasTreeFile(node: TreeNode): boolean {
	return node.type === 'file' && (node.fileKind === 'canvas' || node.path.toLowerCase().endsWith('.canvas'));
}

export function isMarkdownTreeFile(node: TreeNode): boolean {
	if (node.type !== 'file') return false;
	return node.fileKind === 'markdown' || /\.(md|markdown)$/i.test(node.path);
}

function compareNames(a: string, b: string): number {
	return a.localeCompare(b, undefined, COLLATOR_OPTIONS);
}
