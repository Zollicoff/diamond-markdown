<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { openNote, openTab } from '$lib/workspace/actions';
	import ContextMenu, { type MenuItem, type Position } from '$lib/components/ContextMenu.svelte';

	interface Props {
		html: string;
		vaultId?: string;
	}

	let { html, vaultId }: Props = $props();
	let host: HTMLElement;

	// Hover-preview state — popped when the user lingers on a wikilink.
	let hoverCard = $state<{ x: number; y: number; html: string } | null>(null);
	let hoverTimer: ReturnType<typeof setTimeout> | null = null;
	let hoverFetchAbort: AbortController | null = null;
	const previewCache = new Map<string, string>();

	let menuOpen = $state(false);
	let menuPos = $state<Position>({ x: 0, y: 0 });
	let menuItems = $state<MenuItem[]>([]);

	function pathFromHref(href: string): string | null {
		const m = /^\/vault\/[^/]+\/note\/(.+)$/.exec(href);
		return m ? decodeURIComponent(m[1]) : null;
	}

	function modeFor(e: MouseEvent): 'replace' | 'new-tab' | 'new-pane' {
		if (e.button === 1) return 'new-tab';
		if (e.metaKey || e.ctrlKey) return 'new-tab';
		if (e.altKey) return 'new-pane';
		return 'replace';
	}

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

		// Wikilink → modifier-aware open through the workspace store.
		if (a.classList.contains('wikilink') && vaultId) {
			const path = pathFromHref(href);
			if (path) {
				e.preventDefault();
				const title = path.split('/').pop()!.replace(/\.md$/, '');
				openNote(vaultId, path, title, modeFor(e));
				return;
			}
		}

		if (href.startsWith('#')) {
			e.preventDefault();
			const id = decodeURIComponent(href.slice(1));
			const el = document.getElementById(id);
			el?.scrollIntoView({ behavior: 'smooth' });
			return;
		}

		if (href.startsWith('/vault/')) {
			e.preventDefault();
			goto(href);
		}
	}

	function onAuxClick(e: MouseEvent): void {
		if (e.button !== 1) return; // middle-click only
		const a = (e.target as HTMLElement | null)?.closest('a');
		if (!a || !vaultId) return;
		const href = a.getAttribute('href');
		if (!href || !a.classList.contains('wikilink')) return;
		const path = pathFromHref(href);
		if (!path) return;
		e.preventDefault();
		const title = path.split('/').pop()!.replace(/\.md$/, '');
		openNote(vaultId, path, title, 'new-tab');
	}

	function onContext(e: MouseEvent): void {
		const a = (e.target as HTMLElement | null)?.closest('a');
		if (!a || !vaultId) return;
		const href = a.getAttribute('href');
		if (!href || !a.classList.contains('wikilink')) return;
		const path = pathFromHref(href);
		if (!path) return;
		e.preventDefault();
		const title = path.split('/').pop()!.replace(/\.md$/, '');
		menuPos = { x: e.clientX, y: e.clientY };
		menuItems = [
			{ label: 'Open',             icon: '→', action: () => openNote(vaultId, path, title, 'replace') },
			{ label: 'Open in new tab',  icon: '⎚', shortcut: '⌘click',   action: () => openNote(vaultId, path, title, 'new-tab') },
			{ label: 'Open in new pane', icon: '⊞', shortcut: 'alt+click', action: () => openNote(vaultId, path, title, 'new-pane') },
			{ separator: true, label: '' },
			{ label: 'Copy path',        icon: '⎘', action: async () => { await navigator.clipboard?.writeText(path).catch(() => {}); } }
		];
		menuOpen = true;
	}

	function clearHover(): void {
		if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
		hoverFetchAbort?.abort();
		hoverFetchAbort = null;
		hoverCard = null;
	}

	function onPointerOver(e: PointerEvent): void {
		if (!vaultId) return;
		const a = (e.target as HTMLElement | null)?.closest('a');
		if (!a || !a.classList.contains('wikilink')) { clearHover(); return; }
		const href = a.getAttribute('href');
		if (!href) return;
		const path = pathFromHref(href);
		if (!path) return; // broken wikilink — no preview to show
		// Position card just above the link so it doesn't cover what you're reading.
		const rect = a.getBoundingClientRect();
		const x = rect.left;
		const y = rect.top - 8; // pinned ABOVE; flipped below if it would overflow

		if (hoverTimer) clearTimeout(hoverTimer);
		hoverTimer = setTimeout(async () => {
			const cached = previewCache.get(path);
			if (cached) {
				hoverCard = { x, y, html: cached };
				return;
			}
			hoverFetchAbort?.abort();
			hoverFetchAbort = new AbortController();
			try {
				const res = await fetch(`/api/vaults/${vaultId}/preview?path=${encodeURIComponent(path)}`, { signal: hoverFetchAbort.signal });
				if (!res.ok) return;
				const data = await res.json() as { html: string };
				previewCache.set(path, data.html);
				hoverCard = { x, y, html: data.html };
			} catch { /* ignore aborts */ }
		}, 280);
	}

	function onPointerOut(e: PointerEvent): void {
		const to = e.relatedTarget as HTMLElement | null;
		// Stay open while moving into the card itself.
		if (to && to.closest('.hover-card')) return;
		clearHover();
	}

	// Mermaid: lazy-load + render every .mermaid-block whenever HTML changes.
	let mermaidLoaded: Promise<typeof import('mermaid').default> | null = null;
	function loadMermaid(): Promise<typeof import('mermaid').default> {
		if (!mermaidLoaded) {
			mermaidLoaded = import('mermaid').then((m) => {
				m.default.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });
				return m.default;
			});
		}
		return mermaidLoaded;
	}

	async function renderMermaidIn(root: HTMLElement): Promise<void> {
		const blocks = root.querySelectorAll<HTMLElement>('.mermaid-block:not([data-rendered])');
		if (blocks.length === 0) return;
		const mermaid = await loadMermaid();
		for (const block of blocks) {
			const enc = block.getAttribute('data-mermaid-source');
			if (!enc) continue;
			let source = '';
			try { source = atob(enc); } catch { continue; }
			const id = `mm-${Math.random().toString(36).slice(2, 9)}`;
			try {
				const { svg } = await mermaid.render(id, source);
				block.innerHTML = svg;
				block.setAttribute('data-rendered', '1');
			} catch (err) {
				block.innerHTML = `<pre class="mermaid-fallback">Mermaid error: ${(err as Error).message}\n\n${source.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!)}</pre>`;
				block.setAttribute('data-rendered', '1');
			}
		}
	}

	// After HTML changes: scroll to hash if URL has one, render mermaid blocks.
	$effect(() => {
		void html; // dep
		if (!host) return;
		queueMicrotask(() => {
			void renderMermaidIn(host);
			const hash = window.location.hash;
			if (hash && hash.length > 1) {
				const id = decodeURIComponent(hash.slice(1));
				const target = host.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null;
				target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
			}
		});
	});

	onMount(() => () => clearHover());
</script>

<div
	bind:this={host}
	class="preview"
	onclick={onClick}
	onauxclick={onAuxClick}
	oncontextmenu={onContext}
	onpointerover={onPointerOver}
	onpointerout={onPointerOut}
	role="article"
>
	{@html html}
</div>

{#if hoverCard}
	<div
		class="hover-card"
		style="left:{hoverCard.x}px;top:{hoverCard.y}px"
		onpointerleave={clearHover}
		role="tooltip"
	>
		<div class="hover-card-body">{@html hoverCard.html}</div>
	</div>
{/if}

{#if menuOpen}
	<ContextMenu items={menuItems} pos={menuPos} onClose={() => (menuOpen = false)} />
{/if}

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

	/* ── Note embeds ─────────────────────────────────────── */
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

	/* ── Mermaid ─────────────────────────────────────────── */
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

	/* ── Math (KaTeX overrides if any) ──────────────────── */
	.preview :global(.math-error) {
		color: var(--link-broken);
		font-family: var(--mono);
		font-size: 0.92em;
	}
	.preview :global(.katex-display) { margin: 1em 0; }

	/* ── Footnotes (marked-footnote output) ─────────────── */
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

	/* ── Hover preview card (wikilinks) ─────────────────── */
	.hover-card {
		position: fixed;
		z-index: 900;
		max-width: 420px;
		max-height: 320px;
		overflow-y: auto;
		background: var(--bg-elev);
		border: 1px solid var(--border-strong);
		border-radius: 8px;
		box-shadow: 0 10px 40px rgba(0,0,0,0.45);
		padding: 12px 16px;
		font-family: var(--sans);
		font-size: 14px;
		line-height: 1.55;
		color: var(--fg);
		transform: translate(0, -100%);
		pointer-events: auto;
	}
	.hover-card-body :global(h1),
	.hover-card-body :global(h2),
	.hover-card-body :global(h3) { font-size: 1em; margin: 0 0 0.4em; }
	.hover-card-body :global(p) { margin: 0 0 0.5em; }
	.hover-card-body :global(p:last-child) { margin-bottom: 0; }
</style>
