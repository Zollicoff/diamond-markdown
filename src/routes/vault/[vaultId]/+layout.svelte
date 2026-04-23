<script lang="ts">
	import { onMount } from 'svelte';
	import type { LayoutData } from './$types';
	import LeftSidebar from '$lib/components/sidebar/LeftSidebar.svelte';
	import RightPanel from '$lib/components/rightpanel/RightPanel.svelte';
	import CollapseToggle from '$lib/components/CollapseToggle.svelte';
	import Workspace from '$lib/components/workspace/Workspace.svelte';
	import QuickSwitcher from '$lib/components/QuickSwitcher.svelte';
	import { hydrate as hydrateWorkspace, workspace } from '$lib/workspace/store.svelte';
	import { bindVaultEvents, toggleLeftSidebar, toggleRightSidebar } from '$lib/workspace/actions';
	import { registerBuiltinCommands } from '$lib/commands';
	import { installGlobalKeymap } from '$lib/commands/keymap';
	import { on as onBus } from '$lib/events';
	import type { NoteDoc } from '$lib/types';
	import type { TreeNode } from '$lib/types';

	let { data, children }: { data: LayoutData; children: () => unknown } = $props();

	// Boot: hydrate workspace, wire event listeners, register commands.
	hydrateWorkspace(data.vault.id);
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
				// Re-fetch tree from API (layout server load won't re-run client-side).
				try {
					const res = await fetch(`/api/vaults/${data.vault.id}/tree`);
					if (res.ok) tree = (await res.json()).tree;
				} catch { /* ignore */ }
			}),
			installGlobalKeymap(() => ({ vaultId: data.vault.id }))
		];
		return () => offs.forEach((off) => off?.());
	});

	function onDocLoaded(doc: NoteDoc): void {
		activeDoc = doc;
	}
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
</style>
