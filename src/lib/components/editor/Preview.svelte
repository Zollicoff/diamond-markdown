<script lang="ts">
	import { goto } from '$app/navigation';
	import { openTab } from '$lib/workspace/actions';

	interface Props {
		html: string;
		vaultId?: string;
	}

	let { html, vaultId }: Props = $props();
	let host: HTMLElement;

	// Intercept internal link clicks — use SvelteKit nav instead of full reload.
	function onClick(e: MouseEvent): void {
		const target = e.target as HTMLElement;
		const a = target.closest('a');
		if (!a) return;
		const href = a.getAttribute('href');
		if (!href) return;
		// Tag links → open the tags tab filtered to that tag.
		if (a.classList.contains('tag') && vaultId) {
			const m = /\/vault\/[^/]+\/tag\/(.+)$/.exec(href);
			if (m) {
				e.preventDefault();
				const tag = decodeURIComponent(m[1]);
				openTab(vaultId, { id: `tags:${tag}`, kind: 'tags', title: `#${tag}`, filter: tag }, 'replace');
				return;
			}
		}
		if (href.startsWith('/vault/') || href.startsWith('#')) {
			e.preventDefault();
			if (href.startsWith('#')) {
				const id = decodeURIComponent(href.slice(1));
				const el = document.getElementById(id);
				el?.scrollIntoView({ behavior: 'smooth' });
			} else {
				goto(href);
			}
		}
	}
</script>

<div bind:this={host} class="preview" onclick={onClick} role="article">
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
</style>
