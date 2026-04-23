<script lang="ts">
	import type { LayoutNode } from '$lib/workspace/types';
	import type { NoteDoc } from '$lib/types';
	import { workspace } from '$lib/workspace/store.svelte';
	import Pane from './Pane.svelte';

	interface Props {
		vaultId: string;
		onDocLoaded?: (doc: NoteDoc) => void;
	}

	let { vaultId, onDocLoaded }: Props = $props();

	let paneCount = $derived(Object.keys(workspace.panes).length);
</script>

{#snippet renderNode(node: LayoutNode)}
	{#if node.kind === 'pane'}
		{@const pane = workspace.panes[node.paneId]}
		{#if pane}
			<Pane
				{vaultId}
				{pane}
				isActivePane={workspace.activePaneId === pane.id}
				canClose={paneCount > 1}
				{onDocLoaded}
			/>
		{/if}
	{:else}
		<div class="split" class:col={node.direction === 'col'} class:row={node.direction === 'row'}>
			{#each node.children as child}
				{@render renderNode(child)}
			{/each}
		</div>
	{/if}
{/snippet}

<div class="workspace">
	{@render renderNode(workspace.layout)}
</div>

<style>
	.workspace {
		display: flex;
		height: 100%;
		min-height: 0;
		min-width: 0;
	}
	.workspace > :global(*) { flex: 1; min-width: 0; min-height: 0; }
	.split {
		display: flex;
		flex: 1;
		min-width: 0;
		min-height: 0;
	}
	.split.row { flex-direction: row; }
	.split.col { flex-direction: column; }
	.split > :global(*) { flex: 1; min-width: 0; min-height: 0; }
</style>
