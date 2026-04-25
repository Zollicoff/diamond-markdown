<script lang="ts">
	import { onMount } from 'svelte';
	import type { LayoutData } from './$types';
	import LeftSidebar from '$lib/components/sidebar/LeftSidebar.svelte';
	import RightPanel from '$lib/components/rightpanel/RightPanel.svelte';
	import CollapseToggle from '$lib/components/CollapseToggle.svelte';
	import Workspace from '$lib/components/workspace/Workspace.svelte';
	import QuickSwitcher from '$lib/components/QuickSwitcher.svelte';
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import HistoryViewer from '$lib/components/HistoryViewer.svelte';
	import { hydrate as hydrateWorkspace, workspace } from '$lib/workspace/store.svelte';
	import { bindVaultEvents, toggleLeftSidebar, toggleRightSidebar, activePane, activeTab } from '$lib/workspace/actions';
	import { registerBuiltinCommands } from '$lib/commands';
	import { installGlobalKeymap } from '$lib/commands/keymap';
	import { on as onBus } from '$lib/events';
	import { hydrate as hydrateBookmarks, rename as renameBookmark, deleted as deleteBookmark } from '$lib/bookmarks.svelte';
	import type { NoteDoc } from '$lib/types';
	import type { TreeNode } from '$lib/types';

	let { data, children }: { data: LayoutData; children: () => unknown } = $props();

	// Boot: hydrate workspace, wire event listeners, register commands.
	hydrateWorkspace(data.vault.id);
	hydrateBookmarks(data.vault.id);
	registerBuiltinCommands();

	let tree = $state<TreeNode[]>(data.tree);
	let activeDoc = $state<NoteDoc | null>(null);

	$effect(() => {
		// Keep the tree prop synced when data reloads.
		tree = data.tree;
	});

	onMount(() => {
		const offs = [
			bindVaultEvents(data.vault.id),
			onBus('tree:invalidate', async (e) => {
				if (e.vaultId !== data.vault.id) return;
				try {
					const res = await fetch(`/api/vaults/${data.vault.id}/tree`);
					if (res.ok) tree = (await res.json()).tree;
				} catch { /* ignore */ }
			}),
			onBus('note:renamed', (e) => {
				if (e.vaultId !== data.vault.id) return;
				renameBookmark(data.vault.id, e.from, e.to);
			}),
			onBus('folder:renamed', (e) => {
				if (e.vaultId !== data.vault.id) return;
				renameBookmark(data.vault.id, e.from, e.to);
			}),
			onBus('note:deleted', (e) => {
				if (e.vaultId !== data.vault.id) return;
				deleteBookmark(data.vault.id, e.path);
			}),
			onBus('folder:deleted', (e) => {
				if (e.vaultId !== data.vault.id) return;
				deleteBookmark(data.vault.id, e.path);
			}),
			installGlobalKeymap(() => {
				const pane = activePane();
				const tab = activeTab();
				return {
					vaultId: data.vault.id,
					paneId: pane?.id,
					tabId: tab?.id,
					notePath: tab?.kind === 'note' ? tab.path : undefined
				};
			})
		];
		return () => offs.forEach((off) => off?.());
	});

	function onDocLoaded(doc: NoteDoc): void {
		activeDoc = doc;
	}

	// State → URL sync: keep the URL pointed at whatever note is active in
	// the active pane, without polluting browser history. Clicks that need
	// real history entries can call goto() — those flow through +page.svelte
	// which re-runs this effect at a stable URL.
	$effect(() => {
		if (typeof window === 'undefined') return;
		const pane = workspace.panes[workspace.activePaneId];
		if (!pane) return;
		const tab = pane.tabs.find((t) => t.id === pane.activeTabId);
		if (!tab) return;
		let desired: string | null = null;
		if (tab.kind === 'note') desired = `/vault/${data.vault.id}/note/${encodeURI(tab.path)}`;
		if (!desired) return;
		const current = window.location.pathname;
		if (current === desired) return;
		try {
			window.history.replaceState(window.history.state, '', desired + window.location.search + window.location.hash);
		} catch { /* ignore — third-party iframes etc. */ }
	});
</script>

<div
	class="shell"
	class:left-collapsed={workspace.leftSidebarCollapsed}
	class:right-collapsed={workspace.rightSidebarCollapsed}
>
	<!-- Always 5 grid slots. Collapse happens via CSS width:0 + overflow:hidden
	     so slot positions stay stable; no #if here or the grid shifts. -->
	<div class="col left-col">
		<LeftSidebar vaultId={data.vault.id} vaultName={data.vault.name} {tree} />
	</div>

	<div class="collapse-rail left-rail">
		<CollapseToggle
			side="left"
			collapsed={workspace.leftSidebarCollapsed}
			onToggle={() => toggleLeftSidebar(data.vault.id)}
		/>
	</div>

	<main class="center">
		<Workspace vaultId={data.vault.id} {onDocLoaded} />
		{@render children()}
	</main>

	<div class="collapse-rail right-rail">
		<CollapseToggle
			side="right"
			collapsed={workspace.rightSidebarCollapsed}
			onToggle={() => toggleRightSidebar(data.vault.id)}
		/>
	</div>

	<div class="col right-col">
		<RightPanel vaultId={data.vault.id} doc={activeDoc} />
	</div>
</div>

<QuickSwitcher vaultId={data.vault.id} />
<CommandPalette vaultId={data.vault.id} />
<HistoryViewer vaultId={data.vault.id} />

<style>
	.shell {
		display: grid;
		grid-template-columns: 280px 22px 1fr 22px 300px;
		height: 100vh;
		min-height: 0;
		transition: grid-template-columns 0.18s cubic-bezier(0.22, 0.61, 0.36, 1);
	}
	.shell.left-collapsed  { grid-template-columns: 0 22px 1fr 22px 300px; }
	.shell.right-collapsed { grid-template-columns: 280px 22px 1fr 22px 0; }
	.shell.left-collapsed.right-collapsed { grid-template-columns: 0 22px 1fr 22px 0; }

	.col { min-width: 0; min-height: 0; overflow: hidden; }
	/* When width reaches 0 via the grid template, the inner sidebar is
	   clipped. No flash of half-visible content. */
	.shell.left-collapsed .left-col,
	.shell.right-collapsed .right-col {
		visibility: hidden;
	}

	.collapse-rail {
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 14px;
		background: var(--bg-elev);
		border-left: 1px solid var(--border);
		border-right: 1px solid var(--border);
	}
	.left-rail { border-left: 0; }
	.right-rail { border-right: 0; }

	.center {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
	}
	.center > :global(.workspace) { flex: 1; min-height: 0; }

	@media (max-width: 900px) {
		.shell { grid-template-columns: 240px 22px 1fr 22px 280px; }
	}

	/* Phones: widen rails for touch, tighten expanded sidebars. */
	@media (max-width: 640px) {
		.shell { grid-template-columns: 72vw 40px 1fr 40px 80vw; }
		.shell.left-collapsed  { grid-template-columns: 0 40px 1fr 40px 80vw; }
		.shell.right-collapsed { grid-template-columns: 72vw 40px 1fr 40px 0; }
		.shell.left-collapsed.right-collapsed { grid-template-columns: 0 40px 1fr 40px 0; }
		.collapse-rail { padding-top: 10px; }
	}
</style>
