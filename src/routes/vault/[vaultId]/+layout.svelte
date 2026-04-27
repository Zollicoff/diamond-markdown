<script lang="ts">
	import { onMount } from 'svelte';
	import type { LayoutData } from './$types';
	import LeftSidebar from '$lib/components/sidebar/LeftSidebar.svelte';
	import LeftRail from '$lib/components/sidebar/LeftRail.svelte';
	import RightPanel from '$lib/components/rightpanel/RightPanel.svelte';
	import TopBar from '$lib/components/TopBar.svelte';
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
	<!-- Top bar spans the full width with column zones that mirror the
	     layout below: rail | left-sidebar | editor | right-sidebar.
	     Collapsers live in the sidebar zones; when a zone collapses to
	     0 its chevron jumps to the editor-zone edge so it stays usable. -->
	<TopBar
		vaultId={data.vault.id}
		leftCollapsed={workspace.leftSidebarCollapsed}
		rightCollapsed={workspace.rightSidebarCollapsed}
		onToggleLeft={() => toggleLeftSidebar(data.vault.id)}
		onToggleRight={() => toggleRightSidebar(data.vault.id)}
	/>

	<div class="rail-col">
		<LeftRail vaultId={data.vault.id} />
	</div>

	<div class="col left-col">
		<LeftSidebar vaultId={data.vault.id} vaultName={data.vault.name} {tree} />
	</div>

	<main class="center">
		<Workspace vaultId={data.vault.id} {onDocLoaded} />
		{@render children()}
	</main>

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
		/* row 1: top bar | row 2: rail | sidebar | editor | sidebar */
		grid-template-rows: 36px 1fr;
		grid-template-columns: 38px 260px 1fr 280px;
		height: 100vh;
		min-height: 0;
		transition: grid-template-columns 0.18s cubic-bezier(0.22, 0.61, 0.36, 1);
	}
	.shell.left-collapsed  { grid-template-columns: 38px 0 1fr 280px; }
	.shell.right-collapsed { grid-template-columns: 38px 260px 1fr 0; }
	.shell.left-collapsed.right-collapsed { grid-template-columns: 38px 0 1fr 0; }

	.rail-col { grid-row: 2; min-width: 0; min-height: 0; overflow: hidden; }
	.col { grid-row: 2; min-width: 0; min-height: 0; overflow: hidden; }
	.center { grid-row: 2; }
	.shell.left-collapsed .left-col,
	.shell.right-collapsed .right-col {
		visibility: hidden;
	}

	.center {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
	}
	.center > :global(.workspace) { flex: 1; min-height: 0; }

	@media (max-width: 900px) {
		.shell { grid-template-columns: 38px 240px 1fr 260px; }
		.shell.left-collapsed  { grid-template-columns: 38px 0 1fr 260px; }
		.shell.right-collapsed { grid-template-columns: 38px 240px 1fr 0; }
		.shell.left-collapsed.right-collapsed { grid-template-columns: 38px 0 1fr 0; }
	}

	@media (max-width: 640px) {
		.shell { grid-template-columns: 48px 70vw 1fr 78vw; }
		.shell.left-collapsed  { grid-template-columns: 48px 0 1fr 78vw; }
		.shell.right-collapsed { grid-template-columns: 48px 70vw 1fr 0; }
		.shell.left-collapsed.right-collapsed { grid-template-columns: 48px 0 1fr 0; }
	}
</style>
