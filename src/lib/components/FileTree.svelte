<script lang="ts" module>
	export interface TreeNode {
		name: string;
		path: string;
		type: 'file' | 'directory';
		fileKind?: 'markdown' | 'canvas';
		mtime?: number;
		ctime?: number;
		children?: TreeNode[];
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import {
		isCanvasTreeFile,
		treeFileDisplayName
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

	interface FlatRow {
		node: TreeNode;
		depth: number;
	}

	interface VisibleRow extends FlatRow {
		index: number;
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

	const ROW_HEIGHT = 26;
	const OVERSCAN = 12;
	const DEFAULT_VIEWPORT_HEIGHT = 520;

	let dragOverPath = $state<string | null>(null);
	let rootDragOver = $state(false);
	let scrollTop = $state(0);
	let viewportHeight = $state(0);
	let viewportEl = $state<HTMLDivElement | null>(null);

	const expand = $derived(expanded);
	const flatRows = $derived(flattenVisible(nodes, expand));
	const totalHeight = $derived(flatRows.length * ROW_HEIGHT);
	const measuredHeight = $derived(viewportHeight || DEFAULT_VIEWPORT_HEIGHT);
	const startIndex = $derived(Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN));
	const visibleCount = $derived(Math.ceil(measuredHeight / ROW_HEIGHT) + OVERSCAN * 2);
	const endIndex = $derived(Math.min(flatRows.length, startIndex + visibleCount));
	const visibleRows = $derived(
		flatRows.slice(startIndex, endIndex).map((row, offset): VisibleRow => ({
			...row,
			index: startIndex + offset
		}))
	);

	function flattenVisible(items: TreeNode[], opened: Set<string>, depth = 0, out: FlatRow[] = []): FlatRow[] {
		for (const node of items) {
			out.push({ node, depth });
			if (node.type === 'directory' && opened.has(node.path) && node.children?.length) {
				flattenVisible(node.children, opened, depth + 1, out);
			}
		}
		return out;
	}

	function focusOnMount(node: HTMLInputElement): void {
		requestAnimationFrame(() => {
			node.focus();
			node.select();
		});
	}

	function toggle(p: string): void {
		onToggleDir?.(p);
	}

	function isDescendant(parent: string, maybeChild: string): boolean {
		return maybeChild === parent || maybeChild.startsWith(parent + '/');
	}

	function handleDragStart(e: DragEvent, node: TreeNode): void {
		if (!e.dataTransfer) return;
		e.dataTransfer.setData('application/x-diamond-path', node.path);
		e.dataTransfer.setData('text/plain', node.path);
		e.dataTransfer.effectAllowed = 'move';
	}

	function handleDragOver(e: DragEvent, destNode: TreeNode): void {
		if (destNode.type !== 'directory') return;
		const src = e.dataTransfer?.getData('application/x-diamond-path');
		if (src && isDescendant(src, destNode.path)) return;
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
		if (isDescendant(src, destNode.path)) return;
		const srcParent = src.split('/').slice(0, -1).join('/');
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
		const srcParent = src.split('/').slice(0, -1).join('/');
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

	function renameKey(e: KeyboardEvent, node: TreeNode): void {
		const input = e.currentTarget as HTMLInputElement;
		if (e.key === 'Enter') {
			e.preventDefault();
			onRenameCommit?.(node, input.value.trim());
		} else if (e.key === 'Escape') {
			e.preventDefault();
			onRenameCancel?.();
		}
	}

	function initialRenameValue(node: TreeNode): string {
		if (node.type !== 'file') return node.name;
		return treeFileDisplayName(node);
	}

	function fileHref(node: TreeNode): string {
		if (isCanvasTreeFile(node)) return `/vault/${vaultId}/canvas/${encodeURI(node.path)}`;
		return `/vault/${vaultId}/note/${encodeURI(node.path)}`;
	}

	function fileLabel(node: TreeNode): string {
		return treeFileDisplayName(node);
	}

	function rowStyle(row: VisibleRow): string {
		return `--tree-depth: ${row.depth}; transform: translateY(${row.index * ROW_HEIGHT}px);`;
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
			{@const n = row.node}
			<li class="tree-row" style={rowStyle(row)}>
				{#if n.type === 'directory'}
					<div
						class="node dir"
						class:open={expand.has(n.path)}
						class:drop-target={dragOverPath === n.path}
						draggable={renamingPath !== n.path}
						role="treeitem"
						aria-level={row.depth + 1}
						aria-expanded={expand.has(n.path)}
						aria-selected={activePath === n.path}
						tabindex="-1"
						ondragstart={(e) => handleDragStart(e, n)}
						ondragover={(e) => handleDragOver(e, n)}
						ondragleave={() => handleDragLeave(n)}
						ondrop={(e) => handleDrop(e, n)}
						oncontextmenu={(e) => handleContext(e, n)}
					>
						<button class="dir-head" onclick={() => toggle(n.path)}>
							<span class="chev">{expand.has(n.path) ? '▾' : '▸'}</span>
							{#if renamingPath === n.path}
								<input
									class="rename-input"
									value={initialRenameValue(n)}
									use:focusOnMount
									onkeydown={(e) => renameKey(e, n)}
									onblur={(e) => onRenameCommit?.(n, (e.currentTarget as HTMLInputElement).value.trim())}
									onclick={(e) => e.stopPropagation()}
								/>
							{:else}
								<span class="name">{n.name}</span>
							{/if}
						</button>
					</div>
				{:else}
					<div
						class="node file"
						class:active={activePath === n.path}
						draggable={renamingPath !== n.path}
						role="treeitem"
						aria-level={row.depth + 1}
						aria-selected={activePath === n.path}
						tabindex="-1"
						ondragstart={(e) => handleDragStart(e, n)}
						oncontextmenu={(e) => handleContext(e, n)}
					>
						{#if renamingPath === n.path}
							<div class="file-row">
								<input
									class="rename-input"
									value={initialRenameValue(n)}
									use:focusOnMount
									onkeydown={(e) => renameKey(e, n)}
									onblur={(e) => onRenameCommit?.(n, (e.currentTarget as HTMLInputElement).value.trim())}
									onclick={(e) => e.stopPropagation()}
								/>
							</div>
						{:else}
							<a
								href={fileHref(n)}
								class="file-link"
								onclick={(e) => {
									if (onFileClick) { e.preventDefault(); onFileClick(e, n); }
								}}
								onauxclick={(e) => {
									if (e.button === 1 && onFileClick) { e.preventDefault(); onFileClick(e, n); }
								}}
							>
								{#if isCanvasTreeFile(n)}
									<span class="file-kind" aria-hidden="true">□</span>
								{/if}
								<span class="file-name">{fileLabel(n)}</span>
							</a>
						{/if}
					</div>
				{/if}
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

	.node {
		border-radius: 4px;
	}
	.node.drop-target { background: var(--accent-soft); outline: 1px dashed var(--accent); }

	.dir-head, .file-link {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		min-height: 26px;
		padding: 3px 6px 3px calc(6px + var(--tree-depth) * 14px);
		background: transparent;
		border: 1px solid transparent;
		border-radius: 4px;
		color: var(--fg);
		text-decoration: none;
		font: inherit;
		font-size: 0.85rem;
		cursor: pointer;
		text-align: left;
	}
	.dir-head:hover, .file-link:hover { background: var(--bg-hover); }
	.file.active .file-link { background: var(--bg-elev-2); color: var(--accent); border-color: var(--border); }

	.chev {
		width: 10px;
		flex: none;
		color: var(--fg-dim);
		font-size: 0.75rem;
	}
	.dir .name { color: var(--fg-muted); }
	.dir.open .name { color: var(--fg); }
	.file-name { color: inherit; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.file-kind { color: var(--fg-dim); font-family: var(--mono); font-size: 0.72rem; }

	.file-row {
		min-height: 26px;
		padding: 3px 6px 3px calc(22px + var(--tree-depth) * 14px);
	}
	.rename-input {
		width: 100%;
		background: var(--bg);
		border: 1px solid var(--accent);
		border-radius: 3px;
		color: var(--fg);
		padding: 1px 6px;
		font: inherit;
		font-size: 0.85rem;
	}
	.rename-input:focus { outline: none; box-shadow: 0 0 0 2px var(--accent-soft); }

	.node[draggable='true'] { cursor: grab; }
	.node[draggable='true']:active { cursor: grabbing; }
</style>
