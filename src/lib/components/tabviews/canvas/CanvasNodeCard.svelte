<script lang="ts">
	import type { CanvasNode } from '$lib/types';
	import {
		canvasNodeBody,
		canvasNodeClass,
		canvasNodeStyle,
		canvasNodeTitle,
		isCanvasGroupNode,
		type CanvasBounds,
		type CanvasNodeRefDraft
	} from '$lib/canvas/view';
	import type {
		CanvasTextEmbedResolver,
		CanvasTextWikilinkResolver
	} from '$lib/canvas/text-preview';
	import {
		canvasNotePreviewForNode,
		type CanvasNotePreviewMap
	} from '$lib/canvas/note-previews';
	import CanvasGroupNodeEditor from './CanvasGroupNodeEditor.svelte';
	import CanvasNodeFallbackBody from './CanvasNodeFallbackBody.svelte';
	import CanvasNodeHeader from './CanvasNodeHeader.svelte';
	import CanvasNodeReferenceEditor from './CanvasNodeReferenceEditor.svelte';
	import CanvasNodeResizeHandle from './CanvasNodeResizeHandle.svelte';
	import CanvasTextNodeEditor from './CanvasTextNodeEditor.svelte';

	interface Props {
		vaultId: string;
		sourcePath: string;
		node: CanvasNode;
		bounds: CanvasBounds;
		draft: string;
		changed: boolean;
		groupLabelDraft: string;
		groupLabelChanged: boolean;
		groupLabelCanSave: boolean;
		refDraft: CanvasNodeRefDraft;
		refChanged: boolean;
		refCanSave: boolean;
		notePreviews: CanvasNotePreviewMap;
		resolveEmbedTarget: CanvasTextEmbedResolver;
		resolveWikilinkTarget: CanvasTextWikilinkResolver;
		saving: boolean;
		duplicating: boolean;
		moving: boolean;
		resizing: boolean;
		deleting: boolean;
		disableDuplicate: boolean;
		disableDelete: boolean;
		onDraftChange: (node: CanvasNode, value: string) => void;
		onGroupLabelDraftChange: (node: CanvasNode, value: string) => void;
		onRefDraftChange: (node: CanvasNode, draft: CanvasNodeRefDraft) => void;
		onSave: (node: CanvasNode) => void | Promise<void>;
		onSaveGroupLabel: (node: CanvasNode) => void | Promise<void>;
		onSaveRef: (node: CanvasNode) => void | Promise<void>;
		onOpenRef: (node: CanvasNode) => void;
		onColorChange: (node: CanvasNode, color: string) => void | Promise<void>;
		onDuplicate: (node: CanvasNode) => void | Promise<void>;
		onDelete: (node: CanvasNode) => void | Promise<void>;
		onMovePointerDown: (node: CanvasNode, event: PointerEvent) => void;
		onResizePointerDown: (node: CanvasNode, event: PointerEvent) => void;
	}

	let {
		vaultId,
		sourcePath,
		node,
		bounds,
		draft,
		changed,
		groupLabelDraft,
		groupLabelChanged,
		groupLabelCanSave,
		refDraft,
		refChanged,
		refCanSave,
		notePreviews,
		resolveEmbedTarget,
		resolveWikilinkTarget,
		saving,
		duplicating,
		moving,
		resizing,
		deleting,
		disableDuplicate,
		disableDelete,
		onDraftChange,
		onGroupLabelDraftChange,
		onRefDraftChange,
		onSave,
		onSaveGroupLabel,
		onSaveRef,
		onOpenRef,
		onColorChange,
		onDuplicate,
		onDelete,
		onMovePointerDown,
		onResizePointerDown
	}: Props = $props();

	const title = $derived(canvasNodeTitle(node));
	const body = $derived(canvasNodeBody(node));
</script>

<article class={`${canvasNodeClass(node)}${moving ? ' moving' : ''}${resizing ? ' resizing' : ''}`} style={canvasNodeStyle(node, bounds)}>
	<CanvasNodeHeader
		{node}
		{title}
		{saving}
		{moving}
		{resizing}
		{deleting}
		{duplicating}
		{disableDuplicate}
		{disableDelete}
		{onMovePointerDown}
		{onColorChange}
		{onDuplicate}
	/>
	<h3 title={title}>{title}</h3>
	{#if isCanvasGroupNode(node)}
		<CanvasGroupNodeEditor
			{node}
			{groupLabelDraft}
			{groupLabelChanged}
			{groupLabelCanSave}
			{saving}
			{deleting}
			{disableDelete}
			{onGroupLabelDraftChange}
			{onSaveGroupLabel}
			{onDelete}
		/>
	{:else if node.type === 'text'}
		<CanvasTextNodeEditor
			{vaultId}
			{sourcePath}
			{node}
			{draft}
			{changed}
			{resolveEmbedTarget}
			{resolveWikilinkTarget}
			{saving}
			{deleting}
			{disableDelete}
			{onDraftChange}
			{onSave}
			{onDelete}
		/>
	{:else if node.type === 'file' || node.type === 'link'}
		<CanvasNodeReferenceEditor
			{vaultId}
			{node}
			notePreview={canvasNotePreviewForNode(node, notePreviews)}
			{refDraft}
			{refChanged}
			{refCanSave}
			{resolveEmbedTarget}
			{resolveWikilinkTarget}
			{saving}
			{deleting}
			{disableDelete}
			{onRefDraftChange}
			{onSaveRef}
			{onOpenRef}
			{onDelete}
		/>
	{:else}
		<CanvasNodeFallbackBody
			{title}
			{body}
			{deleting}
			{disableDelete}
			onDelete={() => onDelete(node)}
		/>
	{/if}
	<CanvasNodeResizeHandle {node} {title} {onResizePointerDown} />
</article>

<style>
	.canvas-node {
		position: absolute;
		display: flex;
		flex-direction: column;
		gap: 6px;
		overflow: hidden;
		padding: 12px;
		border: 1px solid var(--border-strong);
		border-radius: 7px;
		background: color-mix(in srgb, var(--bg-elev), var(--bg) 20%);
		background: var(--canvas-node-bg, color-mix(in srgb, var(--bg-elev), var(--bg) 20%));
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.22);
		z-index: 1;
	}
	.canvas-node-text {
		border-color: var(--canvas-node-border, color-mix(in srgb, var(--accent), var(--border-strong) 70%));
	}
	.canvas-node.moving {
		z-index: 3;
		border-color: var(--accent);
		box-shadow: 0 12px 34px rgba(0, 0, 0, 0.28), 0 0 0 1px color-mix(in srgb, var(--accent), transparent 50%);
	}
	.canvas-node.resizing {
		z-index: 3;
		border-color: var(--brand-cyan);
		box-shadow: 0 12px 34px rgba(0, 0, 0, 0.28), 0 0 0 1px color-mix(in srgb, var(--brand-cyan), transparent 50%);
	}
	.canvas-node-file {
		border-color: var(--canvas-node-border, var(--border-strong));
		border-style: dashed;
	}
	.canvas-node-link {
		border-color: var(--canvas-node-border, color-mix(in srgb, var(--brand-cyan), var(--border-strong) 60%));
	}
	.canvas-node-group {
		border-color: var(--canvas-node-border, color-mix(in srgb, var(--accent), var(--border-strong) 75%));
		border-style: dashed;
		background: var(--canvas-node-bg, color-mix(in srgb, var(--bg-elev), transparent 42%));
		box-shadow: none;
		z-index: 0;
	}
	.canvas-node-group h3 {
		color: var(--canvas-node-type-color, var(--fg-muted));
		font-size: 0.78rem;
	}
	h3 {
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.86rem;
	}
</style>
