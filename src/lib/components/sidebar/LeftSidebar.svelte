<script lang="ts">
	import type { TreeNode } from '$lib/types';
	import Wordmark from '$lib/components/Wordmark.svelte';
	import SidebarTools from './SidebarTools.svelte';
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
		<Wordmark size="xs" href="/" />
		<span class="vault-name">{vaultName}</span>
	</header>

	<SidebarTools {vaultId} />

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
		padding: 14px 16px 10px;
		display: flex; flex-direction: column; gap: 6px;
	}
	.vault-name {
		font-size: 0.78rem;
		color: var(--fg-muted);
		font-family: var(--mono);
		padding-left: 2px;
	}
	.foot {
		padding: 10px 14px;
		border-top: 1px solid var(--border);
		font-size: 0.8rem;
	}
	.switch { color: var(--fg-muted); text-decoration: none; }
	.switch:hover { color: var(--accent); }
</style>
