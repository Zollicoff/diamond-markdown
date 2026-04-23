<script lang="ts" module>
	export interface TreeNode {
		name: string;
		path: string;
		type: 'file' | 'directory';
		children?: TreeNode[];
	}
</script>

<script lang="ts">
	interface Props {
		nodes: TreeNode[];
		vaultId: string;
		activePath?: string | null;
		expanded?: Set<string>;
		/** Path currently being renamed, if any. */
		renamingPath?: string | null;
		onContext?: (e: MouseEvent, node: TreeNode) => void;
		onRootContext?: (e: MouseEvent) => void;
		onDropMove?: (src: string, destFolder: string) => void;
		onRenameCommit?: (node: TreeNode, newName: string) => void;
		onRenameCancel?: () => void;
	}

	let {
		nodes,
		vaultId,
		activePath = null,
		expanded = new Set<string>(),
		renamingPath = null,
		onContext,
		onRootContext,
		onDropMove,
		onRenameCommit,
		onRenameCancel
	}: Props = $props();

	let expand = $state(expanded);
	let dragOverPath = $state<string | null>(null);
	let rootDragOver = $state(false);

	function toggle(p: string): void {
		if (expand.has(p)) expand.delete(p);
		else expand.add(p);
		expand = new Set(expand);
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
		if (src && isDescendant(src, destNode.path)) return; // can't drop into self/descendant
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
		// Already in this folder? no-op.
		const srcParent = src.split('/').slice(0, -1).join('/');
		if (srcParent === destNode.path) return;
		onDropMove?.(src, destNode.path);
	}

	function handleContext(e: MouseEvent, node: TreeNode): void {
		e.preventDefault();
		e.stopPropagation();
		onContext?.(e, node);
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
		return node.type === 'file' ? node.name.replace(/\.md$/, '') : node.name;
	}
</script>

<ul
	class="tree"
	class:root-drag={rootDragOver}
	ondragover={(e) => {
		const src = e.dataTransfer?.getData('application/x-diamond-path');
		if (!src || src.includes('/')) { /* only top-level drops accepted at root for now */ }
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		rootDragOver = true;
	}}
	ondragleave={() => (rootDragOver = false)}
	ondrop={(e) => {
		rootDragOver = false;
		const src = e.dataTransfer?.getData('application/x-diamond-path');
		if (!src) return;
		// Drop at root = move to vault root
		const srcParent = src.split('/').slice(0, -1).join('/');
		if (srcParent === '') return; // already at root
		onDropMove?.(src, '');
	}}
	oncontextmenu={(e) => {
		// Ignore context fired from deeper nodes; those handle their own.
		if ((e.target as HTMLElement).closest('.node')) return;
		e.preventDefault();
		onRootContext?.(e);
	}}
>
	{#each nodes as n}
		{#if n.type === 'directory'}
			<li>
				<div
					class="node dir"
					class:open={expand.has(n.path)}
					class:drop-target={dragOverPath === n.path}
					draggable={renamingPath !== n.path}
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
								autofocus
								onkeydown={(e) => renameKey(e, n)}
								onblur={(e) => onRenameCommit?.(n, (e.currentTarget as HTMLInputElement).value.trim())}
								onclick={(e) => e.stopPropagation()}
							/>
						{:else}
							<span class="name">{n.name}</span>
						{/if}
					</button>
				</div>
				{#if expand.has(n.path) && n.children && n.children.length > 0}
					<div class="nested">
						<svelte:self
							nodes={n.children}
							{vaultId}
							{activePath}
							{expanded}
							{renamingPath}
							{onContext}
							{onRootContext}
							{onDropMove}
							{onRenameCommit}
							{onRenameCancel}
						/>
					</div>
				{/if}
			</li>
		{:else}
			<li>
				<div
					class="node file"
					class:active={activePath === n.path}
					draggable={renamingPath !== n.path}
					ondragstart={(e) => handleDragStart(e, n)}
					oncontextmenu={(e) => handleContext(e, n)}
				>
					{#if renamingPath === n.path}
						<div class="file-row">
							<input
								class="rename-input"
								value={initialRenameValue(n)}
								autofocus
								onkeydown={(e) => renameKey(e, n)}
								onblur={(e) => onRenameCommit?.(n, (e.currentTarget as HTMLInputElement).value.trim())}
								onclick={(e) => e.stopPropagation()}
							/>
						</div>
					{:else}
						<a
							href={`/vault/${vaultId}/note/${encodeURI(n.path)}`}
							class="file-link"
						>
							<span class="file-name">{n.name.replace(/\.md$/, '')}</span>
						</a>
					{/if}
				</div>
			</li>
		{/if}
	{/each}
</ul>

<style>
	.tree { list-style: none; padding: 0; margin: 0; min-height: 40px; border-radius: 6px; }
	.tree.root-drag { outline: 2px dashed var(--accent); outline-offset: 2px; }
	.tree li { margin: 0; }
	.nested { padding-left: 14px; border-left: 1px solid var(--border); margin-left: 8px; }

	.node {
		border-radius: 4px;
	}
	.node.drop-target { background: var(--accent-soft); outline: 1px dashed var(--accent); }

	.dir-head, .file-link {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		padding: 3px 6px;
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

	.chev { width: 10px; color: var(--fg-dim); font-size: 0.75rem; }
	.dir .name { color: var(--fg-muted); }
	.dir.open .name { color: var(--fg); }
	.file-name { color: inherit; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

	.file-row { padding: 3px 6px 3px 22px; }
	.rename-input {
		flex: 1;
		background: var(--bg);
		border: 1px solid var(--accent);
		border-radius: 3px;
		color: var(--fg);
		padding: 1px 6px;
		font: inherit;
		font-size: 0.85rem;
	}
	.rename-input:focus { outline: none; box-shadow: 0 0 0 2px var(--accent-soft); }

	/* Drag image polish */
	.node[draggable='true'] { cursor: grab; }
	.node[draggable='true']:active { cursor: grabbing; }
</style>
