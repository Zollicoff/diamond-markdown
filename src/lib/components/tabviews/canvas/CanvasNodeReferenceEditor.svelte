<script lang="ts">
	import type { CanvasNode } from '$lib/types';
	import {
		canvasFileAssetPreview,
		canvasFileOpenTarget,
		canvasLinkNodeHref,
		canvasNodeTitle,
		canvasOpenNodeLabel,
		type CanvasNodeRefDraft
	} from '$lib/canvas/view';
	import CanvasNodeRemoveButton from './CanvasNodeRemoveButton.svelte';

	interface Props {
		vaultId: string;
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
		vaultId,
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
	const assetPreview = $derived(node.type === 'file' ? canvasFileAssetPreview(node, vaultId) : null);
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

	function updateRefSubpath(subpath: string): void {
		onRefDraftChange(node, { ...refDraft, subpath });
	}
</script>

{#if assetPreview}
	<a
		class={`asset-preview asset-preview-${assetPreview.kind}`}
		aria-label={`Preview raw canvas asset ${assetPreview.path}`}
		href={assetPreview.href}
		target="_blank"
		rel="noopener noreferrer"
	>
		{#if assetPreview.kind === 'image'}
			<img src={assetPreview.href} alt={`Canvas file preview ${assetPreview.path}`} loading="lazy" />
		{:else}
			<span class="asset-kind">{assetPreview.kind}</span>
			<span class="asset-title">{assetPreview.title}</span>
		{/if}
	</a>
{/if}
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
	{#if node.type === 'file'}
		<label>
			<span>Subpath</span>
			<input
				class="node-input"
				aria-label={`Canvas file subpath for ${title}`}
				placeholder="#Heading or #^block-id"
				value={refDraft.subpath}
				oninput={(event) => updateRefSubpath((event.currentTarget as HTMLInputElement).value)}
			/>
		</label>
	{/if}
</div>
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
	.asset-preview {
		display: grid;
		place-items: center;
		min-height: 44px;
		max-height: 86px;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: color-mix(in srgb, var(--bg), transparent 12%);
		color: var(--fg-muted);
		text-decoration: none;
	}
	.asset-preview:hover {
		border-color: var(--accent);
	}
	.asset-preview img {
		display: block;
		width: 100%;
		height: 100%;
		max-height: 86px;
		object-fit: cover;
	}
	.asset-preview-file,
	.asset-preview-pdf,
	.asset-preview-audio,
	.asset-preview-video {
		grid-template-columns: auto minmax(0, 1fr);
		gap: 8px;
		justify-content: start;
		padding: 8px;
	}
	.asset-kind {
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 2px 5px;
		color: var(--fg-dim);
		font-size: 0.62rem;
		text-transform: uppercase;
	}
	.asset-title {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.74rem;
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
