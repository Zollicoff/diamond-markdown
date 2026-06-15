<script lang="ts">
	import type { CanvasNotePreview } from '$lib/types';
	import type {
		CanvasTextEmbedResolver,
		CanvasTextWikilinkResolver
	} from '$lib/canvas/text-preview';
	import CanvasTextPreview from './CanvasTextPreview.svelte';

	interface Props {
		vaultId: string;
		nodeId: string;
		notePreview: CanvasNotePreview;
		resolveEmbedTarget: CanvasTextEmbedResolver;
		resolveWikilinkTarget: CanvasTextWikilinkResolver;
	}

	let {
		vaultId,
		nodeId,
		notePreview,
		resolveEmbedTarget,
		resolveWikilinkTarget
	}: Props = $props();
</script>

<section class="note-preview-card" aria-label={`Canvas note preview ${notePreview.path}`}>
	<div class="note-preview-head">
		<span>Note preview</span>
		{#if notePreview.truncated}
			<span class="note-preview-state">truncated</span>
		{/if}
	</div>
	{#if notePreview.status === 'ok'}
		<CanvasTextPreview
			{vaultId}
			sourcePath={notePreview.path}
			nodeId={`file-preview-${nodeId}`}
			draft={notePreview.body}
			{resolveEmbedTarget}
			{resolveWikilinkTarget}
			emptyLabel="Empty note"
		/>
	{:else}
		<p class="note-preview-status">{notePreview.detail ?? 'Preview unavailable'}</p>
	{/if}
</section>

<style>
	.note-preview-card {
		display: grid;
		gap: 5px;
		min-height: 0;
		border: 1px solid color-mix(in srgb, var(--canvas-node-border, var(--border)), transparent 48%);
		border-radius: 6px;
		padding: 6px;
		background: color-mix(in srgb, var(--bg-elev), transparent 35%);
	}
	.note-preview-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		color: var(--fg-dim);
		font-size: 0.62rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.note-preview-state {
		color: var(--canvas-node-border, var(--accent));
	}
	.note-preview-card :global(.canvas-text-preview) {
		max-height: 58px;
		padding: 5px 6px;
		font-size: 0.7rem;
	}
	.note-preview-status {
		margin: 0;
		color: var(--fg-dim);
		font-size: 0.72rem;
	}
</style>
