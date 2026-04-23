<script lang="ts">
	import type { Pane, Tab } from '$lib/workspace/types';
	import type { NoteDoc } from '$lib/types';
	import TabBar from './TabBar.svelte';
	import TabContent from './TabContent.svelte';
	import EmptyPane from './EmptyPane.svelte';
	import { setActivePane, closePane } from '$lib/workspace/actions';

	interface Props {
		vaultId: string;
		pane: Pane;
		isActivePane: boolean;
		canClose: boolean;
		onDocLoaded?: (doc: NoteDoc) => void;
	}

	let { vaultId, pane, isActivePane, canClose, onDocLoaded }: Props = $props();

	type Mode = 'live' | 'source' | 'read';
	let mode = $state<Mode>('live');

	let activeTab = $derived<Tab | null>(
		pane.tabs.find((t) => t.id === pane.activeTabId) ?? null
	);

	function focus(): void {
		if (!isActivePane) setActivePane(vaultId, pane.id);
	}
</script>

<section
	class="pane"
	class:active={isActivePane}
	onmousedown={focus}
	onfocusin={focus}
	role="region"
	aria-label="Editor pane"
>
	<TabBar {vaultId} {pane} {isActivePane} />

	<div class="pane-chrome">
		<div class="mode-group" role="tablist" aria-label="View mode">
			<button class:active={mode === 'live'}   onclick={() => (mode = 'live')}>Live</button>
			<button class:active={mode === 'source'} onclick={() => (mode = 'source')}>Source</button>
			<button class:active={mode === 'read'}   onclick={() => (mode = 'read')}>Read</button>
		</div>
		{#if canClose}
			<button class="pane-close" title="Close pane" onclick={() => closePane(vaultId, pane.id)}>× pane</button>
		{/if}
	</div>

	<div class="pane-body">
		{#if activeTab}
			<TabContent {vaultId} tab={activeTab} {mode} isFocused={isActivePane} {onDocLoaded} />
		{:else}
			<EmptyPane />
		{/if}
	</div>
</section>

<style>
	.pane {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		background: var(--bg);
		border-right: 1px solid var(--border);
	}
	.pane:last-child { border-right: 0; }
	.pane.active { /* subtle focus affordance already on TabBar top-border */ }

	.pane-chrome {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 4px 12px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-elev);
	}
	.mode-group { display: flex; gap: 2px; background: var(--bg); border: 1px solid var(--border); padding: 2px; border-radius: 6px; }
	.mode-group button {
		background: transparent;
		border: 0;
		color: var(--fg-muted);
		padding: 3px 10px;
		border-radius: 4px;
		font-size: 0.78rem;
		cursor: pointer;
		font-family: inherit;
	}
	.mode-group button.active { background: var(--bg-elev); color: var(--accent); }
	.pane-close {
		background: transparent;
		border: 0;
		color: var(--fg-dim);
		font-size: 0.74rem;
		padding: 3px 8px;
		border-radius: 4px;
		cursor: pointer;
		font-family: var(--mono);
	}
	.pane-close:hover { color: var(--danger); background: var(--bg-hover); }

	.pane-body { flex: 1; min-height: 0; overflow: hidden; }
</style>
