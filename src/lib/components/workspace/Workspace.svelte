<script lang="ts">
	import type { LayoutNode } from '$lib/workspace/types';
	import type { NoteDoc } from '$lib/types';
	import { workspace } from '$lib/workspace/store.svelte';
	import Pane from './Pane.svelte';

	interface Props {
		vaultId: string;
		onDocLoaded?: (doc: NoteDoc) => void;
		leftCollapsed?: boolean;
		rightCollapsed?: boolean;
		onToggleLeft?: () => void;
		onToggleRight?: () => void;
	}

	let {
		vaultId,
		onDocLoaded,
		leftCollapsed,
		rightCollapsed,
		onToggleLeft,
		onToggleRight
	}: Props = $props();

	let paneCount = $derived(Object.keys(workspace.panes).length);

	// Edge detection — only the panes that visually touch the left/right
	// edge of the workspace get the matching collapse chevron, so split
	// view doesn't show duplicate chevrons in the middle.
	function isAtLeftEdge(node: LayoutNode, paneId: string): boolean {
		if (node.kind === 'pane') return node.paneId === paneId;
		if (node.children.length === 0) return false;
		if (node.direction === 'row') return isAtLeftEdge(node.children[0], paneId);
		return node.children.some((c) => isAtLeftEdge(c, paneId));
	}
	function isAtRightEdge(node: LayoutNode, paneId: string): boolean {
		if (node.kind === 'pane') return node.paneId === paneId;
		if (node.children.length === 0) return false;
		if (node.direction === 'row') return isAtRightEdge(node.children[node.children.length - 1], paneId);
		return node.children.some((c) => isAtRightEdge(c, paneId));
	}
</script>

{#snippet renderNode(node: LayoutNode)}
	{#if node.kind === 'pane'}
		{@const pane = workspace.panes[node.paneId]}
		{#if pane}
			{@const atLeft = isAtLeftEdge(workspace.layout, pane.id)}
			{@const atRight = isAtRightEdge(workspace.layout, pane.id)}
			<Pane
				{vaultId}
				{pane}
				isActivePane={workspace.activePaneId === pane.id}
				canClose={paneCount > 1}
				{onDocLoaded}
				leftCollapsed={atLeft ? leftCollapsed : undefined}
				rightCollapsed={atRight ? rightCollapsed : undefined}
				onToggleLeft={atLeft ? onToggleLeft : undefined}
				onToggleRight={atRight ? onToggleRight : undefined}
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
