<script lang="ts">
	import type { TreeNode } from '$lib/types';
	import type { VisibleTreeRow } from '$lib/tree/view';
	import {
		canMutateTreeNode,
		isCanvasTreeFile,
		isUnsupportedTreeFile,
		treeFileDisplayName,
		treeFileHref,
		treeInitialRenameValue
	} from '$lib/tree/view';

	interface Props {
		row: VisibleTreeRow;
		vaultId: string;
		activePath?: string | null;
		expanded: Set<string>;
		renamingPath?: string | null;
		dragOverPath?: string | null;
		onToggleDir?: (path: string) => void;
		onDragStart: (e: DragEvent, node: TreeNode) => void;
		onDragOver: (e: DragEvent, node: TreeNode) => void;
		onDragLeave: (node: TreeNode) => void;
		onDrop: (e: DragEvent, node: TreeNode) => void;
		onContext: (e: MouseEvent, node: TreeNode) => void;
		onRenameCommit?: (node: TreeNode, newName: string) => void;
		onRenameCancel?: () => void;
		onFileClick?: (e: MouseEvent, node: TreeNode) => void;
	}

	let {
		row,
		vaultId,
		activePath = null,
		expanded,
		renamingPath = null,
		dragOverPath = null,
		onToggleDir,
		onDragStart,
		onDragOver,
		onDragLeave,
		onDrop,
		onContext,
		onRenameCommit,
		onRenameCancel,
		onFileClick
	}: Props = $props();

	const node = $derived(row.node);
	const isRenaming = $derived(renamingPath === node.path);
	const isOpen = $derived(expanded.has(node.path));
	const canMutate = $derived(canMutateTreeNode(node));
	const isUnsupportedFile = $derived(isUnsupportedTreeFile(node));

	function focusOnMount(input: HTMLInputElement): void {
		requestAnimationFrame(() => {
			input.focus();
			input.select();
		});
	}

	function commitRename(node: TreeNode, value: string): void {
		onRenameCommit?.(node, value.trim());
	}

	function renameKey(e: KeyboardEvent, node: TreeNode): void {
		const input = e.currentTarget as HTMLInputElement;
		if (e.key === 'Enter') {
			e.preventDefault();
			commitRename(node, input.value);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			onRenameCancel?.();
		}
	}

	function handleFileClick(e: MouseEvent, node: TreeNode): void {
		if (isUnsupportedTreeFile(node)) return;
		if (!onFileClick) return;
		e.preventDefault();
		onFileClick(e, node);
	}

	function handleAuxClick(e: MouseEvent, node: TreeNode): void {
		if (isUnsupportedTreeFile(node)) return;
		if (e.button !== 1 || !onFileClick) return;
		e.preventDefault();
		onFileClick(e, node);
	}
</script>

{#if node.type === 'directory'}
	<div
		class="node dir"
		class:open={isOpen}
		class:drop-target={dragOverPath === node.path}
		role="treeitem"
		aria-level={row.depth + 1}
		aria-expanded={isOpen}
		aria-selected={activePath === node.path}
		tabindex="-1"
		draggable={!isRenaming && canMutate}
		ondragstart={(e) => onDragStart(e, node)}
		ondragover={(e) => onDragOver(e, node)}
		ondragleave={() => onDragLeave(node)}
		ondrop={(e) => onDrop(e, node)}
		oncontextmenu={(e) => onContext(e, node)}
	>
		<button class="dir-head" onclick={() => onToggleDir?.(node.path)}>
			<span class="chev">{isOpen ? '▾' : '▸'}</span>
			{#if isRenaming}
				<input
					class="rename-input"
					value={treeInitialRenameValue(node)}
					use:focusOnMount
					onkeydown={(e) => renameKey(e, node)}
					onblur={(e) => commitRename(node, (e.currentTarget as HTMLInputElement).value)}
					onclick={(e) => e.stopPropagation()}
				/>
			{:else}
				<span class="name">{node.name}</span>
			{/if}
		</button>
	</div>
{:else}
	<div
		class="node file"
		class:active={activePath === node.path}
		draggable={!isRenaming && canMutate}
		role="treeitem"
		aria-level={row.depth + 1}
		aria-selected={activePath === node.path}
		tabindex="-1"
		ondragstart={(e) => onDragStart(e, node)}
		oncontextmenu={(e) => onContext(e, node)}
	>
		{#if isRenaming}
			<div class="file-row">
				<input
					class="rename-input"
					value={treeInitialRenameValue(node)}
					use:focusOnMount
					onkeydown={(e) => renameKey(e, node)}
					onblur={(e) => commitRename(node, (e.currentTarget as HTMLInputElement).value)}
					onclick={(e) => e.stopPropagation()}
				/>
			</div>
		{:else}
			<a
				href={treeFileHref(vaultId, node)}
				class="file-link"
				target={isUnsupportedFile ? '_blank' : undefined}
				rel={isUnsupportedFile ? 'noopener noreferrer' : undefined}
				onclick={(e) => handleFileClick(e, node)}
				onauxclick={(e) => handleAuxClick(e, node)}
			>
				{#if isCanvasTreeFile(node)}
					<span class="file-kind" aria-hidden="true">□</span>
				{:else if isUnsupportedFile}
					<span class="file-kind" aria-hidden="true">◇</span>
				{/if}
				<span class="file-name">{treeFileDisplayName(node)}</span>
			</a>
		{/if}
	</div>
{/if}

<style>
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
