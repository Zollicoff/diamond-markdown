<script lang="ts">
	import type { Pane, Tab } from '$lib/workspace/types';
	import {
		activateTab,
		closeTab,
		closePane,
		moveTabBetween,
		reorderTab,
		setActivePane
	} from '$lib/workspace/actions';

	interface Props {
		vaultId: string;
		pane: Pane;
		isActivePane: boolean;
		canClose?: boolean;
	}

	let { vaultId, pane, isActivePane, canClose }: Props = $props();

	let dragIdx = $state<number | null>(null);
	let dragOverIdx = $state<number | null>(null);
	let dropActive = $state(false);

	function titleOf(t: Tab): string {
		return t.title || (t.kind === 'note' ? t.path.split('/').pop()!.replace(/\.md$/, '') : t.kind);
	}

	function click(t: Tab): void {
		activateTab(vaultId, pane.id, t.id);
	}

	function close(e: MouseEvent, t: Tab): void {
		e.preventDefault();
		e.stopPropagation();
		closeTab(vaultId, pane.id, t.id);
	}

	function onAuxClick(e: MouseEvent, t: Tab): void {
		if (e.button === 1) {
			e.preventDefault();
			closeTab(vaultId, pane.id, t.id);
		}
	}

	function onDragStart(e: DragEvent, idx: number, t: Tab): void {
		dragIdx = idx;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('application/x-diamond-tab', JSON.stringify({ paneId: pane.id, tabId: t.id }));
		}
	}

	function onDragOver(e: DragEvent, idx: number): void {
		const payload = e.dataTransfer?.types.includes('application/x-diamond-tab');
		if (!payload) return;
		e.preventDefault();
		dragOverIdx = idx;
		dropActive = true;
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
	}

	function onDrop(e: DragEvent, idx: number): void {
		e.preventDefault();
		dropActive = false;
		dragOverIdx = null;
		const raw = e.dataTransfer?.getData('application/x-diamond-tab');
		if (!raw) return;
		let src: { paneId: string; tabId: string } | null = null;
		try { src = JSON.parse(raw); } catch { /* malformed */ }
		if (!src) return;
		if (src.paneId === pane.id) {
			const from = pane.tabs.findIndex((t) => t.id === src!.tabId);
			if (from >= 0 && from !== idx) reorderTab(vaultId, pane.id, from, idx);
		} else {
			moveTabBetween(vaultId, src.paneId, src.tabId, pane.id, idx);
		}
		dragIdx = null;
	}

	function focusPane(): void {
		if (!isActivePane) setActivePane(vaultId, pane.id);
	}
</script>

<nav
	class="tabs"
	class:active-pane={isActivePane}
	class:drop-active={dropActive}
	onmousedown={focusPane}
	aria-label="Open notes"
>
	{#if pane.tabs.length === 0}
		<span class="empty-hint">no tabs · open a note from the sidebar</span>
	{/if}
	{#each pane.tabs as t, i}
		<div
			class="tab"
			class:active={t.id === pane.activeTabId}
			class:drag-over={dragOverIdx === i && dragIdx !== i}
			title={t.kind === 'note' ? t.path : t.kind}
			draggable="true"
			onclick={() => click(t)}
			onauxclick={(e) => onAuxClick(e, t)}
			onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') click(t); }}
			role="tab"
			tabindex="0"
			aria-selected={t.id === pane.activeTabId}
			ondragstart={(e) => onDragStart(e, i, t)}
			ondragover={(e) => onDragOver(e, i)}
			ondrop={(e) => onDrop(e, i)}
			ondragend={() => { dragIdx = null; dragOverIdx = null; dropActive = false; }}
		>
			<span class="tab-kind">{kindGlyph(t.kind)}</span>
			<span class="tab-title">{titleOf(t)}</span>
			<button class="tab-close" onclick={(e) => close(e, t)} aria-label="Close">×</button>
		</div>
	{/each}
	{#if canClose}
		<button class="pane-close" title="Close pane" onclick={() => closePane(vaultId, pane.id)}>× pane</button>
	{/if}
</nav>

<script lang="ts" module>
	function kindGlyph(k: Tab['kind']): string {
		switch (k) {
			case 'note':     return '◇';
			case 'graph':    return '◎';
			case 'tags':     return '#';
			case 'search':   return '⌕';
			case 'settings': return '⚙';
			default:         return '◇';
		}
	}
</script>

<style>
	.tabs {
		display: flex;
		min-height: 34px;
		background: var(--bg);
		border-bottom: 1px solid var(--border);
		overflow-x: auto;
		scrollbar-width: thin;
		border-top: 2px solid transparent;
	}
	.tabs.active-pane { border-top-color: var(--accent); }
	.tabs.drop-active { background: rgba(125, 211, 252, 0.04); }

	.empty-hint {
		padding: 9px 14px;
		color: var(--fg-dim);
		font-size: 0.78rem;
		font-style: italic;
	}

	.tab {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 10px 6px 14px;
		color: var(--fg-muted);
		font-size: 0.82rem;
		border-right: 1px solid var(--border);
		max-width: 240px;
		min-width: 100px;
		position: relative;
		cursor: pointer;
		user-select: none;
	}
	.tab:hover { background: var(--bg-hover); color: var(--fg); }
	.tab.active {
		background: var(--bg-elev);
		color: var(--fg);
	}
	.tab.active::after {
		content: '';
		position: absolute;
		left: 0; right: 0; bottom: -1px;
		height: 2px;
		background: var(--accent);
	}
	.tab.drag-over { background: var(--accent-soft); }
	.tab-kind { color: var(--fg-dim); font-family: var(--mono); }
	.tab-title {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tab-close {
		background: transparent;
		border: 0;
		color: var(--fg-dim);
		font-size: 1rem;
		line-height: 1;
		padding: 1px 5px;
		border-radius: 3px;
		cursor: pointer;
		opacity: 0;
		transition: opacity 0.1s;
	}
	.tab:hover .tab-close, .tab.active .tab-close { opacity: 1; }
	.tab-close:hover { background: var(--bg-hover); color: var(--fg); }

	.pane-close {
		margin-left: auto;
		align-self: center;
		background: transparent;
		border: 0;
		color: var(--fg-dim);
		font: inherit;
		font-size: 0.74rem;
		font-family: var(--mono);
		padding: 3px 10px;
		border-radius: 4px;
		cursor: pointer;
		flex: none;
	}
	.pane-close:hover { color: var(--danger); background: var(--bg-hover); }
</style>
