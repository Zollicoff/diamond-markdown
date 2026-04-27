<script lang="ts">
	import CollapseToggle from './CollapseToggle.svelte';
	import TabBar from './workspace/TabBar.svelte';
	import { workspace } from '$lib/workspace/store.svelte';

	interface Props {
		vaultId: string;
		leftCollapsed: boolean;
		rightCollapsed: boolean;
		onToggleLeft: () => void;
		onToggleRight: () => void;
	}
	let { vaultId, leftCollapsed, rightCollapsed, onToggleLeft, onToggleRight }: Props = $props();

	const paneIds = $derived(Object.keys(workspace.panes));
	const singlePane = $derived(paneIds.length === 1);
	const activePane = $derived(workspace.panes[workspace.activePaneId] ?? null);
</script>

<header class="topbar" aria-label="Workspace top bar">
	<!-- Mirrors the .shell column tracks: rail | left-sidebar | editor | right-sidebar.
	     When a sidebar zone collapses to 0, its chevron jumps to the editor zone
	     so it stays reachable. -->
	<div class="tb-zone tb-rail" aria-hidden="true"></div>

	<div class="tb-zone tb-left">
		{#if !leftCollapsed}
			<CollapseToggle side="left" collapsed={false} onToggle={onToggleLeft} />
		{/if}
	</div>

	<div class="tb-zone tb-editor">
		{#if leftCollapsed}
			<div class="edge-chev edge-left">
				<CollapseToggle side="left" collapsed={true} onToggle={onToggleLeft} />
			</div>
		{/if}

		<div class="tb-tabs">
			{#if singlePane && activePane}
				<TabBar {vaultId} pane={activePane} isActivePane={true} />
			{:else if !singlePane}
				<span class="multi-hint">Split view · {paneIds.length} panes</span>
			{/if}
		</div>

		{#if rightCollapsed}
			<div class="edge-chev edge-right">
				<CollapseToggle side="right" collapsed={true} onToggle={onToggleRight} />
			</div>
		{/if}
	</div>

	<div class="tb-zone tb-right">
		{#if !rightCollapsed}
			<CollapseToggle side="right" collapsed={false} onToggle={onToggleRight} />
		{/if}
	</div>
</header>

<style>
	.topbar {
		grid-row: 1;
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: subgrid;
		min-height: 36px;
		background: var(--bg-elev);
		border-bottom: 1px solid var(--border);
	}
	/* Fallback if subgrid isn't supported (older Safari etc.) */
	@supports not (grid-template-columns: subgrid) {
		.topbar { grid-template-columns: 38px 260px 1fr 280px; }
	}

	.tb-zone {
		display: flex;
		align-items: center;
		min-width: 0;
		overflow: hidden;
	}
	.tb-left {
		justify-content: flex-end;
		padding-right: 4px;
		border-right: 1px solid var(--border);
	}
	.tb-right {
		justify-content: flex-start;
		padding-left: 4px;
		border-left: 1px solid var(--border);
	}
	.tb-editor {
		display: flex;
		align-items: stretch;
	}
	.edge-chev {
		display: flex;
		align-items: center;
		padding: 0 6px;
	}
	.edge-chev.edge-right { margin-left: auto; }

	.tb-tabs {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: stretch;
	}
	/* The TabBar component renders its own bottom-border; suppress that
	   when it lives inside the topbar so we don't get a double border. */
	.tb-tabs :global(.tabs) {
		flex: 1;
		min-height: 0;
		border-bottom: 0;
		border-top: 0;
		background: transparent;
	}

	.multi-hint {
		color: var(--fg-dim);
		font-size: 0.78rem;
		padding: 0 12px;
		font-style: italic;
	}
</style>
