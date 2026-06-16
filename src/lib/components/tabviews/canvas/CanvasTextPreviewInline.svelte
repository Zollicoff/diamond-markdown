<script lang="ts">
	import {
		canvasTextEmbedHref,
		canvasTextInlineTargetHref,
		type CanvasTextPreviewInline as CanvasTextPreviewInlinePart
	} from '$lib/canvas/text-preview';
	import { openCanvas, openNote } from '$lib/workspace/actions';
	import { replaceLocationHash } from '$lib/workspace/hash';
	import { openModeForPointer } from '$lib/workspace/open-mode';

	interface Props {
		vaultId: string;
		parts: CanvasTextPreviewInlinePart[];
	}

	let { vaultId, parts }: Props = $props();

	function openInternalInline(part: CanvasTextPreviewInlinePart, event: MouseEvent): void {
		const target = part.target;
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

{#each parts as part}
	{#if part.kind === 'strong'}
		<strong>{part.text}</strong>
	{:else if part.kind === 'emphasis'}
		<em>{part.text}</em>
	{:else if part.kind === 'code'}
		<code>{part.text}</code>
	{:else if part.kind === 'strikethrough'}
		<del>{part.text}</del>
	{:else if part.kind === 'highlight'}
		<mark>{part.text}</mark>
	{:else if part.kind === 'image' && part.embed}
		{@const href = canvasTextEmbedHref(vaultId, part.embed)}
		{#if href}
			<img
				class="inline-image"
				src={href}
				alt={part.embed.alt ?? part.embed.title}
				width={part.embed.width ?? undefined}
				height={part.embed.height ?? undefined}
				loading="lazy"
			/>
		{:else}
			{part.text}
		{/if}
	{:else if part.kind === 'wikilink'}
		{@const href = canvasTextInlineTargetHref(vaultId, part)}
		{#if href}
			<a class="wikilink" href={href} onclick={(event) => openInternalInline(part, event)}>[[{part.text}]]</a>
		{:else}
			<span class="wikilink">[[{part.text}]]</span>
		{/if}
	{:else if part.kind === 'link'}
		{@const href = canvasTextInlineTargetHref(vaultId, part) ?? part.href}
		{#if part.target && href}
			<a href={href} onclick={(event) => openInternalInline(part, event)}>{part.text}</a>
		{:else if href}
			<a href={href} target="_blank" rel="noopener noreferrer">{part.text}</a>
		{:else}
			{part.text}
		{/if}
	{:else}
		{part.text}
	{/if}
{/each}

<style>
	code {
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 0 3px;
		background: color-mix(in srgb, var(--bg), transparent 10%);
		color: var(--fg);
		font-family: var(--mono);
		font-size: 0.7rem;
	}
	del {
		color: var(--fg-dim);
		text-decoration-thickness: 1.5px;
	}
	mark {
		border-radius: 3px;
		padding: 0 3px;
		background: color-mix(in srgb, #facc15, transparent 72%);
		color: var(--fg);
	}
	.inline-image {
		display: inline-block;
		max-width: min(100%, 150px);
		max-height: 84px;
		margin: 1px 2px;
		border: 1px solid color-mix(in srgb, var(--canvas-node-border, var(--border)), transparent 48%);
		border-radius: 5px;
		background: color-mix(in srgb, var(--bg), transparent 6%);
		object-fit: contain;
		vertical-align: middle;
	}
	a,
	.wikilink {
		color: var(--accent);
		text-decoration: none;
	}
</style>
