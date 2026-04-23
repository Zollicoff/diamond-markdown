<script lang="ts">
	export interface TreeNode {
		name: string;
		path: string;
		type: 'file' | 'directory';
		children?: TreeNode[];
	}

	interface Props {
		nodes: TreeNode[];
		vaultId: string;
		activePath?: string | null;
		/** Controlled set of expanded directory paths. */
		expanded?: Set<string>;
	}

	let {
		nodes,
		vaultId,
		activePath = null,
		expanded = new Set<string>()
	}: Props = $props();

	let expand = $state(expanded);

	function toggle(p: string): void {
		if (expand.has(p)) expand.delete(p);
		else expand.add(p);
		expand = new Set(expand); // trigger reactivity
	}
</script>

<ul class="tree">
	{#each nodes as n}
		{#if n.type === 'directory'}
			<li>
				<button class="dir" class:open={expand.has(n.path)} onclick={() => toggle(n.path)}>
					<span class="chev">{expand.has(n.path) ? '▾' : '▸'}</span>
					<span class="name">{n.name}</span>
				</button>
				{#if expand.has(n.path) && n.children && n.children.length > 0}
					<div class="nested">
						<svelte:self nodes={n.children} {vaultId} {activePath} {expanded} />
					</div>
				{/if}
			</li>
		{:else}
			<li>
				<a
					class="file"
					class:active={activePath === n.path}
					href={`/vault/${vaultId}/note/${encodeURI(n.path)}`}
				>
					<span class="file-name">{n.name.replace(/\.md$/, '')}</span>
				</a>
			</li>
		{/if}
	{/each}
</ul>

<style>
	.tree { list-style: none; padding: 0; margin: 0; }
	.tree li { margin: 0; }
	.nested { padding-left: 14px; border-left: 1px solid var(--border); margin-left: 8px; }

	.dir, .file {
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
	.dir:hover, .file:hover { background: var(--bg-hover); }
	.file.active { background: var(--bg-elev-2); color: var(--accent); border-color: var(--border); }
	.chev { width: 10px; color: var(--fg-dim); font-size: 0.75rem; }
	.dir .name { color: var(--fg-muted); }
	.dir.open .name { color: var(--fg); }
	.file-name { color: inherit; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
