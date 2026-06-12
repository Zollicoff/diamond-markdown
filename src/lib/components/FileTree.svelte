<script lang="ts">
	import { onMount } from 'svelte';
	import type { TreeNode } from '$lib/types';
	import FileTreeRow from './FileTreeRow.svelte';
	import {
		flattenVisibleTreeRows,
		treePathIsDescendant,
		treePathParent,
		treeRowStyle,
		visibleTreeWindow
	} from '$lib/tree/view';

	interface Props {
		nodes: TreeNode[];
		vaultId: string;
		activePath?: string | null;
		/** Controlled expand set - the parent owns the source of truth so
		 *  toolbar actions (expand-all / collapse-all / auto-reveal) can
		 *  drive it. Pair with onToggleDir to handle user clicks. */
		expanded?: Set<string>;
		onToggleDir?: (path: string) => void;
		/** Path currently being renamed, if any. */
		renamingPath?: string | null;
		onContext?: (e: MouseEvent, node: TreeNode) => void;
		onRootContext?: (e: MouseEvent) => void;
		onDropMove?: (src: string, destFolder: string) => void;
		onRenameCommit?: (node: TreeNode, newName: string) => void;
		onRenameCancel?: () => void;
		onFileClick?: (e: MouseEvent, node: TreeNode) => void;
	}

	let {
		nodes,
		vaultId,
		activePath = null,
		expanded = new Set<string>(),
		onToggleDir,
		renamingPath = null,
		onContext,
		onRootContext,
		onDropMove,
		onRenameCommit,
		onRenameCancel,
		onFileClick
	}: Props = $props();

	let dragOverPath = $state<string | null>(null);
	let rootDragOver = $state(false);
	let scrollTop = $state(0);
	let viewportHeight = $state(0);
	let viewportEl = $state<HTMLDivElement | null>(null);

	const expand = $derived(expanded);
	const flatRows = $derived(flattenVisibleTreeRows(nodes, expand));
	const treeWindow = $derived(visibleTreeWindow(flatRows, scrollTop, viewportHeight));
	const totalHeight = $derived(treeWindow.totalHeight);
	const visibleRows = $derived(treeWindow.visibleRows);

	function handleDragStart(e: DragEvent, node: TreeNode): void {
		if (!e.dataTransfer) return;
		e.dataTransfer.setData('application/x-diamond-path', node.path);
		e.dataTransfer.setData('text/plain', node.path);
		e.dataTransfer.effectAllowed = 'move';
	}

	function handleDragOver(e: DragEvent, destNode: TreeNode): void {
		if (destNode.type !== 'directory') return;
		const src = e.dataTransfer?.getData('application/x-diamond-path');
		if (src && treePathIsDescendant(src, destNode.path)) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dragOverPath = destNode.path;
	}

	function handleDragLeave(destNode: TreeNode): void {
		if (dragOverPath === destNode.path) dragOverPath = null;
	}

	function handleDrop(e: DragEvent, destNode: TreeNode): void {
		e.preventDefault();
		dragOverPath = null;
		if (destNode.type !== 'directory') return;
		const src = e.dataTransfer?.getData('application/x-diamond-path');
		if (!src) return;
		if (treePathIsDescendant(src, destNode.path)) return;
		const srcParent = treePathParent(src);
		if (srcParent === destNode.path) return;
		onDropMove?.(src, destNode.path);
	}

	function handleRootDragOver(e: DragEvent): void {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		rootDragOver = true;
	}

	function handleRootDrop(e: DragEvent): void {
		rootDragOver = false;
		const src = e.dataTransfer?.getData('application/x-diamond-path');
		if (!src) return;
		const srcParent = treePathParent(src);
		if (srcParent === '') return;
		onDropMove?.(src, '');
	}

	function handleContext(e: MouseEvent, node: TreeNode): void {
		e.preventDefault();
		e.stopPropagation();
		onContext?.(e, node);
	}

	function handleRootContext(e: MouseEvent): void {
		if ((e.target as HTMLElement).closest('.node')) return;
		e.preventDefault();
		onRootContext?.(e);
	}

	function updateViewportHeight(): void {
		viewportHeight = viewportEl?.clientHeight ?? 0;
	}

	onMount(() => {
		updateViewportHeight();
		const ro = typeof ResizeObserver !== 'undefined' && viewportEl
			? new ResizeObserver(updateViewportHeight)
			: null;
		if (ro && viewportEl) ro.observe(viewportEl);
		return () => ro?.disconnect();
	});
</script>

<div
	bind:this={viewportEl}
	class="tree-viewport"
	class:root-drag={rootDragOver}
	role="presentation"
	onscroll={(e) => (scrollTop = (e.currentTarget as HTMLDivElement).scrollTop)}
	ondragover={handleRootDragOver}
	ondragleave={() => (rootDragOver = false)}
	ondrop={handleRootDrop}
	oncontextmenu={handleRootContext}
>
	<ul class="tree" role="tree" style={`height: ${totalHeight}px;`}>
		{#each visibleRows as row (row.node.path)}
			<li class="tree-row" style={treeRowStyle(row)}>
				<FileTreeRow
					{row}
					{vaultId}
					{activePath}
					expanded={expand}
					{renamingPath}
					{dragOverPath}
					{onToggleDir}
					onDragStart={handleDragStart}
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					onDrop={handleDrop}
					onContext={handleContext}
					{onRenameCommit}
					{onRenameCancel}
					{onFileClick}
				/>
			</li>
		{/each}
	</ul>
</div>

<style>
	.tree-viewport {
		height: 100%;
		min-height: 0;
		overflow-y: auto;
		border-radius: 6px;
	}
	.tree-viewport.root-drag { outline: 2px dashed var(--accent); outline-offset: -2px; }
	.tree {
		position: relative;
		list-style: none;
		padding: 0;
		margin: 0;
		min-height: 40px;
		border-radius: 6px;
	}
	.tree-row {
		position: absolute;
		inset: 0 0 auto 0;
		height: 26px;
		margin: 0;
	}
</style>
