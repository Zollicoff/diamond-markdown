<script lang="ts">
	import type { Pane, Tab } from '$lib/workspace/types';
	import type { NoteDoc } from '$lib/types';
	import TabBar from './TabBar.svelte';
	import TabContent from './TabContent.svelte';
	import EmptyPane from './EmptyPane.svelte';
	import { setActivePane } from '$lib/workspace/actions';

	interface Props {
		vaultId: string;
		pane: Pane;
		isActivePane: boolean;
		canClose: boolean;
		onDocLoaded?: (doc: NoteDoc) => void;
		/** Suppress the per-pane TabBar — used when a parent (e.g. TopBar)
		 *  is rendering this pane's tabs instead. */
		hideTabBar?: boolean;
	}

	let { vaultId, pane, isActivePane, canClose, onDocLoaded, hideTabBar }: Props = $props();

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
	{#if !hideTabBar}
		<TabBar {vaultId} {pane} {isActivePane} {canClose} />
	{/if}

	<div class="pane-body">
		{#if activeTab}
			<TabContent
				{vaultId}
				tab={activeTab}
				{mode}
				isFocused={isActivePane}
				onModeChange={(m) => (mode = m)}
				{onDocLoaded}
			/>
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
	.pane-body { flex: 1; min-height: 0; overflow: hidden; }
</style>
