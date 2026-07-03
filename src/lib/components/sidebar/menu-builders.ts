/**
 * Factories for building context-menu item arrays. Each builder takes
 * a node + callbacks that dispatch commands — so the menu stays tied
 * to the command registry, but commands don't have to know about menu
 * UIs themselves.
 */

import type { MenuItem } from '$lib/components/ContextMenu.svelte';
import type { TreeNode } from '$lib/types';
import { exec } from '$lib/commands';
import { isStarred } from '$lib/bookmarks.svelte';

export interface MenuBuilderDeps {
	vaultId: string;
	beginRename: (node: TreeNode) => void;
}

export function fileMenu(node: TreeNode, deps: MenuBuilderDeps): MenuItem[] {
	const ctx = { vaultId: deps.vaultId, node };
	const starred = isStarred(deps.vaultId, node.path);
	return [
		{ label: 'Open', icon: '→', action: () => exec('tabs.open', ctx) },
		{ label: 'Open in new tab', icon: '⎚', shortcut: '⌘click', action: () => exec('tabs.open-in-new-tab', ctx) },
		{ label: 'Open in new pane', icon: '⊞', action: () => exec('tabs.open-in-new-pane', ctx) },
		{ separator: true, label: '' },
		{ label: starred ? 'Remove bookmark' : 'Bookmark', icon: starred ? '☆' : '★', action: () => exec('note.toggle-star', ctx) },
		{ label: 'Rename', icon: '✎', shortcut: 'F2', action: () => deps.beginRename(node) },
		{ label: 'Duplicate', icon: '❏', action: () => exec('note.duplicate', ctx) },
		{ label: 'Copy path', icon: '⎘', action: () => exec('path.copy', ctx) },
		{ separator: true, label: '' },
		{ label: 'Delete', icon: '🗑', danger: true, action: () => exec('note.delete', ctx) }
	];
}

export function folderMenu(node: TreeNode, deps: MenuBuilderDeps): MenuItem[] {
	const ctx = { vaultId: deps.vaultId, node };
	const empty = !node.children || node.children.length === 0;
	return [
		{ label: 'New note here', icon: '＋', action: () => exec('note.create', ctx) },
		{ label: 'New folder here', icon: '📁', action: () => exec('folder.create', ctx) },
		{ separator: true, label: '' },
		{ label: 'Rename', icon: '✎', shortcut: 'F2', action: () => deps.beginRename(node) },
		{ label: 'Copy path', icon: '⎘', action: () => exec('path.copy', ctx) },
		{ label: 'Exclude from index', icon: '🚫', action: () => exec('folder.toggle-exclude', ctx) },
		{ separator: true, label: '' },
		{
			label: empty ? 'Delete empty folder' : 'Delete folder + contents',
			icon: '🗑',
			danger: true,
			action: () => exec('folder.delete', { ...ctx, force: !empty })
		}
	];
}

export function rootMenu(deps: MenuBuilderDeps): MenuItem[] {
	const ctx = { vaultId: deps.vaultId };
	return [
		{ label: 'New note', icon: '＋', action: () => exec('note.create', ctx) },
		{ label: 'New folder', icon: '📁', action: () => exec('folder.create', ctx) }
	];
}
