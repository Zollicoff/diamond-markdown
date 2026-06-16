<script lang="ts">
	import type { CanvasNode } from '$lib/types';
	import type { CanvasFileAssetPreview } from '$lib/canvas/view';
	import {
		canvasFileOpenTarget,
		canvasLinkNodeHref,
		canvasOpenNodeLabel
	} from '$lib/canvas/view';
	import CanvasNodeRemoveButton from './CanvasNodeRemoveButton.svelte';

	interface Props {
		node: CanvasNode;
		title: string;
		assetPreview: CanvasFileAssetPreview | null;
		refChanged: boolean;
		refCanSave: boolean;
		saving: boolean;
		deleting: boolean;
		disableDelete: boolean;
		onSaveRef: (node: CanvasNode) => void | Promise<void>;
		onOpenRef: (node: CanvasNode) => void;
		onDelete: (node: CanvasNode) => void | Promise<void>;
	}

	let {
		node,
		title,
		assetPreview,
		refChanged,
		refCanSave,
		saving,
		deleting,
		disableDelete,
		onSaveRef,
		onOpenRef,
		onDelete
	}: Props = $props();

	const openNodeLabel = $derived(canvasOpenNodeLabel(node));
	const fileOpenTarget = $derived(canvasFileOpenTarget(node));
	const linkHref = $derived(canvasLinkNodeHref(node));
	const refKind = $derived(node.type === 'file' ? 'file' : 'URL');
	const refSaveLabel = $derived(`Save canvas ${refKind} node ${title}`);
</script>

<div class="node-actions">
	{#if node.type === 'file'}
		{#if fileOpenTarget}
			<button
				class="mini node-open"
				aria-label={openNodeLabel}
				onclick={() => onOpenRef(node)}
			>
				{fileOpenTarget.actionLabel}
			</button>
		{:else if assetPreview}
			<a
				class="mini node-open"
				aria-label={`Open raw canvas asset ${assetPreview.path}`}
				href={assetPreview.href}
				target="_blank"
				rel="noopener noreferrer"
			>
				{assetPreview.actionLabel}
			</a>
		{:else}
			<button class="mini node-open" aria-label={openNodeLabel} disabled>Open file</button>
		{/if}
	{:else if linkHref}
		<a
			class="mini node-open"
			aria-label={openNodeLabel}
			href={linkHref}
			target="_blank"
			rel="noopener noreferrer"
		>
			Open URL
		</a>
	{/if}
	<button
		class="mini node-save"
		aria-label={refSaveLabel}
		disabled={saving || !refChanged || !refCanSave}
		onclick={() => void onSaveRef(node)}
	>
		{saving ? 'Saving...' : `Save ${node.type === 'file' ? 'file' : 'URL'}`}
	</button>
	<CanvasNodeRemoveButton {title} {deleting} {disableDelete} onRemove={() => onDelete(node)} />
</div>

<style>
	.node-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		justify-content: flex-end;
	}
	.node-open,
	.node-save {
		padding: 2px 7px;
		font-size: 0.7rem;
	}
	.mini {
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 3px 9px;
		color: var(--fg-muted);
		font: inherit;
		font-size: 0.76rem;
		text-decoration: none;
		white-space: nowrap;
	}
	.mini:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	.mini:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}
</style>
