<script lang="ts">
	import {
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
	{:else if part.kind === 'wikilink'}
		{@const href = canvasTextInlineTargetHref(vaultId, part)}
		{#if href}
			<a class="wikilink" href={href} onclick={(event) => openInternalInline(part, event)}>[[{part.text}]]</a>
		{:else}
			<span class="wikilink">[[{part.text}]]</span>
		{/if}
	{:else if part.kind === 'link' && part.href}
		<a href={part.href} target="_blank" rel="noopener noreferrer">{part.text}</a>
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
	a,
	.wikilink {
		color: var(--accent);
		text-decoration: none;
	}
</style>
