<script lang="ts">
	import { onMount } from 'svelte';
	import type { TreeNode } from '$lib/types';
	import FileTree from '$lib/components/FileTree.svelte';
	import ContextMenu, { type MenuItem, type Position } from '$lib/components/ContextMenu.svelte';
	import FileTreeToolbar from './FileTreeToolbar.svelte';
	import { api } from '$lib/vault-api';
	import { openCanvas, openNote } from '$lib/workspace/actions';
	import { canvasFileMenu, fileMenu, folderMenu, rootMenu } from './menu-builders';
	import type { OpenMode } from '$lib/workspace/types';
	import { on as onBus } from '$lib/events';
	import { workspace } from '$lib/workspace/store.svelte';
	import { alertDialog } from '$lib/dialogs';
	import {
		collectDirectoryPaths,
		isCanvasTreeFile,
		isMarkdownTreeFile,
		isTreeSortMode,
		renamedTreeNodePath,
		revealParentDirectories,
		sortTreeNodes,
		treeFileDisplayName,
		topLevelDirectoryPaths,
		type TreeSortMode
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
	let sortMode = $state<TreeSortMode>('name-asc');
	let autoReveal = $state(false);

	let expand = $state<Set<string>>(new Set());
	let toolbarHydrated = false;

	const prefsKey = $derived(`diamond.tree-prefs.${vaultId}`);
	const expandKey = $derived(`diamond.tree-expand.${vaultId}`);

	function hydratePrefs(): void {
		if (typeof localStorage === 'undefined') return;
		try {
			const raw = localStorage.getItem(prefsKey);
			if (raw) {
				const v = JSON.parse(raw) as { sortMode?: unknown; autoReveal?: boolean };
				if (isTreeSortMode(v.sortMode)) sortMode = v.sortMode;
				if (typeof v.autoReveal === 'boolean') autoReveal = v.autoReveal;
			}
			const ex = localStorage.getItem(expandKey);
			if (ex) {
				const arr = JSON.parse(ex) as string[];
				if (Array.isArray(arr)) expand = new Set(arr);
			} else {
				// Default: expand all top-level folders on first visit.
				expand = topLevelDirectoryPaths(tree);
			}
		} catch { /* corrupt — fall through to defaults */ }
	}

	$effect(() => {
		const snap = { sortMode, autoReveal };
		if (!toolbarHydrated || typeof localStorage === 'undefined') return;
		try { localStorage.setItem(prefsKey, JSON.stringify(snap)); } catch { /* quota */ }
	});
	$effect(() => {
		if (!toolbarHydrated || typeof localStorage === 'undefined') return;
		try { localStorage.setItem(expandKey, JSON.stringify([...expand])); } catch { /* quota */ }
	});

	const sortedTree = $derived(sortTreeNodes(tree, sortMode));

	// --- Expand / collapse helpers -----------------------------------
	const allDirPaths = $derived(collectDirectoryPaths(tree));
	const allCollapsed = $derived(expand.size === 0);

	function toggleDir(p: string): void {
		const next = new Set(expand);
		if (next.has(p)) next.delete(p);
		else next.add(p);
		expand = next;
	}

	function expandAll(): void { expand = new Set(allDirPaths); }
	function collapseAll(): void { expand = new Set(); }
	function toggleExpandAll(): void { allCollapsed ? expandAll() : collapseAll(); }

	// --- Highlight + auto-reveal -------------------------------------
	const activePath = $derived.by<string | null>(() => {
		const pane = workspace.panes[workspace.activePaneId];
		if (!pane) return null;
		const tab = pane.tabs.find((t) => t.id === pane.activeTabId);
		return tab?.kind === 'note' || tab?.kind === 'canvas' ? tab.path : null;
	});

	$effect(() => {
		if (!autoReveal || !activePath) return;
		// Expand every parent folder of the active note path.
		const next = revealParentDirectories(expand, activePath);
		if (next !== expand) expand = next;
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

	async function commitRename(node: TreeNode, newName: string): Promise<void> {
		const currentName = node.type === 'file' ? treeFileDisplayName(node) : node.name;
		if (!newName || newName === currentName || newName === node.name) {
			renamingPath = null;
			return;
		}
		const newPath = renamedTreeNodePath(node, newName);
		renamingPath = null;
		try {
			if (isCanvasTreeFile(node)) await api.renameCanvas(vaultId, node.path, newPath);
			else if (node.type === 'file') await api.renameNote(vaultId, node.path, newPath);
			else await api.renameFolder(vaultId, node.path, newPath);
		} catch (e) {
			await alertDialog({ title: 'Could not rename item', message: (e as Error).message, tone: 'danger' });
		}
	}

	async function handleDropMove(srcPath: string, destFolder: string): Promise<void> {
		const isMarkdown = /\.(md|markdown)$/i.test(srcPath);
		const isCanvas = /\.canvas$/i.test(srcPath);
		const isFolder = !isMarkdown && !isCanvas;
		const name = srcPath.split('/').pop()!;
		const newPath = destFolder ? `${destFolder}/${name}` : name;
		if (newPath === srcPath) return;
		try {
			if (isFolder) await api.renameFolder(vaultId, srcPath, newPath);
			else if (isCanvas) await api.renameCanvas(vaultId, srcPath, newPath);
			else await api.renameNote(vaultId, srcPath, newPath);
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

	function modeFor(e: MouseEvent): OpenMode {
		if (e.button === 1) return 'new-tab';
		if (e.metaKey || e.ctrlKey) return 'new-tab';
		if (e.altKey) return 'new-pane';
		return 'replace';
	}

	function onFileClick(e: MouseEvent, node: TreeNode): void {
		if (renamingPath === node.path) return;
		e.preventDefault();
		const title = treeFileDisplayName(node);
		if (isCanvasTreeFile(node)) openCanvas(vaultId, node.path, title, modeFor(e));
		else if (isMarkdownTreeFile(node)) openNote(vaultId, node.path, title, modeFor(e));
	}

	onMount(() => {
		hydratePrefs();
		toolbarHydrated = true;
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
	{sortMode}
	{autoReveal}
	{allCollapsed}
	onSortChange={(mode) => (sortMode = mode)}
	onToggleAutoReveal={() => (autoReveal = !autoReveal)}
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
		expanded={expand}
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
