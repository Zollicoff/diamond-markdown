<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		html: string;
		onHostMount: (element: HTMLElement | null) => void;
		onClickPreview: (event: MouseEvent) => void;
		onAuxClickPreview: (event: MouseEvent) => void;
		onContextPreview: (event: MouseEvent) => void;
		onPointerOverPreview: (event: PointerEvent) => void;
		onPointerOutPreview: (event: PointerEvent) => void;
	}

	let {
		html,
		onHostMount,
		onClickPreview,
		onAuxClickPreview,
		onContextPreview,
		onPointerOverPreview,
		onPointerOutPreview
	}: Props = $props();
	let host: HTMLElement;

	onMount(() => {
		onHostMount(host);
		return () => onHostMount(null);
	});
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions - preview delegates clicks/context/hover to rendered markdown links. -->
<div
	bind:this={host}
	class="preview"
	onclick={onClickPreview}
	onauxclick={onAuxClickPreview}
	oncontextmenu={onContextPreview}
	onkeydown={() => {}}
	onpointerover={onPointerOverPreview}
	onpointerout={onPointerOutPreview}
	role="document"
	tabindex="-1"
>
	{@html html}
</div>

<style>
	.preview {
		padding: 40px 48px;
		overflow-y: auto;
		height: 100%;
		color: var(--fg);
		font-family: var(--sans);
		font-size: 17px;
		line-height: 1.7;
	}
	.preview :global(h1) { font-family: var(--sans); font-size: 2.2em; margin: 0 0 0.6em; line-height: 1.1; letter-spacing: -0.01em; }
	.preview :global(h2) { font-family: var(--sans); font-size: 1.6em; margin: 1.8em 0 0.5em; line-height: 1.15; }
	.preview :global(h3) { font-family: var(--sans); font-size: 1.3em; margin: 1.5em 0 0.4em; }
	.preview :global(h4) { font-size: 1.1em; margin: 1.3em 0 0.3em; font-family: var(--sans); font-weight: 700; }
	.preview :global(p) { margin: 0 0 1em; }
	.preview :global(ul), .preview :global(ol) { margin: 0 0 1em; padding-left: 1.4em; }
	.preview :global(li) { margin: 0.25em 0; }
	.preview :global(blockquote) {
		margin: 1em 0; padding: 0.4em 1em;
		border-left: 3px solid var(--border-strong);
		color: var(--fg-muted); font-style: italic;
	}
	.preview :global(code) {
		font-family: var(--mono);
		font-size: 0.9em;
		background: var(--bg-elev-2);
		padding: 1px 6px;
		border-radius: 4px;
	}
	.preview :global(pre) {
		background: var(--bg-elev);
		padding: 14px 16px;
		border-radius: 8px;
		overflow-x: auto;
		border: 1px solid var(--border);
	}
	.preview :global(pre code) {
		background: transparent;
		padding: 0;
		font-size: 0.88em;
	}
	.preview :global(table) {
		border-collapse: collapse;
		margin: 1em 0;
		font-family: var(--sans);
		font-size: 0.92em;
	}
	.preview :global(th), .preview :global(td) {
		border: 1px solid var(--border);
		padding: 6px 10px;
		text-align: left;
	}
	.preview :global(th) { background: var(--bg-elev); font-weight: 600; }
	.preview :global(hr) {
		border: 0;
		border-top: 1px solid var(--border);
		margin: 2em 0;
	}
	.preview :global(img) { max-width: 100%; border-radius: 6px; }
	.preview :global(.embed-attachment) {
		margin: 1em 0;
		max-width: 100%;
	}
	.preview :global(.embed-attachment figcaption) {
		margin-top: 6px;
		color: var(--fg-muted);
		font-size: 0.82rem;
	}
	.preview :global(.embed-audio audio), .preview :global(.embed-video video) {
		width: 100%;
		max-width: 100%;
	}
	.preview :global(.embed-video video) {
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg-elev);
	}
	.preview :global(.embed-file) {
		display: inline-flex;
		align-items: center;
		max-width: 100%;
		padding: 7px 10px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg-elev);
		text-decoration: none;
	}
	.preview :global(.embed-file-label) {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* -- Note embeds -------------------------------------------------- */
	.preview :global(.embed-note) {
		border: 1px solid var(--border);
		border-left: 3px solid var(--accent);
		border-radius: 6px;
		margin: 1em 0;
		background: var(--bg-elev);
		overflow: hidden;
	}
	.preview :global(.embed-note-head) {
		padding: 6px 14px;
		font-size: 0.78rem;
		font-family: var(--mono);
		color: var(--fg-dim);
		background: var(--bg-elev-2);
		border-bottom: 1px solid var(--border);
	}
	.preview :global(.embed-note-body) { padding: 12px 16px; }
	.preview :global(.embed-note-body > :first-child) { margin-top: 0; }
	.preview :global(.embed-note-body > :last-child) { margin-bottom: 0; }
	.preview :global(.embed-note.embed-cycle) {
		padding: 8px 14px;
		font-size: 0.85rem;
		color: var(--fg-dim);
		font-style: italic;
	}
	.preview :global(.embed-note.embed-cycle .hint) { font-size: 0.74rem; color: var(--fg-muted); margin-left: 6px; }
	.preview :global(.embed-broken) {
		color: var(--link-broken);
		font-style: italic;
		border-bottom: 1px dotted var(--link-broken);
	}

	/* -- Mermaid ------------------------------------------------------ */
	.preview :global(.mermaid-block) {
		margin: 1em 0;
		padding: 14px 16px;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		border-radius: 8px;
		text-align: center;
		overflow-x: auto;
	}
	.preview :global(.mermaid-block svg) { max-width: 100%; height: auto; }
	.preview :global(.mermaid-fallback) {
		color: var(--fg-muted);
		font-size: 0.85em;
		text-align: left;
		margin: 0;
	}

	/* -- Math and footnotes ------------------------------------------ */
	.preview :global(.math-error) {
		color: var(--link-broken);
		font-family: var(--mono);
		font-size: 0.92em;
	}
	.preview :global(.katex-display) { margin: 1em 0; }
	.preview :global(.footnotes) {
		margin-top: 3em;
		padding-top: 1.4em;
		border-top: 1px solid var(--border);
		font-size: 0.92em;
		color: var(--fg-muted);
	}
	.preview :global(.footnote-ref) {
		font-size: 0.78em;
		vertical-align: super;
		margin-left: 1px;
	}
	.preview :global(.footnote-backref) { margin-left: 4px; opacity: 0.6; }
	.preview :global(.footnote-backref:hover) { opacity: 1; }
</style>
