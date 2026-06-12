<script lang="ts">
	import { onMount } from 'svelte';
	import { exec } from '$lib/commands';
	import {
		TREE_SORT_LABELS,
		sortMenuPositionFromRect,
		type TreeSortMode
	} from '$lib/tree/view';

	interface Props {
		vaultId: string;
		sortMode: TreeSortMode;
		autoReveal: boolean;
		allCollapsed: boolean;
		onSortChange: (mode: TreeSortMode) => void;
		onToggleAutoReveal: () => void;
		onToggleExpandAll: () => void;
	}

	let {
		vaultId,
		sortMode,
		autoReveal,
		allCollapsed,
		onSortChange,
		onToggleAutoReveal,
		onToggleExpandAll
	}: Props = $props();

	let sortMenuOpen = $state(false);
	let sortBtnEl: HTMLButtonElement | null = $state(null);
	let sortMenuPos = $state<{ top: number; left: number }>({ top: 0, left: 0 });

	function openSortMenu(): void {
		if (sortBtnEl) {
			const rect = sortBtnEl.getBoundingClientRect();
			sortMenuPos = sortMenuPositionFromRect(rect);
		}
		sortMenuOpen = !sortMenuOpen;
	}

	function setSort(mode: TreeSortMode): void {
		onSortChange(mode);
		sortMenuOpen = false;
	}

	onMount(() => {
		const onDocClick = (event: MouseEvent) => {
			if (!sortMenuOpen) return;
			const target = event.target as HTMLElement | null;
			if (target?.closest('.sort-menu, .toolbar-btn.sort')) return;
			sortMenuOpen = false;
		};
		window.addEventListener('click', onDocClick);
		return () => window.removeEventListener('click', onDocClick);
	});
</script>

<header class="ft-toolbar" aria-label="File tree controls">
	<button class="toolbar-btn" onclick={() => exec('note.create', { vaultId })} title="New note" aria-label="New note">
		<svg viewBox="0 0 16 16" aria-hidden="true">
			<path d="M9 2 H4 a1 1 0 0 0 -1 1 V13 a1 1 0 0 0 1 1 H12 a1 1 0 0 0 1 -1 V6" />
			<path d="M9 2 L13 6" />
			<path d="M9 2 V6 H13" />
			<path d="M6 9 H10 M8 8 V11" stroke-width="1.4" />
		</svg>
	</button>
	<button class="toolbar-btn" onclick={() => exec('folder.create', { vaultId })} title="New folder" aria-label="New folder">
		<svg viewBox="0 0 16 16" aria-hidden="true">
			<path d="M2 5 a1 1 0 0 1 1 -1 H6.5 L8 5.5 H13 a1 1 0 0 1 1 1 V12 a1 1 0 0 1 -1 1 H3 a1 1 0 0 1 -1 -1 Z" />
			<path d="M6 9 H10 M8 7.5 V10.5" stroke-width="1.4" />
		</svg>
	</button>
	<span class="ft-spacer"></span>
	<div class="sort-wrap">
		<button
			bind:this={sortBtnEl}
			class="toolbar-btn sort"
			onclick={openSortMenu}
			title="Sort: {TREE_SORT_LABELS[sortMode]}"
			aria-label="Change sort order"
			aria-haspopup="menu"
			aria-expanded={sortMenuOpen}
		>
			<svg viewBox="0 0 16 16" aria-hidden="true">
				<path d="M4 3 V13 M2 11 L4 13 L6 11" />
				<path d="M9 4 H14 M9 8 H12 M9 12 H10" />
			</svg>
		</button>
		{#if sortMenuOpen}
			<menu class="sort-menu" role="menu" style="top: {sortMenuPos.top}px; left: {sortMenuPos.left}px;">
				{#each (Object.keys(TREE_SORT_LABELS) as TreeSortMode[]) as mode (mode)}
					<button
						class="sort-item"
						class:active={mode === sortMode}
						role="menuitemradio"
						aria-checked={mode === sortMode}
						onclick={() => setSort(mode)}
					>
						<span class="check">{mode === sortMode ? '✓' : ''}</span>
						{TREE_SORT_LABELS[mode]}
					</button>
				{/each}
			</menu>
		{/if}
	</div>
	<button
		class="toolbar-btn"
		class:active={autoReveal}
		onclick={onToggleAutoReveal}
		title="Auto-reveal current file"
		aria-label="Auto-reveal current file"
		aria-pressed={autoReveal}
	>
		<svg viewBox="0 0 16 16" aria-hidden="true">
			<path d="M2 8 C 4 4 7 4 8 4 S 12 4 14 8 S 12 12 8 12 S 4 12 2 8 Z" />
			<circle cx="8" cy="8" r="2" class="solid" />
		</svg>
	</button>
	<button
		class="toolbar-btn"
		onclick={onToggleExpandAll}
		title={allCollapsed ? 'Expand all' : 'Collapse all'}
		aria-label={allCollapsed ? 'Expand all' : 'Collapse all'}
	>
		{#if allCollapsed}
			<svg viewBox="0 0 16 16" aria-hidden="true">
				<path d="M3 6 L8 11 L13 6" />
			</svg>
		{:else}
			<svg viewBox="0 0 16 16" aria-hidden="true">
				<path d="M3 10 L8 5 L13 10" />
			</svg>
		{/if}
	</button>
</header>

<style>
	.ft-toolbar {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 4px 8px;
		border-bottom: 1px solid var(--border);
	}
	.ft-spacer { flex: 1; }
	.toolbar-btn {
		background: transparent;
		border: 0;
		color: var(--fg-muted);
		width: 26px;
		height: 26px;
		border-radius: 4px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		position: relative;
	}
	.toolbar-btn:hover { color: var(--fg); background: var(--bg-hover); }
	.toolbar-btn.active { color: var(--accent); }
	.toolbar-btn svg {
		width: 14px;
		height: 14px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.toolbar-btn svg .solid {
		fill: currentColor;
		stroke: none;
	}

	.sort-wrap { position: relative; }
	.sort-menu {
		/* Fixed (not absolute): the sidebar grid column has overflow:hidden,
		   which would clip an absolute child. Fixed lifts the menu out of
		   that clip and into the viewport stacking context, so it can land
		   visually on top of the editor pane. Position is set inline by JS
		   from the sort button's bounding rect. */
		position: fixed;
		min-width: 220px;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		border-radius: 6px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
		padding: 4px;
		margin: 0;
		z-index: 1000;
		display: flex;
		flex-direction: column;
		list-style: none;
	}
	.sort-item {
		display: flex;
		align-items: center;
		gap: 6px;
		background: transparent;
		border: 0;
		color: var(--fg);
		font: inherit;
		font-size: 0.82rem;
		padding: 6px 10px;
		border-radius: 4px;
		cursor: pointer;
		text-align: left;
		white-space: nowrap;
	}
	.sort-item:hover { background: var(--bg-hover); }
	.sort-item.active { color: var(--accent); }
	.sort-item .check {
		width: 12px;
		display: inline-block;
		text-align: center;
		font-size: 0.78rem;
	}
</style>
