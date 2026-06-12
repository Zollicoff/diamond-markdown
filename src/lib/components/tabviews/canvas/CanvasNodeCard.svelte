<script lang="ts">
	import type { CanvasNode } from '$lib/types';
	import {
		canvasNodeBody,
		canvasNodeClass,
		canvasNodeTitle,
		nodeStyle,
		type CanvasBounds
	} from '$lib/canvas/view';

	interface Props {
		node: CanvasNode;
		bounds: CanvasBounds;
		draft: string;
		changed: boolean;
		saving: boolean;
		onDraftChange: (node: CanvasNode, value: string) => void;
		onSave: (node: CanvasNode) => void | Promise<void>;
	}

	let { node, bounds, draft, changed, saving, onDraftChange, onSave }: Props = $props();
</script>

<article class={canvasNodeClass(node)} style={nodeStyle(node, bounds)}>
	<div class="node-type">{node.type}</div>
	<h3 title={canvasNodeTitle(node)}>{canvasNodeTitle(node)}</h3>
	{#if node.type === 'text'}
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
		</div>
	{:else if canvasNodeBody(node)}
		<p>{canvasNodeBody(node)}</p>
	{:else}
		<p class="empty">No preview content</p>
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
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.22);
	}
	.canvas-node-text {
		border-color: color-mix(in srgb, var(--accent), var(--border-strong) 70%);
	}
	.canvas-node-file {
		border-style: dashed;
	}
	.canvas-node-link {
		border-color: color-mix(in srgb, var(--brand-cyan), var(--border-strong) 60%);
	}
	.node-type {
		align-self: flex-start;
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 1px 7px;
		color: var(--fg-dim);
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
		justify-content: flex-end;
	}
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
	p.empty {
		color: var(--fg-dim);
		font-style: italic;
	}
</style>
