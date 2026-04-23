<script lang="ts">
	import { tabsStore } from '$lib/tabs.svelte';
	import { goto } from '$app/navigation';

	interface Props {
		vaultId: string;
		/** Path currently visible, from URL params. */
		activePath: string | null;
	}

	let { vaultId, activePath }: Props = $props();

	tabsStore.hydrate(vaultId);

	let dragIdx = $state<number | null>(null);
	let dragOverIdx = $state<number | null>(null);

	async function close(e: MouseEvent | undefined, path: string): Promise<void> {
		if (e) { e.preventDefault(); e.stopPropagation(); }
		const next = tabsStore.close(vaultId, path);
		if (activePath === path) {
			if (next) goto(`/vault/${vaultId}/note/${encodeURI(next)}`);
			else goto(`/vault/${vaultId}`);
		}
	}

	function onAuxClick(e: MouseEvent, path: string): void {
		if (e.button === 1) { // middle click
			e.preventDefault();
			close(undefined, path);
		}
	}

	function onDragStart(e: DragEvent, idx: number): void {
		dragIdx = idx;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', String(idx));
		}
	}
	function onDragOver(e: DragEvent, idx: number): void {
		if (dragIdx === null) return;
		e.preventDefault();
		dragOverIdx = idx;
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
	}
	function onDrop(e: DragEvent, idx: number): void {
		e.preventDefault();
		if (dragIdx !== null && dragIdx !== idx) {
			tabsStore.reorder(vaultId, dragIdx, idx);
		}
		dragIdx = null;
		dragOverIdx = null;
	}
</script>

{#if tabsStore.tabs.length > 0}
	<nav class="tabs" aria-label="Open notes">
		{#each tabsStore.tabs as t, i}
			<a
				class="tab"
				class:active={t.path === activePath}
				class:drag-over={dragOverIdx === i && dragIdx !== i}
				href={`/vault/${vaultId}/note/${encodeURI(t.path)}`}
				title={t.path}
				draggable="true"
				ondragstart={(e) => onDragStart(e, i)}
				ondragover={(e) => onDragOver(e, i)}
				ondrop={(e) => onDrop(e, i)}
				ondragend={() => { dragIdx = null; dragOverIdx = null; }}
				onauxclick={(e) => onAuxClick(e, t.path)}
			>
				<span class="tab-title">{t.title}</span>
				<button class="tab-close" aria-label="Close" onclick={(e) => close(e, t.path)}>×</button>
			</a>
		{/each}
	</nav>
{/if}

<style>
	.tabs {
		display: flex;
		background: var(--bg);
		border-bottom: 1px solid var(--border);
		overflow-x: auto;
		scrollbar-width: thin;
		min-height: 34px;
	}
	.tab {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 10px 6px 14px;
		color: var(--fg-muted);
		background: transparent;
		text-decoration: none;
		font-size: 0.82rem;
		border-right: 1px solid var(--border);
		max-width: 240px;
		min-width: 100px;
		position: relative;
		cursor: pointer;
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
</style>
