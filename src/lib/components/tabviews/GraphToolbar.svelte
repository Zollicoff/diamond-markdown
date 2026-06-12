<script lang="ts">
	interface Props {
		filtersActive: boolean;
		visibleNodeCount: number;
		totalNodeCount: number;
		visibleEdgeCount: number;
		totalEdgeCount: number;
		selectedCount: number;
		panelOpen: boolean;
		onClearSelection: () => void;
		onToggleSettings: () => void;
		onReset: () => void;
		onCenter: () => void;
	}

	let {
		filtersActive,
		visibleNodeCount,
		totalNodeCount,
		visibleEdgeCount,
		totalEdgeCount,
		selectedCount,
		panelOpen,
		onClearSelection,
		onToggleSettings,
		onReset,
		onCenter
	}: Props = $props();
</script>

<header class="bar">
	<h2>Graph</h2>
	<span class="count mono">
		{#if filtersActive}
			{visibleNodeCount} of {totalNodeCount} nodes · {visibleEdgeCount} edges
		{:else}
			{totalNodeCount} nodes · {totalEdgeCount} edges
		{/if}
	</span>
	{#if selectedCount > 0}
		<span class="selected-count mono">{selectedCount} selected</span>
		<button class="mini" onclick={onClearSelection} title="Clear graph selection">Clear</button>
	{/if}
	<span class="spacer"></span>
	<button class="mini" class:active={panelOpen} onclick={onToggleSettings} title="Forces, filters, display">⚙ Settings</button>
	<button class="mini" onclick={onReset} title="Restore force defaults, clear filters, re-center">Reset</button>
	<button class="mini" onclick={onCenter} title="Re-center the current view">Center</button>
</header>

<style>
	.bar {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 14px;
		border-bottom: 1px solid var(--border);
	}
	h2 {
		font-family: 'Bricolage Grotesque', var(--sans);
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;
	}
	.count { font-size: 0.72rem; color: var(--fg-dim); }
	.selected-count {
		font-size: 0.72rem;
		color: var(--accent);
		background: var(--accent-soft);
		border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
		border-radius: 999px;
		padding: 2px 8px;
	}
	.spacer { flex: 1; }
	.mini {
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 3px 9px;
		color: var(--fg-muted);
		cursor: pointer;
		font: inherit;
		font-size: 0.76rem;
	}
	.mini:hover { color: var(--accent); border-color: var(--accent); }
	.mini.active { color: var(--accent); border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
	.mono { font-family: var(--mono); font-variant-numeric: tabular-nums; }
</style>
