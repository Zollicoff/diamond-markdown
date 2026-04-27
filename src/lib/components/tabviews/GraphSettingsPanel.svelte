<script lang="ts">
	import { SIM_RANGES } from '$lib/graph/sim';

	interface Props {
		// Forces tab
		nodeScale: number;
		repulse: number;
		linkForce: number;
		linkDist: number;
		centerForce: number;
		// Filters tab
		hideOrphans: boolean;
		searchQuery: string;
		filtersActive: boolean;
		// Setters (Svelte 5 `bind:` would also work but explicit setters
		// keep the parent in charge of persistence side effects)
		onSetNodeScale: (v: number) => void;
		onSetRepulse: (v: number) => void;
		onSetLinkForce: (v: number) => void;
		onSetLinkDist: (v: number) => void;
		onSetCenterForce: (v: number) => void;
		onSetHideOrphans: (v: boolean) => void;
		onSetSearchQuery: (v: string) => void;
		onResetForces: () => void;
		onResetFilters: () => void;
		onClose: () => void;
	}
	let {
		nodeScale, repulse, linkForce, linkDist, centerForce,
		hideOrphans, searchQuery, filtersActive,
		onSetNodeScale, onSetRepulse, onSetLinkForce, onSetLinkDist, onSetCenterForce,
		onSetHideOrphans, onSetSearchQuery,
		onResetForces, onResetFilters, onClose
	}: Props = $props();

	let panelTab = $state<'forces' | 'filters'>('forces');

	const r = SIM_RANGES;
</script>

<aside class="forces-panel" role="dialog" aria-label="Graph settings">
	<div class="fp-head">
		<div class="fp-tabs" role="tablist">
			<button
				class="fp-tab"
				class:active={panelTab === 'forces'}
				role="tab"
				aria-selected={panelTab === 'forces'}
				onclick={() => (panelTab = 'forces')}
			>Forces</button>
			<button
				class="fp-tab"
				class:active={panelTab === 'filters'}
				role="tab"
				aria-selected={panelTab === 'filters'}
				onclick={() => (panelTab = 'filters')}
			>
				Filters
				{#if filtersActive}<span class="fp-dot" aria-label="Filters active"></span>{/if}
			</button>
		</div>
		<button class="fp-close" onclick={onClose} aria-label="Close">×</button>
	</div>

	{#if panelTab === 'forces'}
		<label class="fp-row">
			<span class="fp-label">Node size</span>
			<input type="range" min={r.nodeScale.min} max={r.nodeScale.max} step={r.nodeScale.step} value={nodeScale} oninput={(e) => onSetNodeScale(+(e.currentTarget as HTMLInputElement).value)} />
			<span class="fp-val mono">{nodeScale.toFixed(1)}×</span>
		</label>

		<label class="fp-row">
			<span class="fp-label">Repel force</span>
			<input type="range" min={r.repulse.min} max={r.repulse.max} step={r.repulse.step} value={repulse} oninput={(e) => onSetRepulse(+(e.currentTarget as HTMLInputElement).value)} />
			<span class="fp-val mono">{Math.round(repulse)}</span>
		</label>

		<label class="fp-row">
			<span class="fp-label">Link force</span>
			<input type="range" min={r.linkForce.min} max={r.linkForce.max} step={r.linkForce.step} value={linkForce} oninput={(e) => onSetLinkForce(+(e.currentTarget as HTMLInputElement).value)} />
			<span class="fp-val mono">{linkForce.toFixed(2)}</span>
		</label>

		<label class="fp-row">
			<span class="fp-label">Link distance</span>
			<input type="range" min={r.linkDist.min} max={r.linkDist.max} step={r.linkDist.step} value={linkDist} oninput={(e) => onSetLinkDist(+(e.currentTarget as HTMLInputElement).value)} />
			<span class="fp-val mono">{Math.round(linkDist)}</span>
		</label>

		<label class="fp-row">
			<span class="fp-label">Center force</span>
			<input type="range" min={r.centerForce.min} max={r.centerForce.max} step={r.centerForce.step} value={centerForce} oninput={(e) => onSetCenterForce(+(e.currentTarget as HTMLInputElement).value)} />
			<span class="fp-val mono">{centerForce.toFixed(3)}</span>
		</label>

		<button class="fp-reset" onclick={onResetForces}>Restore defaults</button>
	{:else}
		<label class="fp-search">
			<span class="fp-label">Search</span>
			<input type="search" placeholder="Filter by name or path…" value={searchQuery} oninput={(e) => onSetSearchQuery((e.currentTarget as HTMLInputElement).value)} />
		</label>

		<label class="fp-toggle">
			<input type="checkbox" checked={hideOrphans} onchange={(e) => onSetHideOrphans((e.currentTarget as HTMLInputElement).checked)} />
			<span>Hide orphans <span class="fp-hint">(no links in or out)</span></span>
		</label>

		<button class="fp-reset" onclick={onResetFilters}>Clear filters</button>
	{/if}
</aside>

<style>
	.forces-panel {
		position: absolute;
		top: 50px;
		right: 12px;
		z-index: 10;
		width: 250px;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		border-radius: 8px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
		padding: 10px 12px 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.fp-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		padding-bottom: 4px;
		border-bottom: 1px solid var(--border);
	}
	.fp-tabs { display: flex; gap: 4px; }
	.fp-tab {
		background: transparent;
		border: 0;
		border-bottom: 2px solid transparent;
		color: var(--fg-muted);
		cursor: pointer;
		font: inherit;
		font-size: 0.78rem;
		padding: 4px 8px 5px;
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.fp-tab:hover { color: var(--fg); }
	.fp-tab.active { color: var(--fg); border-bottom-color: var(--accent); font-weight: 600; }
	.fp-dot {
		display: inline-block;
		width: 6px; height: 6px; border-radius: 50%;
		background: var(--accent);
	}
	.fp-close {
		background: transparent;
		border: 0;
		color: var(--fg-muted);
		cursor: pointer;
		font-size: 1.1rem;
		line-height: 1;
		padding: 0 4px;
	}
	.fp-close:hover { color: var(--fg); }
	.fp-row {
		display: grid;
		grid-template-columns: auto 1fr 44px;
		align-items: center;
		gap: 8px;
		font-size: 0.74rem;
		color: var(--fg-dim);
	}
	.fp-label {
		white-space: nowrap;
		min-width: 84px;
	}
	.fp-row input[type='range'] {
		width: 100%;
		accent-color: var(--accent);
	}
	.fp-val {
		text-align: right;
		font-size: 0.7rem;
		color: var(--fg-muted);
	}
	.fp-reset {
		margin-top: 4px;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 4px 8px;
		color: var(--fg-muted);
		font: inherit;
		font-size: 0.74rem;
		cursor: pointer;
	}
	.fp-reset:hover { color: var(--accent); border-color: var(--accent); }

	.fp-search {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 0.74rem;
		color: var(--fg-dim);
	}
	.fp-search input[type='search'] {
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 4px;
		color: var(--fg);
		font: inherit;
		font-size: 0.78rem;
		padding: 5px 8px;
	}
	.fp-search input[type='search']:focus {
		outline: none;
		border-color: var(--accent);
	}
	.fp-toggle {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.78rem;
		color: var(--fg);
		cursor: pointer;
	}
	.fp-toggle input { accent-color: var(--accent); cursor: pointer; }
	.fp-hint { color: var(--fg-dim); font-size: 0.72rem; }

	.mono { font-family: var(--mono); font-variant-numeric: tabular-nums; }
</style>
