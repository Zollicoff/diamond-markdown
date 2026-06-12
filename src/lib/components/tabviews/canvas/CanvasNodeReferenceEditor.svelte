<script lang="ts">
	import type { CanvasNode } from '$lib/types';
	import {
		canvasFileOpenTarget,
		canvasLinkNodeHref,
		canvasNodeTitle,
		canvasOpenNodeLabel,
		type CanvasNodeRefDraft
	} from '$lib/canvas/view';

	interface Props {
		node: CanvasNode;
		refDraft: CanvasNodeRefDraft;
		refChanged: boolean;
		refCanSave: boolean;
		saving: boolean;
		deleting: boolean;
		disableDelete: boolean;
		onRefDraftChange: (node: CanvasNode, draft: CanvasNodeRefDraft) => void;
		onSaveRef: (node: CanvasNode) => void | Promise<void>;
		onOpenRef: (node: CanvasNode) => void;
		onDelete: (node: CanvasNode) => void | Promise<void>;
	}

	let {
		node,
		refDraft,
		refChanged,
		refCanSave,
		saving,
		deleting,
		disableDelete,
		onRefDraftChange,
		onSaveRef,
		onOpenRef,
		onDelete
	}: Props = $props();

	const title = $derived(canvasNodeTitle(node));
	const openNodeLabel = $derived(canvasOpenNodeLabel(node));
	const fileOpenTarget = $derived(canvasFileOpenTarget(node));
	const linkHref = $derived(canvasLinkNodeHref(node));
	const refKind = $derived(node.type === 'file' ? 'file' : 'URL');
	const refValueLabel = $derived(`Canvas ${refKind} ${node.type === 'file' ? 'path' : 'target'} for ${title}`);
	const refSaveLabel = $derived(`Save canvas ${refKind} node ${title}`);

	function updateRefValue(value: string): void {
		onRefDraftChange(node, { ...refDraft, value });
	}

	function updateRefLabel(label: string): void {
		onRefDraftChange(node, { ...refDraft, label });
	}
</script>

<div class="node-ref-fields">
	<label>
		<span>{node.type === 'file' ? 'Path' : 'URL'}</span>
		<input
			class="node-input"
			aria-label={refValueLabel}
			value={refDraft.value}
			oninput={(event) => updateRefValue((event.currentTarget as HTMLInputElement).value)}
		/>
	</label>
	<label>
		<span>Label</span>
		<input
			class="node-input"
			aria-label={`Canvas label for ${title}`}
			placeholder="optional"
			value={refDraft.label}
			oninput={(event) => updateRefLabel((event.currentTarget as HTMLInputElement).value)}
		/>
	</label>
</div>
<div class="node-actions">
	{#if node.type === 'file'}
		<button
			class="mini node-open"
			aria-label={openNodeLabel}
			disabled={!fileOpenTarget}
			onclick={() => onOpenRef(node)}
		>
			{fileOpenTarget?.actionLabel ?? 'Open file'}
		</button>
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
	.node-ref-fields {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-height: 0;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
		color: var(--fg-dim);
		font-size: 0.66rem;
		text-transform: uppercase;
	}
	.node-input {
		width: 100%;
		min-width: 0;
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 5px 7px;
		background: color-mix(in srgb, var(--bg), transparent 8%);
		color: var(--fg-muted);
		font: inherit;
		font-size: 0.74rem;
		text-transform: none;
	}
	.node-input:focus {
		outline: 2px solid color-mix(in srgb, var(--accent), transparent 55%);
		border-color: var(--accent);
	}
	.node-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		justify-content: flex-end;
	}
	.node-open,
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
