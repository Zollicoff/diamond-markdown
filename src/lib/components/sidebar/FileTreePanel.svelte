<script lang="ts">
	import { onMount } from 'svelte';
	import type { TreeNode } from '$lib/types';
	import FileTree from '$lib/components/FileTree.svelte';
	import ContextMenu, { type MenuItem, type Position } from '$lib/components/ContextMenu.svelte';
	import { api } from '$lib/vault-api';
	import { exec } from '$lib/commands';
	import { openCanvas, openNote } from '$lib/workspace/actions';
	import { canvasFileMenu, fileMenu, folderMenu, rootMenu } from './menu-builders';
	import type { OpenMode } from '$lib/workspace/types';
	import { on as onBus } from '$lib/events';
	import { workspace } from '$lib/workspace/store.svelte';
	import { alertDialog } from '$lib/dialogs';
	import {
		TREE_SORT_LABELS,
		collectDirectoryPaths,
		isCanvasTreeFile,
		isMarkdownTreeFile,
		isTreeSortMode,
		revealParentDirectories,
		sortMenuPositionFromRect,
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
	let sortMenuOpen = $state(false);

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

	function setSort(m: TreeSortMode): void {
		sortMode = m;
		sortMenuOpen = false;
	}

	let sortBtnEl: HTMLButtonElement | null = $state(null);
	let sortMenuPos = $state<{ top: number; left: number }>({ top: 0, left: 0 });

	function openSortMenu(): void {
		if (sortBtnEl) {
			const r = sortBtnEl.getBoundingClientRect();
			// Drop down from button, right-align with the button so the menu
			// (min-width 220px) extends leftward into the sidebar instead of
			// off-screen / into the editor pane.
			sortMenuPos = sortMenuPositionFromRect(r);
		}
		sortMenuOpen = !sortMenuOpen;
	}

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
		if (isCanvasTreeFile(node)) {
			renamingPath = null;
			await alertDialog({
				title: 'Canvas rename is not available yet',
				message: 'Canvas files open read-only in this build. Rename support will land with the general file-ops slice.'
			});
			return;
		}
		const parent = node.path.split('/').slice(0, -1).join('/');
		const newPath = (parent ? `${parent}/` : '') + (node.type === 'file' ? `${newName}.md` : newName);
		renamingPath = null;
		try {
			if (node.type === 'file') await api.renameNote(vaultId, node.path, newPath);
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
		if (isCanvas) {
			await alertDialog({
				title: 'Canvas move is not available yet',
				message: 'Canvas files open read-only in this build. Move support will land with the general file-ops slice.'
			});
			return;
		}
		try {
			if (isFolder) await api.renameFolder(vaultId, srcPath, newPath);
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
		// Close sort menu on outside click.
		const onDocClick = (e: MouseEvent) => {
			if (!sortMenuOpen) return;
			const target = e.target as HTMLElement | null;
			if (target?.closest('.sort-menu, .toolbar-btn.sort')) return;
			sortMenuOpen = false;
		};
		window.addEventListener('click', onDocClick);
		return () => {
			offs.forEach((off) => off());
			window.removeEventListener('click', onDocClick);
		};
	});
</script>

<header class="ft-toolbar" aria-label="File tree controls">
	<button class="toolbar-btn" onclick={() => exec('note.create', { vaultId })} title="New note" aria-label="New note">
		<svg viewBox="0 0 16 16" aria-hidden="true">
			<path d="M9 2 H4 a1 1 0 0 0 -1 1 V13 a1 1 0 0 0 1 1 H12 a1 1 0 0 0 1 -1 V6" />
			<path d="M9 2 L13 6" />
			<path d="M9 2 V6 H13" />
			<path d="M6 9 H10 M8 8 V11" stroke-width="1.4" />
		</svg>
	</button>
	<button class="toolbar-btn" onclick={() => exec('folder.create', { vaultId })} title="New folder" aria-label="New folder">
		<svg viewBox="0 0 16 16" aria-hidden="true">
			<path d="M2 5 a1 1 0 0 1 1 -1 H6.5 L8 5.5 H13 a1 1 0 0 1 1 1 V12 a1 1 0 0 1 -1 1 H3 a1 1 0 0 1 -1 -1 Z" />
			<path d="M6 9 H10 M8 7.5 V10.5" stroke-width="1.4" />
		</svg>
	</button>
	<span class="ft-spacer"></span>
	<div class="sort-wrap">
		<button
			bind:this={sortBtnEl}
			class="toolbar-btn sort"
			onclick={openSortMenu}
			title="Sort: {TREE_SORT_LABELS[sortMode]}"
			aria-label="Change sort order"
			aria-haspopup="menu"
			aria-expanded={sortMenuOpen}
		>
			<svg viewBox="0 0 16 16" aria-hidden="true">
				<path d="M4 3 V13 M2 11 L4 13 L6 11" />
				<path d="M9 4 H14 M9 8 H12 M9 12 H10" />
			</svg>
		</button>
		{#if sortMenuOpen}
			<menu class="sort-menu" role="menu" style="top: {sortMenuPos.top}px; left: {sortMenuPos.left}px;">
				{#each (Object.keys(TREE_SORT_LABELS) as TreeSortMode[]) as m (m)}
					<button
						class="sort-item"
						class:active={m === sortMode}
						role="menuitemradio"
						aria-checked={m === sortMode}
						onclick={() => setSort(m)}
					>
						<span class="check">{m === sortMode ? '✓' : ''}</span>
						{TREE_SORT_LABELS[m]}
					</button>
				{/each}
			</menu>
		{/if}
	</div>
	<button
		class="toolbar-btn"
		class:active={autoReveal}
		onclick={() => (autoReveal = !autoReveal)}
		title="Auto-reveal current file"
		aria-label="Auto-reveal current file"
		aria-pressed={autoReveal}
	>
		<svg viewBox="0 0 16 16" aria-hidden="true">
			<path d="M2 8 C 4 4 7 4 8 4 S 12 4 14 8 S 12 12 8 12 S 4 12 2 8 Z" />
			<circle cx="8" cy="8" r="2" class="solid" />
		</svg>
	</button>
	<button
		class="toolbar-btn"
		onclick={toggleExpandAll}
		title={allCollapsed ? 'Expand all' : 'Collapse all'}
		aria-label={allCollapsed ? 'Expand all' : 'Collapse all'}
	>
		{#if allCollapsed}
			<svg viewBox="0 0 16 16" aria-hidden="true">
				<path d="M3 6 L8 11 L13 6" />
			</svg>
		{:else}
			<svg viewBox="0 0 16 16" aria-hidden="true">
				<path d="M3 10 L8 5 L13 10" />
			</svg>
		{/if}
	</button>
</header>

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
	.ft-toolbar {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 4px 8px;
		border-bottom: 1px solid var(--border);
	}
	.ft-spacer { flex: 1; }
	.toolbar-btn {
		background: transparent;
		border: 0;
		color: var(--fg-muted);
		width: 26px;
		height: 26px;
		border-radius: 4px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		position: relative;
	}
	.toolbar-btn:hover { color: var(--fg); background: var(--bg-hover); }
	.toolbar-btn.active { color: var(--accent); }
	.toolbar-btn svg {
		width: 14px;
		height: 14px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.toolbar-btn svg .solid {
		fill: currentColor;
		stroke: none;
	}

	.sort-wrap { position: relative; }
	.sort-menu {
		/* Fixed (not absolute): the sidebar grid column has overflow:hidden,
		   which would clip an absolute child. Fixed lifts the menu out of
		   that clip and into the viewport stacking context, so it can land
		   visually on top of the editor pane. Position is set inline by JS
		   from the sort button's bounding rect. */
		position: fixed;
		min-width: 220px;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		border-radius: 6px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
		padding: 4px;
		margin: 0;
		z-index: 1000;
		display: flex;
		flex-direction: column;
		list-style: none;
	}
	.sort-item {
		display: flex;
		align-items: center;
		gap: 6px;
		background: transparent;
		border: 0;
		color: var(--fg);
		font: inherit;
		font-size: 0.82rem;
		padding: 6px 10px;
		border-radius: 4px;
		cursor: pointer;
		text-align: left;
		white-space: nowrap;
	}
	.sort-item:hover { background: var(--bg-hover); }
	.sort-item.active { color: var(--accent); }
	.sort-item .check {
		width: 12px;
		display: inline-block;
		text-align: center;
		font-size: 0.78rem;
	}

	.wrap { flex: 1; min-height: 0; overflow: hidden; padding: 10px; }
</style>
