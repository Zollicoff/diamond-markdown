<script lang="ts">
	import {
		canvasTextPreviewBlocks,
		type CanvasTextEmbedResolver,
		type CanvasTextWikilinkResolver
	} from '$lib/canvas/text-preview';
	import CanvasTextPreviewBlocks from './CanvasTextPreviewBlocks.svelte';

	interface Props {
		vaultId: string;
		sourcePath: string;
		nodeId: string;
		draft: string;
		resolveEmbedTarget: CanvasTextEmbedResolver;
		resolveWikilinkTarget: CanvasTextWikilinkResolver;
	}

	let {
		vaultId,
		sourcePath,
		nodeId,
		draft,
		resolveEmbedTarget,
		resolveWikilinkTarget
	}: Props = $props();

	const previewBlocks = $derived(canvasTextPreviewBlocks(draft, { resolveEmbedTarget, resolveWikilinkTarget, sourcePath }));
</script>

<div class="canvas-text-preview" aria-label={`Canvas text preview for ${nodeId}`}>
	<CanvasTextPreviewBlocks {vaultId} blocks={previewBlocks} />
</div>

<style>
	.canvas-text-preview {
		flex: 0 1 auto;
		max-height: 86px;
		overflow: auto;
		border: 1px solid color-mix(in srgb, var(--canvas-node-border, var(--border)), transparent 45%);
		border-radius: 6px;
		padding: 6px 7px;
		background: color-mix(in srgb, var(--bg-elev), transparent 24%);
		color: var(--fg-muted);
		font-size: 0.75rem;
		line-height: 1.35;
	}
	.canvas-text-preview :global(*) {
		max-width: 100%;
	}
</style>
