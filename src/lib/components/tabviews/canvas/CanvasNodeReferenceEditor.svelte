<script lang="ts">
	import type { CanvasNode, CanvasNotePreview } from '$lib/types';
	import type {
		CanvasTextEmbedResolver,
		CanvasTextWikilinkResolver
	} from '$lib/canvas/text-preview';
	import {
		canvasFileAssetPreview,
		canvasNodeTitle,
		type CanvasNodeRefDraft
	} from '$lib/canvas/view';
	import CanvasNodeAssetPreview from './CanvasNodeAssetPreview.svelte';
	import CanvasNodeNotePreview from './CanvasNodeNotePreview.svelte';
	import CanvasNodeReferenceActions from './CanvasNodeReferenceActions.svelte';
	import CanvasNodeReferenceFields from './CanvasNodeReferenceFields.svelte';

	interface Props {
		vaultId: string;
		node: CanvasNode;
		notePreview: CanvasNotePreview | null;
		refDraft: CanvasNodeRefDraft;
		refChanged: boolean;
		refCanSave: boolean;
		resolveEmbedTarget: CanvasTextEmbedResolver;
		resolveWikilinkTarget: CanvasTextWikilinkResolver;
		saving: boolean;
		deleting: boolean;
		disableDelete: boolean;
		onRefDraftChange: (node: CanvasNode, draft: CanvasNodeRefDraft) => void;
		onSaveRef: (node: CanvasNode) => void | Promise<void>;
		onOpenRef: (node: CanvasNode) => void;
		onDelete: (node: CanvasNode) => void | Promise<void>;
	}

	let {
		vaultId,
		node,
		notePreview,
		refDraft,
		refChanged,
		refCanSave,
		resolveEmbedTarget,
		resolveWikilinkTarget,
		saving,
		deleting,
		disableDelete,
		onRefDraftChange,
		onSaveRef,
		onOpenRef,
		onDelete
	}: Props = $props();

	const title = $derived(canvasNodeTitle(node));
	const assetPreview = $derived(node.type === 'file' ? canvasFileAssetPreview(node, vaultId) : null);
</script>

{#if assetPreview}
	<CanvasNodeAssetPreview {assetPreview} />
{/if}
{#if notePreview}
	<CanvasNodeNotePreview
		{vaultId}
		nodeId={node.id}
		{notePreview}
		{resolveEmbedTarget}
		{resolveWikilinkTarget}
	/>
{/if}
<CanvasNodeReferenceFields {node} {title} {refDraft} {onRefDraftChange} />
<CanvasNodeReferenceActions
	{node}
	{title}
	{assetPreview}
	{refChanged}
	{refCanSave}
	{saving}
	{deleting}
	{disableDelete}
	{onSaveRef}
	{onOpenRef}
	{onDelete}
/>
