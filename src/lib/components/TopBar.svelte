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
	<!-- Subgrid mirrors shell columns: rail | left-sidebar | editor | right-sidebar.
	     Sidebar zones are decorative space (matching widths below). The
	     collapse chevrons live inside the editor zone, pinned to its left
	     and right edges, so they never teleport when sidebars toggle —
	     they just slide along with the editor edge. -->
	<div class="tb-zone tb-rail" aria-hidden="true"></div>
	<div class="tb-zone tb-side-left" aria-hidden="true"></div>

	<div class="tb-zone tb-editor">
		<div class="tb-chev">
			<CollapseToggle side="left" collapsed={leftCollapsed} onToggle={onToggleLeft} />
		</div>

		<div class="tb-tabs">
			{#if singlePane && activePane}
				<TabBar {vaultId} pane={activePane} isActivePane={true} />
			{:else if !singlePane}
				<span class="multi-hint">Split view · {paneIds.length} panes</span>
			{/if}
		</div>

		<div class="tb-chev">
			<CollapseToggle side="right" collapsed={rightCollapsed} onToggle={onToggleRight} />
		</div>
	</div>

	<div class="tb-zone tb-side-right" aria-hidden="true"></div>
</header>

<style>
	.topbar {
		grid-row: 1;
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: subgrid;
		height: 36px;
		background: var(--bg-elev);
		border-bottom: 1px solid var(--border);
	}
	/* Fallback if subgrid is missing (older Safari etc.) */
	@supports not (grid-template-columns: subgrid) {
		.topbar { grid-template-columns: 38px 260px 1fr 280px; }
	}

	.tb-zone {
		display: flex;
		align-items: center;
		min-width: 0;
		overflow: hidden;
	}
	.tb-side-left {
		border-right: 1px solid var(--border);
	}
	.tb-side-right {
		border-left: 1px solid var(--border);
	}

	.tb-editor {
		display: flex;
		align-items: stretch;
	}
	.tb-chev {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		padding: 0 4px;
	}
	.tb-tabs {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: stretch;
		overflow: hidden;
	}
	/* TabBar renders its own borders; suppress them inside the topbar so
	   the topbar's bottom-border is the only seam. */
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
		align-self: center;
	}
</style>
