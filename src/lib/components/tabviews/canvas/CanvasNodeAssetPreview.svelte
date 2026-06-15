<script lang="ts">
	import type { CanvasFileAssetPreview } from '$lib/canvas/view';

	interface Props {
		assetPreview: CanvasFileAssetPreview;
	}

	let { assetPreview }: Props = $props();
</script>

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

<style>
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
</style>
