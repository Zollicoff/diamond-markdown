<script lang="ts">
	import CollapseToggle from './CollapseToggle.svelte';
	import TabBar from './workspace/TabBar.svelte';
	import Wordmark from './Wordmark.svelte';
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

<header
	class="topbar"
	class:left-collapsed={leftCollapsed}
	class:right-collapsed={rightCollapsed}
	aria-label="Workspace top bar"
>
	<!-- Subgrid mirrors shell columns: rail | left-sidebar | editor | right-sidebar.
	     The rail-zone always shows the Diamond crystal. When the left sidebar
	     is expanded, the side-left zone shows the "Diamond Markdown" wordmark
	     text right next to it (icon + text together visually). Collapse
	     chevrons live inside the editor zone so they don't teleport. -->
	<div class="tb-zone tb-rail">
		<a href="/" class="brand-icon" title="Diamond Markdown" aria-label="Diamond Markdown — switch vault">
			<Wordmark iconOnly size="xs" href={null} />
		</a>
	</div>

	<div class="tb-zone tb-side-left" class:hidden={leftCollapsed}>
		<a href="/" class="brand-text">
			<Wordmark textOnly size="xs" href={null} />
		</a>
	</div>

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

	<div class="tb-zone tb-side-right" class:hidden={rightCollapsed} aria-hidden="true"></div>
</header>

<style>
	/* Mirrors the shell's grid-template-columns 1:1. We can't use
	   `grid-template-columns: subgrid` here because Safari's subgrid
	   implementation flakes out when the parent has animating column
	   widths (which happens on sidebar collapse). The values below
	   must stay in lock-step with src/routes/vault/[vaultId]/+layout.svelte
	   .shell rules. */
	.topbar {
		grid-row: 1;
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: 38px 260px 1fr 280px;
		height: 36px;
		background: var(--bg-elev);
		border-bottom: 1px solid var(--border);
		transition: grid-template-columns 0.18s cubic-bezier(0.22, 0.61, 0.36, 1);
	}
	.topbar.left-collapsed  { grid-template-columns: 38px 0 1fr 280px; }
	.topbar.right-collapsed { grid-template-columns: 38px 260px 1fr 0; }
	.topbar.left-collapsed.right-collapsed { grid-template-columns: 38px 0 1fr 0; }

	@media (max-width: 900px) {
		.topbar { grid-template-columns: 38px 240px 1fr 260px; }
		.topbar.left-collapsed  { grid-template-columns: 38px 0 1fr 260px; }
		.topbar.right-collapsed { grid-template-columns: 38px 240px 1fr 0; }
		.topbar.left-collapsed.right-collapsed { grid-template-columns: 38px 0 1fr 0; }
	}
	@media (max-width: 640px) {
		.topbar { grid-template-columns: 48px 70vw 1fr 78vw; }
		.topbar.left-collapsed  { grid-template-columns: 48px 0 1fr 78vw; }
		.topbar.right-collapsed { grid-template-columns: 48px 70vw 1fr 0; }
		.topbar.left-collapsed.right-collapsed { grid-template-columns: 48px 0 1fr 0; }
	}

	.tb-zone {
		display: flex;
		align-items: center;
		min-width: 0;
		overflow: hidden;
	}
	/* Match the layout below: rail has a right-edge separator, sidebar
	   has a right-edge separator. When a side zone is hidden (sidebar
	   collapsed), the visibility:hidden also takes its border with it
	   so the rail-zone's right edge becomes the only visible seam. */
	.tb-rail {
		justify-content: center;
		border-right: 1px solid var(--border);
	}
	.tb-side-left {
		padding: 0 10px;
		border-right: 1px solid var(--border);
	}
	.tb-side-right {
		border-left: 1px solid var(--border);
	}
	.tb-zone.hidden { visibility: hidden; }

	.brand-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 5px;
		text-decoration: none;
	}
	.brand-icon:hover { background: var(--bg-hover); }
	.brand-icon :global(.crystal) {
		filter: drop-shadow(0 2px 4px rgba(96, 165, 250, 0.3));
	}

	.brand-text {
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		min-width: 0;
		overflow: hidden;
	}
	.brand-text :global(.word) {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
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
