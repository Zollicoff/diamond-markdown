<script lang="ts">
	import type { LayoutData } from './$types';
	import { page } from '$app/state';
	import FileTree, { type TreeNode } from '$lib/components/FileTree.svelte';
	import QuickSwitcher from '$lib/components/QuickSwitcher.svelte';

	let { data, children }: { data: LayoutData; children: () => unknown } = $props();

	let activePath = $derived<string | null>(
		page.params.path ? decodeURIComponent(page.params.path) : null
	);

	// Root-level dirs auto-expanded for nicer first load.
	let rootExpand = $derived(new Set(data.tree.filter((n) => n.type === 'directory').map((n) => n.path)));
</script>

<div class="shell">
	<aside class="sidebar">
		<header class="sidebar-head">
			<a class="brand" href="/">DiamondMD</a>
			<span class="vault-name">{data.vault.name}</span>
		</header>

		<div class="tree-wrap">
			<FileTree nodes={data.tree as TreeNode[]} vaultId={data.vault.id} {activePath} expanded={rootExpand} />
		</div>

		<footer class="sidebar-foot">
			<a href="/" class="switch">← Switch vault</a>
		</footer>
	</aside>

	<main class="content">
		{@render children()}
	</main>
</div>

<QuickSwitcher vaultId={data.vault.id} />

<style>
	.shell {
		display: grid;
		grid-template-columns: 280px 1fr;
		height: 100vh;
	}

	.sidebar {
		display: flex;
		flex-direction: column;
		background: var(--bg-elev);
		border-right: 1px solid var(--border);
		overflow: hidden;
	}
	.sidebar-head {
		padding: 14px 16px;
		border-bottom: 1px solid var(--border);
		display: flex; flex-direction: column; gap: 4px;
	}
	.brand {
		font-family: var(--serif);
		font-size: 1.4rem;
		color: var(--accent);
		letter-spacing: -0.01em;
		line-height: 1;
		text-decoration: none;
	}
	.vault-name {
		font-size: 0.78rem;
		color: var(--fg-muted);
		font-family: var(--mono);
	}

	.tree-wrap {
		flex: 1;
		overflow-y: auto;
		padding: 10px 10px;
	}

	.sidebar-foot {
		padding: 10px 14px;
		border-top: 1px solid var(--border);
		font-size: 0.8rem;
	}
	.switch { color: var(--fg-muted); text-decoration: none; }
	.switch:hover { color: var(--accent); }

	.content {
		overflow: hidden;
	}

	@media (max-width: 768px) {
		.shell { grid-template-columns: 220px 1fr; }
	}
</style>
