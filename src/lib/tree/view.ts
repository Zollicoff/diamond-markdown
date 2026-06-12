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

const COLLATOR_OPTIONS: Intl.CollatorOptions = { sensitivity: 'base', numeric: true };
export const TREE_SORT_MENU_WIDTH = 220;

export function isTreeSortMode(value: unknown): value is TreeSortMode {
	return typeof value === 'string' && value in TREE_SORT_LABELS;
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

export function sortMenuPositionFromRect(rect: Pick<DOMRect, 'bottom' | 'right'>, width = TREE_SORT_MENU_WIDTH): SortMenuPosition {
	return {
		top: rect.bottom + 4,
		left: rect.right - width
	};
}

export function treeFileDisplayName(node: TreeNode): string {
	return node.name.replace(/\.(md|markdown|canvas)$/i, '');
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
