<script lang="ts">
	import { onMount } from 'svelte';
	import type { TreeNode } from '$lib/types';
	import FileTree from '$lib/components/FileTree.svelte';
	import ContextMenu, { type MenuItem, type Position } from '$lib/components/ContextMenu.svelte';
	import FileTreeToolbar from './FileTreeToolbar.svelte';
	import { api } from '$lib/vault-api';
	import { openCanvas, openNote } from '$lib/workspace/actions';
	import { canvasFileMenu, fileMenu, folderMenu, rootMenu } from './menu-builders';
	import { on as onBus } from '$lib/events';
	import { workspace } from '$lib/workspace/store.svelte';
	import { openModeForPointer } from '$lib/workspace/open-mode';
	import { alertDialog } from '$lib/dialogs';
	import { createTreePanelState } from '$lib/tree/panel-state.svelte';
	import {
		buildTreeDropMoveIntent,
		buildTreeRenameIntent,
		collectDirectoryPaths,
		isCanvasTreeFile,
		isMarkdownTreeFile,
		revealParentDirectories,
		sortTreeNodes,
		treeFileDisplayName,
		type TreeMutationIntent,
		topLevelDirectoryPaths
	} from '$lib/tree/view';

	interface Props {
		vaultId: string;
		tree: TreeNode[];
	}

	let { vaultId, tree }: Props = $props();

	let renamingPath = $state<string | null>(null);
	let menuOpen = $state(false);
	let menuPos = $state<Position>({ x: 0, y: 0 });
	let menuItems = $state<MenuItem[]>([]);

	// --- Toolbar state, persisted per-vault ---------------------------
	const treePanel = createTreePanelState(() => vaultId, () => topLevelDirectoryPaths(tree));
	const treePrefs = treePanel.prefs;

	$effect(() => {
		treePanel.persistPreferences();
	});
	$effect(() => {
		treePanel.persistExpansion();
	});

	const sortedTree = $derived(sortTreeNodes(tree, treePrefs.sortMode));

	// --- Expand / collapse helpers -----------------------------------
	const allDirPaths = $derived(collectDirectoryPaths(tree));
	const allCollapsed = $derived(treePanel.expanded.size === 0);

	function toggleDir(p: string): void {
		const next = new Set(treePanel.expanded);
		if (next.has(p)) next.delete(p);
		else next.add(p);
		treePanel.expanded = next;
	}

	function expandAll(): void { treePanel.expanded = new Set(allDirPaths); }
	function collapseAll(): void { treePanel.expanded = new Set(); }
	function toggleExpandAll(): void { allCollapsed ? expandAll() : collapseAll(); }

	// --- Highlight + auto-reveal -------------------------------------
	const activePath = $derived.by<string | null>(() => {
		const pane = workspace.panes[workspace.activePaneId];
		if (!pane) return null;
		const tab = pane.tabs.find((t) => t.id === pane.activeTabId);
		return tab?.kind === 'note' || tab?.kind === 'canvas' ? tab.path : null;
	});

	$effect(() => {
		if (!treePrefs.autoReveal || !activePath) return;
		// Expand every parent folder of the active note path.
		const next = revealParentDirectories(treePanel.expanded, activePath);
		if (next !== treePanel.expanded) treePanel.expanded = next;
	});

	// --- Renaming + clicks (unchanged from previous version) ---------
	function showMenu(e: MouseEvent, items: MenuItem[]): void {
		menuPos = { x: e.clientX, y: e.clientY };
		menuItems = items;
		menuOpen = true;
	}

	function beginRename(node: TreeNode): void {
		renamingPath = node.path;
	}

	async function runTreeMutation(intent: TreeMutationIntent): Promise<void> {
		if (intent.kind === 'canvas') await api.renameCanvas(vaultId, intent.from, intent.to);
		else if (intent.kind === 'note') await api.renameNote(vaultId, intent.from, intent.to);
		else await api.renameFolder(vaultId, intent.from, intent.to);
	}

	async function commitRename(node: TreeNode, newName: string): Promise<void> {
		const intent = buildTreeRenameIntent(node, newName);
		if (!intent) {
			renamingPath = null;
			return;
		}
		renamingPath = null;
		try {
			await runTreeMutation(intent);
		} catch (e) {
			await alertDialog({ title: 'Could not rename item', message: (e as Error).message, tone: 'danger' });
		}
	}

	async function handleDropMove(srcPath: string, destFolder: string): Promise<void> {
		const intent = buildTreeDropMoveIntent(srcPath, destFolder);
		if (!intent) return;
		try {
			await runTreeMutation(intent);
		} catch (e) {
			await alertDialog({ title: 'Could not move item', message: (e as Error).message, tone: 'danger' });
		}
	}

	function onNodeContext(e: MouseEvent, node: TreeNode): void {
		const deps = { vaultId, beginRename };
		showMenu(e, node.type === 'file'
			? isCanvasTreeFile(node) ? canvasFileMenu(node, deps) : fileMenu(node, deps)
			: folderMenu(node, deps)
		);
	}

	function onRootContextFire(e: MouseEvent): void {
		showMenu(e, rootMenu({ vaultId, beginRename }));
	}

	function onFileClick(e: MouseEvent, node: TreeNode): void {
		if (renamingPath === node.path) return;
		e.preventDefault();
		const title = treeFileDisplayName(node);
		if (isCanvasTreeFile(node)) openCanvas(vaultId, node.path, title, openModeForPointer(e));
		else if (isMarkdownTreeFile(node)) openNote(vaultId, node.path, title, openModeForPointer(e));
	}

	onMount(() => {
		treePanel.hydrate();
		const offs = [
			onBus('note:rename-request', (e) => {
				if (e.vaultId !== vaultId) return;
				renamingPath = e.path;
			})
		];
		return () => offs.forEach((off) => off());
	});
</script>

<FileTreeToolbar
	{vaultId}
	sortMode={treePrefs.sortMode}
	autoReveal={treePrefs.autoReveal}
	{allCollapsed}
	onSortChange={(mode) => (treePrefs.sortMode = mode)}
	onToggleAutoReveal={() => (treePrefs.autoReveal = !treePrefs.autoReveal)}
	onToggleExpandAll={toggleExpandAll}
/>

<div
	class="wrap"
	role="presentation"
	oncontextmenu={(e) => {
		if ((e.target as HTMLElement).closest('.node')) return;
		e.preventDefault();
		onRootContextFire(e);
	}}
>
	<FileTree
		nodes={sortedTree}
		{vaultId}
		{activePath}
		expanded={treePanel.expanded}
		onToggleDir={toggleDir}
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
	.wrap { flex: 1; min-height: 0; overflow: hidden; padding: 10px; }
</style>
