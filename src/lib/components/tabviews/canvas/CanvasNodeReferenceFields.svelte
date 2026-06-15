<script lang="ts">
	import type { CanvasNode } from '$lib/types';
	import type { CanvasNodeRefDraft } from '$lib/canvas/view';

	interface Props {
		node: CanvasNode;
		title: string;
		refDraft: CanvasNodeRefDraft;
		onRefDraftChange: (node: CanvasNode, draft: CanvasNodeRefDraft) => void;
	}

	let { node, title, refDraft, onRefDraftChange }: Props = $props();

	const refKind = $derived(node.type === 'file' ? 'file' : 'URL');
	const refValueLabel = $derived(`Canvas ${refKind} ${node.type === 'file' ? 'path' : 'target'} for ${title}`);

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
</style>
