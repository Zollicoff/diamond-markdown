<script lang="ts">
	import type { TreeNode } from '$lib/types';
	import FileTree from '$lib/components/FileTree.svelte';
	import ContextMenu, { type MenuItem, type Position } from '$lib/components/ContextMenu.svelte';
	import { api } from '$lib/vault-api';
	import { openNote } from '$lib/workspace/actions';
	import { fileMenu, folderMenu, rootMenu } from './menu-builders';
	import type { OpenMode } from '$lib/workspace/types';

	interface Props {
		vaultId: string;
		tree: TreeNode[];
	}

	let { vaultId, tree }: Props = $props();

	let renamingPath = $state<string | null>(null);
	let menuOpen = $state(false);
	let menuPos = $state<Position>({ x: 0, y: 0 });
	let menuItems = $state<MenuItem[]>([]);

	// Expand all root folders by default (first load feel).
	let rootExpand = $derived(new Set(tree.filter((n) => n.type === 'directory').map((n) => n.path)));

	function showMenu(e: MouseEvent, items: MenuItem[]): void {
		menuPos = { x: e.clientX, y: e.clientY };
		menuItems = items;
		menuOpen = true;
	}

	function beginRename(node: TreeNode): void {
		renamingPath = node.path;
	}

	async function commitRename(node: TreeNode, newName: string): Promise<void> {
		if (!newName || newName === node.name.replace(/\.md$/, '') || newName === node.name) {
			renamingPath = null;
			return;
		}
		const parent = node.path.split('/').slice(0, -1).join('/');
		const newPath = (parent ? `${parent}/` : '') + (node.type === 'file' ? `${newName}.md` : newName);
		renamingPath = null;
		try {
			if (node.type === 'file') await api.renameNote(vaultId, node.path, newPath);
			else await api.renameFolder(vaultId, node.path, newPath);
		} catch (e) {
			alert((e as Error).message);
		}
	}

	async function handleDropMove(srcPath: string, destFolder: string): Promise<void> {
		const isFolder = !srcPath.endsWith('.md');
		const name = srcPath.split('/').pop()!;
		const newPath = destFolder ? `${destFolder}/${name}` : name;
		if (newPath === srcPath) return;
		try {
			if (isFolder) await api.renameFolder(vaultId, srcPath, newPath);
			else await api.renameNote(vaultId, srcPath, newPath);
		} catch (e) {
			alert((e as Error).message);
		}
	}

	function onNodeContext(e: MouseEvent, node: TreeNode): void {
		const deps = { vaultId, beginRename };
		showMenu(e, node.type === 'file' ? fileMenu(node, deps) : folderMenu(node, deps));
	}

	function onRootContextFire(e: MouseEvent): void {
		showMenu(e, rootMenu({ vaultId, beginRename }));
	}

	function modeFor(e: MouseEvent): OpenMode {
		if (e.button === 1) return 'new-tab';
		if (e.metaKey || e.ctrlKey) return 'new-tab';
		if (e.altKey) return 'new-pane';
		return 'replace';
	}

	function onFileClick(e: MouseEvent, node: TreeNode): void {
		if (renamingPath === node.path) return;
		e.preventDefault();
		openNote(vaultId, node.path, node.name.replace(/\.md$/, ''), modeFor(e));
	}
</script>

<div
	class="wrap"
	oncontextmenu={(e) => {
		if ((e.target as HTMLElement).closest('.node')) return;
		e.preventDefault();
		onRootContextFire(e);
	}}
>
	<FileTree
		nodes={tree}
		{vaultId}
		activePath={null}
		expanded={rootExpand}
		{renamingPath}
		onContext={onNodeContext}
		onRootContext={onRootContextFire}
		onDropMove={handleDropMove}
		onRenameCommit={commitRename}
		onRenameCancel={() => (renamingPath = null)}
		onFileClick={onFileClick}
	/>
</div>

{#if menuOpen}
	<ContextMenu items={menuItems} pos={menuPos} onClose={() => (menuOpen = false)} />
{/if}

<style>
	.wrap { flex: 1; min-height: 0; overflow-y: auto; padding: 10px; }
</style>
