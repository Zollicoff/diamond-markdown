<script lang="ts">
	import {
		canvasTextEmbedHref,
		canvasTextEmbedOpenTarget,
		canvasTextEmbedRouteHref,
		type CanvasTextPreviewEmbed
	} from '$lib/canvas/text-preview';
	import { openCanvas, openNote } from '$lib/workspace/actions';
	import { replaceLocationHash } from '$lib/workspace/hash';
	import { openModeForPointer } from '$lib/workspace/open-mode';

	interface Props {
		vaultId: string;
		embed: CanvasTextPreviewEmbed;
	}

	let { vaultId, embed }: Props = $props();

	const href = $derived(canvasTextEmbedHref(vaultId, embed));
	const routeHref = $derived(canvasTextEmbedRouteHref(vaultId, embed));

	function openInternalEmbed(event: MouseEvent): void {
		const target = canvasTextEmbedOpenTarget(embed);
		if (!target) return;
		event.preventDefault();
		if (target.kind === 'canvas') {
			openCanvas(vaultId, target.path, target.title, openModeForPointer(event));
			return;
		}
		replaceLocationHash(target.hash);
		openNote(vaultId, target.path, target.title, openModeForPointer(event));
	}
</script>

{#if routeHref}
	<a
		class={`preview-embed preview-embed-${embed.kind}`}
		href={routeHref}
		onclick={openInternalEmbed}
	>
		<span>{embed.title}</span>
		<small>{embed.kind.toUpperCase()}</small>
	</a>
{:else if href}
	{#if embed.kind === 'image'}
		<figure class="preview-embed preview-embed-image">
			<img
				src={href}
				alt={embed.alt ?? embed.title}
				width={embed.width ?? undefined}
				height={embed.height ?? undefined}
				loading="lazy"
			/>
			<figcaption>{embed.title}</figcaption>
		</figure>
	{:else}
		<a class={`preview-embed preview-embed-${embed.kind}`} href={href} target="_blank" rel="noopener noreferrer">
			<span>{embed.title}</span>
			<small>{embed.kind.toUpperCase()}</small>
		</a>
	{/if}
{/if}

<style>
	.preview-embed {
		margin: 0 0 5px;
	}
	.preview-embed:last-child {
		margin-bottom: 0;
	}
	.preview-embed-image {
		display: grid;
		gap: 4px;
	}
	.preview-embed-image img {
		display: block;
		max-width: min(100%, 240px);
		max-height: 120px;
		border: 1px solid color-mix(in srgb, var(--canvas-node-border, var(--border)), transparent 48%);
		border-radius: 6px;
		background: color-mix(in srgb, var(--bg), transparent 6%);
		object-fit: contain;
	}
	.preview-embed-image figcaption {
		overflow: hidden;
		color: var(--fg-dim);
		font-size: 0.66rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	a.preview-embed {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		border: 1px solid color-mix(in srgb, var(--canvas-node-border, var(--border)), transparent 45%);
		border-radius: 6px;
		padding: 6px 7px;
		background: color-mix(in srgb, var(--bg-elev), transparent 24%);
		color: var(--accent);
		text-decoration: none;
	}
	a.preview-embed span {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	a.preview-embed small {
		flex: 0 0 auto;
		color: var(--fg-dim);
		font-family: var(--mono);
		font-size: 0.58rem;
	}
</style>
