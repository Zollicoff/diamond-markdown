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
	import CanvasColorPalette from './CanvasColorPalette.svelte';
	import CanvasGroupNodeEditor from './CanvasGroupNodeEditor.svelte';
	import CanvasNodeFallbackBody from './CanvasNodeFallbackBody.svelte';
	import CanvasNodeReferenceEditor from './CanvasNodeReferenceEditor.svelte';
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
	<div class="node-topline">
		<button
			type="button"
			class="node-drag-handle"
			aria-label={`Move canvas node ${title}`}
			title="Move canvas node"
			onpointerdown={(event) => onMovePointerDown(node, event)}
		></button>
		<div class="node-type">{node.type}</div>
		<CanvasColorPalette
			kind="node"
			label={title}
			color={node.color}
			disabled={saving || moving || resizing || deleting || disableDelete}
			{saving}
			onColorChange={(color) => onColorChange(node, color)}
		/>
		<button
			type="button"
			class="node-duplicate"
			aria-label={`Duplicate canvas node ${title}`}
			disabled={disableDuplicate}
			onclick={() => void onDuplicate(node)}
		>
			{duplicating ? 'Duplicating...' : 'Duplicate'}
		</button>
	</div>
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
	<button
		type="button"
		class="node-resize-handle"
		aria-label={`Resize canvas node ${title}`}
		title="Resize canvas node"
		onpointerdown={(event) => onResizePointerDown(node, event)}
	></button>
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
	.node-topline {
		display: flex;
		align-items: center;
		gap: 7px;
		min-width: 0;
		flex-wrap: wrap;
	}
	.node-topline :global(.color-palette) {
		margin-left: auto;
	}
	.node-duplicate {
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 3px 8px;
		background: transparent;
		color: var(--fg-muted);
		font: inherit;
		font-size: 0.7rem;
		white-space: nowrap;
		cursor: pointer;
	}
	.node-duplicate:hover:not(:disabled),
	.node-duplicate:focus-visible {
		border-color: var(--accent);
		color: var(--accent);
		outline: none;
	}
	.node-duplicate:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}
	.node-drag-handle {
		position: relative;
		display: inline-grid;
		place-items: center;
		width: 22px;
		height: 22px;
		flex: 0 0 auto;
		border: 1px solid var(--border);
		border-radius: 5px;
		background: color-mix(in srgb, var(--bg), transparent 10%);
		cursor: grab;
	}
	.node-drag-handle::before {
		content: '';
		width: 3px;
		height: 3px;
		border-radius: 999px;
		background: var(--fg-dim);
		box-shadow:
			6px 0 0 var(--fg-dim),
			0 6px 0 var(--fg-dim),
			6px 6px 0 var(--fg-dim);
	}
	.node-drag-handle:hover {
		border-color: var(--accent);
	}
	.node-drag-handle:hover::before {
		background: var(--accent);
		box-shadow:
			6px 0 0 var(--accent),
			0 6px 0 var(--accent),
			6px 6px 0 var(--accent);
	}
	.node-drag-handle:active {
		cursor: grabbing;
	}
	.node-resize-handle {
		position: absolute;
		right: 5px;
		bottom: 5px;
		width: 18px;
		height: 18px;
		border: 1px solid color-mix(in srgb, var(--canvas-node-border, var(--border)), transparent 20%);
		border-radius: 4px;
		background:
			linear-gradient(135deg, transparent 47%, var(--fg-dim) 48%, var(--fg-dim) 54%, transparent 55%),
			color-mix(in srgb, var(--bg), transparent 8%);
		cursor: nwse-resize;
	}
	.node-resize-handle:hover,
	.node-resize-handle:focus-visible {
		border-color: var(--brand-cyan);
		background:
			linear-gradient(135deg, transparent 47%, var(--brand-cyan) 48%, var(--brand-cyan) 54%, transparent 55%),
			color-mix(in srgb, var(--bg), transparent 2%);
		outline: none;
	}
	.node-type {
		align-self: flex-start;
		border: 1px solid var(--border);
		border-color: color-mix(in srgb, var(--canvas-node-border, var(--border)), transparent 35%);
		border-radius: 999px;
		padding: 1px 7px;
		color: var(--canvas-node-type-color, var(--fg-dim));
		font-family: var(--mono);
		font-size: 0.65rem;
		text-transform: uppercase;
	}
	h3 {
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.86rem;
	}
</style>
