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
	import CanvasNodeReferenceEditor from './CanvasNodeReferenceEditor.svelte';

	interface Props {
		node: CanvasNode;
		bounds: CanvasBounds;
		draft: string;
		changed: boolean;
		refDraft: CanvasNodeRefDraft;
		refChanged: boolean;
		refCanSave: boolean;
		saving: boolean;
		moving: boolean;
		deleting: boolean;
		disableDelete: boolean;
		onDraftChange: (node: CanvasNode, value: string) => void;
		onRefDraftChange: (node: CanvasNode, draft: CanvasNodeRefDraft) => void;
		onSave: (node: CanvasNode) => void | Promise<void>;
		onSaveRef: (node: CanvasNode) => void | Promise<void>;
		onOpenRef: (node: CanvasNode) => void;
		onDelete: (node: CanvasNode) => void | Promise<void>;
		onMovePointerDown: (node: CanvasNode, event: PointerEvent) => void;
	}

	let {
		node,
		bounds,
		draft,
		changed,
		refDraft,
		refChanged,
		refCanSave,
		saving,
		moving,
		deleting,
		disableDelete,
		onDraftChange,
		onRefDraftChange,
		onSave,
		onSaveRef,
		onOpenRef,
		onDelete,
		onMovePointerDown
	}: Props = $props();

	const title = $derived(canvasNodeTitle(node));
</script>

<article class={`${canvasNodeClass(node)}${moving ? ' moving' : ''}`} style={canvasNodeStyle(node, bounds)}>
	<div class="node-topline">
		<button
			type="button"
			class="node-drag-handle"
			aria-label={`Move canvas node ${title}`}
			title="Move canvas node"
			onpointerdown={(event) => onMovePointerDown(node, event)}
		></button>
		<div class="node-type">{node.type}</div>
	</div>
	<h3 title={title}>{title}</h3>
	{#if isCanvasGroupNode(node)}
		<div class="group-fill"></div>
		<div class="node-actions group-actions">
			<button
				class="mini node-remove"
				aria-label={`Remove canvas node ${title}`}
				disabled={disableDelete}
				onclick={() => void onDelete(node)}
			>
				{deleting ? 'Removing...' : 'Remove'}
			</button>
		</div>
	{:else if node.type === 'text'}
		<textarea
			class="node-editor"
			aria-label={`Canvas text for ${node.id}`}
			value={draft}
			oninput={(event) => onDraftChange(node, (event.currentTarget as HTMLTextAreaElement).value)}
		></textarea>
		<div class="node-actions">
			<button
				class="mini node-save"
				disabled={saving || !changed}
				onclick={() => void onSave(node)}
			>
				{saving ? 'Saving...' : 'Save text'}
			</button>
			<button
				class="mini node-remove"
				aria-label={`Remove canvas node ${title}`}
				disabled={disableDelete}
				onclick={() => void onDelete(node)}
			>
				{deleting ? 'Removing...' : 'Remove'}
			</button>
		</div>
	{:else if node.type === 'file' || node.type === 'link'}
		<CanvasNodeReferenceEditor
			{node}
			{refDraft}
			{refChanged}
			{refCanSave}
			{saving}
			{deleting}
			{disableDelete}
			{onRefDraftChange}
			{onSaveRef}
			{onOpenRef}
			{onDelete}
		/>
	{:else if canvasNodeBody(node)}
		<p>{canvasNodeBody(node)}</p>
		<div class="node-actions">
			<button
				class="mini node-remove"
				aria-label={`Remove canvas node ${title}`}
				disabled={disableDelete}
				onclick={() => void onDelete(node)}
			>
				{deleting ? 'Removing...' : 'Remove'}
			</button>
		</div>
	{:else}
		<p class="empty">No preview content</p>
		<div class="node-actions">
			<button
				class="mini node-remove"
				aria-label={`Remove canvas node ${title}`}
				disabled={disableDelete}
				onclick={() => void onDelete(node)}
			>
				{deleting ? 'Removing...' : 'Remove'}
			</button>
		</div>
	{/if}
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
	p {
		margin: 0;
		overflow: hidden;
		color: var(--fg-muted);
		font-size: 0.78rem;
		line-height: 1.35;
		white-space: pre-wrap;
	}
	.node-editor {
		flex: 1;
		min-height: 0;
		width: 100%;
		resize: none;
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 7px 8px;
		background: color-mix(in srgb, var(--bg), transparent 8%);
		color: var(--fg-muted);
		font: inherit;
		font-size: 0.78rem;
		line-height: 1.35;
	}
	.node-editor:focus {
		outline: 2px solid color-mix(in srgb, var(--accent), transparent 55%);
		border-color: var(--accent);
	}
	.node-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		justify-content: flex-end;
	}
	.group-fill {
		flex: 1;
		min-height: 0;
	}
	.group-actions {
		justify-content: flex-start;
	}
	.node-save,
	.node-remove {
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
	p.empty {
		color: var(--fg-dim);
		font-style: italic;
	}
</style>
