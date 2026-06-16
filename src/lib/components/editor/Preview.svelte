<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { openNote, openTab } from '$lib/workspace/actions';
	import { openModeForPointer } from '$lib/workspace/open-mode';
	import { replaceLocationHash } from '$lib/workspace/hash';
	import { noteTargetFromVaultHref, noteTitleFromPath, type NoteHrefTarget } from '$lib/note/view';
	import { listMarkdownPostprocessors } from '$lib/plugins/extensions.svelte';
	import ContextMenu, { type MenuItem, type Position } from '$lib/components/ContextMenu.svelte';
	import type { NoteDoc } from '$lib/types';
	import MarkdownSurface from './MarkdownSurface.svelte';
	import PreviewHoverCard from './PreviewHoverCard.svelte';

	interface Props {
		html: string;
		vaultId?: string;
		doc?: NoteDoc;
		readableLineLength?: boolean;
	}

	let { html, vaultId, doc, readableLineLength = false }: Props = $props();
	let host = $state<HTMLElement | null>(null);
	const markdownPostprocessors = $derived(vaultId ? listMarkdownPostprocessors(vaultId) : []);

	// Hover-preview state — popped when the user lingers on a wikilink.
	let hoverCard = $state<{ x: number; y: number; html: string } | null>(null);
	let hoverTimer: ReturnType<typeof setTimeout> | null = null;
	let hoverFetchAbort: AbortController | null = null;
	const previewCache = new Map<string, string>();

	let menuOpen = $state(false);
	let menuPos = $state<Position>({ x: 0, y: 0 });
	let menuItems = $state<MenuItem[]>([]);

	function setHost(element: HTMLElement | null): void {
		host = element;
	}

	function scrollToHashTarget(hash: string | null): void {
		if (!hash || !host) return;
		const el = host.querySelector(`#${CSS.escape(hash)}`) as HTMLElement | null;
		el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	function openLinkedNote(target: NoteHrefTarget, mode: ReturnType<typeof openModeForPointer>): void {
		replaceLocationHash(target.hash);
		openNote(vaultId!, target.path, noteTitleFromPath(target.path), mode);
		if (target.hash && doc?.path === target.path) {
			queueMicrotask(() => scrollToHashTarget(target.hash));
		}
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
			const target = noteTargetFromVaultHref(vaultId, href);
			if (target) {
				e.preventDefault();
				openLinkedNote(target, openModeForPointer(e));
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
		const target = noteTargetFromVaultHref(vaultId, href);
		if (!target) return;
		e.preventDefault();
		openLinkedNote(target, 'new-tab');
	}

	function onContext(e: MouseEvent): void {
		const a = (e.target as HTMLElement | null)?.closest('a');
		if (!a || !vaultId) return;
		const href = a.getAttribute('href');
		if (!href || !a.classList.contains('wikilink')) return;
		const target = noteTargetFromVaultHref(vaultId, href);
		if (!target) return;
		e.preventDefault();
		menuPos = { x: e.clientX, y: e.clientY };
		menuItems = [
			{ label: 'Open',             icon: '→', action: () => openLinkedNote(target, 'replace') },
			{ label: 'Open in new tab',  icon: '⎚', shortcut: '⌘click',   action: () => openLinkedNote(target, 'new-tab') },
			{ label: 'Open in new pane', icon: '⊞', shortcut: 'alt+click', action: () => openLinkedNote(target, 'new-pane') },
			{ separator: true, label: '' },
			{ label: 'Copy path',        icon: '⎘', action: async () => { await navigator.clipboard?.writeText(target.path).catch(() => {}); } }
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
		const target = noteTargetFromVaultHref(vaultId, href);
		if (!target) return; // broken wikilink — no preview to show
		// Position card just above the link so it doesn't cover what you're reading.
		const rect = a.getBoundingClientRect();
		const x = rect.left;
		const y = rect.top - 8; // pinned ABOVE; flipped below if it would overflow

		if (hoverTimer) clearTimeout(hoverTimer);
		hoverTimer = setTimeout(async () => {
			const cached = previewCache.get(target.path);
			if (cached) {
				hoverCard = { x, y, html: cached };
				return;
			}
			hoverFetchAbort?.abort();
			hoverFetchAbort = new AbortController();
			try {
				const res = await fetch(`/api/vaults/${vaultId}/preview?path=${encodeURIComponent(target.path)}`, { signal: hoverFetchAbort.signal });
				if (!res.ok) return;
				const data = await res.json() as { html: string };
				previewCache.set(target.path, data.html);
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

	function applyCleanup(fn: (() => void) | void, cleanups: (() => void)[], disposed: boolean): void {
		if (typeof fn !== 'function') return;
		if (disposed) {
			try { fn(); } catch (e) { console.error('[plugins] markdown cleanup failed:', e); }
			return;
		}
		cleanups.push(fn);
	}

	// After HTML changes: render mermaid blocks, run plugin postprocessors, then scroll to hash.
	$effect(() => {
		void html; // dep
		const currentHost = host;
		const processors = markdownPostprocessors;
		if (!currentHost) return;
		let disposed = false;
		const cleanups: (() => void)[] = [];
		queueMicrotask(() => {
			void (async () => {
				if (disposed) return;
				await renderMermaidIn(currentHost);
				if (disposed) return;
				if (vaultId && doc) {
					for (const processor of processors) {
						try {
							const result = await processor.process(currentHost, {
								vaultId,
								pluginId: processor.pluginId,
								extensionId: processor.localId,
								processorId: processor.localId,
								doc,
								root: currentHost
							});
							applyCleanup(result as void | (() => void), cleanups, disposed);
						} catch (e) {
							console.error(`[plugin:${processor.pluginId}] markdown postprocessor failed:`, e);
						}
					}
				}
				if (disposed) return;
				const hash = window.location.hash;
				if (hash && hash.length > 1) {
					const id = decodeURIComponent(hash.slice(1));
					const el = currentHost.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null;
					el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
				}
			})();
		});
		return () => {
			disposed = true;
			for (const cleanup of cleanups.splice(0)) {
				try { cleanup(); } catch (e) { console.error('[plugins] markdown cleanup failed:', e); }
			}
		};
	});

	onMount(() => () => clearHover());
</script>

<MarkdownSurface
	{html}
	{readableLineLength}
	onHostMount={setHost}
	onClickPreview={onClick}
	onAuxClickPreview={onAuxClick}
	onContextPreview={onContext}
	onPointerOverPreview={onPointerOver}
	onPointerOutPreview={onPointerOut}
/>

{#if hoverCard}
	<PreviewHoverCard x={hoverCard.x} y={hoverCard.y} html={hoverCard.html} onLeave={clearHover} />
{/if}

{#if menuOpen}
	<ContextMenu items={menuItems} pos={menuPos} onClose={() => (menuOpen = false)} />
{/if}
