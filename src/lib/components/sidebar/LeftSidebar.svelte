<script lang="ts">
	import type { TreeNode } from '$lib/types';
	import FileTreePanel from './FileTreePanel.svelte';
	import BookmarksPanel from './BookmarksPanel.svelte';
	import RecentNotesPanel from './RecentNotesPanel.svelte';

	interface Props {
		vaultId: string;
		vaultName: string;
		tree: TreeNode[];
	}

	let { vaultId, vaultName, tree }: Props = $props();
</script>

<aside class="sidebar">
	<header class="head">
		<span class="vault-label">Vault:</span>
		<span class="vault-name" title={vaultName}>{vaultName}</span>
	</header>

	<BookmarksPanel {vaultId} />
	<RecentNotesPanel {vaultId} />

	<FileTreePanel {vaultId} {tree} />

	<footer class="foot">
		<a href="/" class="switch">← Switch vault</a>
	</footer>
</aside>

<style>
	.sidebar {
		display: flex;
		flex-direction: column;
		background: var(--bg-elev);
		border-right: 1px solid var(--border);
		overflow: hidden;
		height: 100%;
	}
	.head {
		padding: 12px 16px 10px;
		display: flex;
		align-items: baseline;
		gap: 6px;
		min-width: 0;
	}
	.vault-label {
		font-size: 0.74rem;
		color: var(--fg-dim);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		flex: none;
	}
	.vault-name {
		font-size: 0.84rem;
		color: var(--fg);
		font-family: var(--mono);
		font-weight: 500;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.foot {
		padding: 10px 14px;
		border-top: 1px solid var(--border);
		font-size: 0.8rem;
	}
	.switch { color: var(--fg-muted); text-decoration: none; }
	.switch:hover { color: var(--accent); }
</style>
