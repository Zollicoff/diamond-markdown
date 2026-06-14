<script lang="ts">
	import type { CanvasNode } from '$lib/types';
	import { canvasNodeTitle } from '$lib/canvas/view';
	import type {
		CanvasTextEmbedResolver,
		CanvasTextWikilinkResolver
	} from '$lib/canvas/text-preview';
	import CanvasTextPreview from './CanvasTextPreview.svelte';

	interface Props {
		vaultId: string;
		node: CanvasNode;
		draft: string;
		changed: boolean;
		resolveEmbedTarget: CanvasTextEmbedResolver;
		resolveWikilinkTarget: CanvasTextWikilinkResolver;
		saving: boolean;
		deleting: boolean;
		disableDelete: boolean;
		onDraftChange: (node: CanvasNode, value: string) => void;
		onSave: (node: CanvasNode) => void | Promise<void>;
		onDelete: (node: CanvasNode) => void | Promise<void>;
	}

	let {
		vaultId,
		node,
		draft,
		changed,
		resolveEmbedTarget,
		resolveWikilinkTarget,
		saving,
		deleting,
		disableDelete,
		onDraftChange,
		onSave,
		onDelete
	}: Props = $props();

	const title = $derived(canvasNodeTitle(node));
</script>

<div class="text-node-content">
	<CanvasTextPreview
		{vaultId}
		nodeId={node.id}
		{draft}
		{resolveEmbedTarget}
		{resolveWikilinkTarget}
	/>
	<textarea
		class="node-editor"
		aria-label={`Canvas text for ${node.id}`}
		value={draft}
		oninput={(event) => onDraftChange(node, (event.currentTarget as HTMLTextAreaElement).value)}
	></textarea>
</div>
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

<style>
	.text-node-content {
		display: flex;
		min-height: 0;
		flex: 1;
		flex-direction: column;
		gap: 6px;
		overflow: hidden;
	}
	.node-editor {
		min-height: 34px;
		width: 100%;
		flex: 1 1 42px;
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
</style>
