<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import Editor from '$lib/components/editor/Editor.svelte';
	import Preview from '$lib/components/editor/Preview.svelte';
	import EditorToolbar from '$lib/components/editor/EditorToolbar.svelte';
	import type { EditorApi } from '$lib/editor/commands';
	import type { LinkResolver } from '$lib/editor/live-preview';
	import type { NoteDoc } from '$lib/types';
	import { api } from '$lib/vault-api';
	import { on as onBus, emit as emitBus } from '$lib/events';
	import { openNote } from '$lib/workspace/actions';
	import ContextMenu, { type MenuItem, type Position } from '$lib/components/ContextMenu.svelte';
	import { READING_SPEED_WPM } from '$lib/util/constants';

	interface Props {
		vaultId: string;
		path: string;
		mode: 'live' | 'source' | 'read';
		isFocused: boolean;
		/** Called when this view emits an update the parent cares about
		 *  (e.g. backlinks refreshed, title from frontmatter). */
		onDocLoaded?: (doc: NoteDoc) => void;
		/** Called when the user picks a new view mode in the topbar. The
		 *  pane owns the mode state so it survives note switches inside
		 *  the same tab. */
		onModeChange?: (m: 'live' | 'source' | 'read') => void;
	}

	let { vaultId, path, mode, isFocused, onDocLoaded, onModeChange }: Props = $props();

	let doc = $state<NoteDoc | null>(null);
	let content = $state('');
	let dirty = $state(false);
	let saving = $state(false);
	let savedAt = $state<number | null>(null);
	let err = $state<string | null>(null);
	let editorApi = $state<EditorApi | null>(null);

	let loadedPath: string | null = null;
	let loadedVault: string | null = null;

	async function load(): Promise<void> {
		try {
			const d = await api.note(vaultId, path);
			doc = d;
			content = d.content;
			dirty = false;
			err = null;
			loadedPath = path;
			loadedVault = vaultId;
			onDocLoaded?.(d);
		} catch (e) {
			err = (e as Error).message;
		}
	}

	$effect(() => {
		// Reload whenever the note we're showing changes.
		if (path !== loadedPath || vaultId !== loadedVault) {
			untrack(() => {
				doc = null;
				void load();
			});
		}
	});

	// Refresh when a sibling saves the same note, or this note is renamed.
	$effect(() => {
		const offs = [
			onBus('note:saved', (e) => {
				if (e.vaultId === vaultId && e.path === path && !saving && !dirty) {
					void load();
				}
			}),
			onBus('note:renamed', (e) => {
				if (e.vaultId === vaultId && e.from === path) {
					setTimeout(() => void load(), 0);
				}
			}),
			onBus('template:insert', (e) => {
				// Only the focused note view should consume the template insert.
				if (e.vaultId !== vaultId || !isFocused) return;
				editorApi?.insert(e.content);
			})
		];
		return () => offs.forEach((off) => off());
	});

	async function save(): Promise<void> {
		if (saving || !doc) return;
		saving = true;
		err = null;
		try {
			await api.saveNote(vaultId, path, content);
			dirty = false;
			savedAt = Date.now();
			// Refresh for fresh html + backlinks.
			await load();
		} catch (e) {
			err = (e as Error).message;
		} finally {
			saving = false;
		}
	}

	let idleTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		if (!dirty) return;
		if (idleTimer) clearTimeout(idleTimer);
		idleTimer = setTimeout(save, 1500);
		return () => { if (idleTimer) clearTimeout(idleTimer); };
	});

	function onContentChange(v: string): void {
		if (v === content) return;
		content = v;
		dirty = true;
	}

	const resolveLink: LinkResolver = (target: string) => {
		if (!doc) return { resolved: false };
		const t = target.trim().toLowerCase();
		for (const link of doc.outgoingLinks) {
			if (link.resolved && (link.target.toLowerCase() === t || link.resolved.toLowerCase() === t)) {
				return { resolved: true, href: `/vault/${vaultId}/note/${encodeURI(link.resolved)}` };
			}
		}
		for (const b of doc.backlinks) {
			if (b.path.toLowerCase() === t || b.title.toLowerCase() === t) {
				return { resolved: true, href: `/vault/${vaultId}/note/${encodeURI(b.path)}` };
			}
		}
		return { resolved: false };
	};

	function modeFor(e: MouseEvent): 'replace' | 'new-tab' | 'new-pane' {
		if (e.button === 1) return 'new-tab';
		if (e.metaKey || e.ctrlKey) return 'new-tab';
		if (e.altKey) return 'new-pane';
		return 'replace';
	}

	function handleWikilinkClick(target: string, href: string | null, resolved: boolean, e: MouseEvent): void {
		if (resolved && href) {
			const noteTitle = target.split('/').pop()!.replace(/\.md$/, '');
			const notePath = href.replace(`/vault/${vaultId}/note/`, '');
			openNote(vaultId, decodeURIComponent(notePath), noteTitle, modeFor(e));
			return;
		}
		const createPath = confirm(`Create note "${target}"?`)
			? (target.endsWith('.md') ? target : `${target}.md`)
			: null;
		if (!createPath) return;
		goto(`/vault/${vaultId}/note/${encodeURI(createPath)}`);
	}

	let menuOpen = $state(false);
	let menuPos = $state<Position>({ x: 0, y: 0 });
	let menuItems = $state<MenuItem[]>([]);

	function handleWikilinkContext(target: string, href: string | null, resolved: boolean, e: MouseEvent): void {
		if (!resolved || !href) return;
		const noteTitle = target.split('/').pop()!.replace(/\.md$/, '');
		const notePath = decodeURIComponent(href.replace(`/vault/${vaultId}/note/`, ''));
		menuPos = { x: e.clientX, y: e.clientY };
		menuItems = [
			{ label: 'Open',             icon: '→', action: () => openNote(vaultId, notePath, noteTitle, 'replace') },
			{ label: 'Open in new tab',  icon: '⎚', shortcut: '⌘click',   action: () => openNote(vaultId, notePath, noteTitle, 'new-tab') },
			{ label: 'Open in new pane', icon: '⊞', shortcut: 'alt+click', action: () => openNote(vaultId, notePath, noteTitle, 'new-pane') },
			{ separator: true, label: '' },
			{ label: 'Copy path',        icon: '⎘', action: async () => { await navigator.clipboard?.writeText(notePath).catch(() => {}); } }
		];
		menuOpen = true;
	}

	const wordCount = $derived.by<number>(() => {
		// Strip frontmatter, then count word-shaped tokens.
		const stripped = content.replace(/^---[\s\S]*?\n---\s*\n/, '').replace(/`[^`]*`/g, ' ').replace(/```[\s\S]*?```/g, ' ');
		const m = stripped.match(/[\p{L}\p{N}'-]+/gu);
		return m ? m.length : 0;
	});

	const readingTime = $derived<string>(
		wordCount === 0 ? '' : `${Math.max(1, Math.round(wordCount / READING_SPEED_WPM))} min`
	);

	function fmtSaved(ms: number | null): string {
		if (!ms) return '';
		const d = Date.now() - ms;
		if (d < 2000) return 'just saved';
		return `saved ${Math.round(d / 1000)}s ago`;
	}
</script>

<div class="note-view">
	<header class="topbar">
		<div class="crumbs mono">{path}</div>
		<div class="save-status">
			{#if wordCount > 0}
				<span class="meta mono" title="Word count · estimated reading time">{wordCount} words · {readingTime}</span>
			{/if}
			<div class="mode-group" role="tablist" aria-label="View mode">
				<button class:active={mode === 'live'}   onclick={() => onModeChange?.('live')}   role="tab" aria-selected={mode === 'live'}>Live</button>
				<button class:active={mode === 'source'} onclick={() => onModeChange?.('source')} role="tab" aria-selected={mode === 'source'}>Source</button>
				<button class:active={mode === 'read'}   onclick={() => onModeChange?.('read')}   role="tab" aria-selected={mode === 'read'}>Read</button>
			</div>
			{#if saving}<span class="status saving">saving…</span>
			{:else if err}<span class="status err" title={err}>error</span>
			{:else if dirty}<span class="status dirty">●</span>
			{:else if savedAt}<span class="status saved">{fmtSaved(savedAt)}</span>{/if}
			<button
				class="btn"
				onclick={() => emitBus('history:open', { vaultId, path })}
				title="Show version history"
				aria-label="Show version history"
			>⏱</button>
			<button class="btn" onclick={save} disabled={!dirty || saving}>Save</button>
		</div>
	</header>

	{#if mode !== 'read'}
		<EditorToolbar api={editorApi} />
	{/if}

	<div class="body">
		{#if !doc}
			<div class="loading">Loading…</div>
		{:else if mode === 'read'}
			<Preview html={doc.html} {vaultId} />
		{:else}
			<Editor
				value={content}
				mode={mode as 'live' | 'source'}
				{resolveLink}
				onChange={onContentChange}
				onSave={save}
				onWikilinkClick={handleWikilinkClick}
				onWikilinkContext={handleWikilinkContext}
				onReady={(a) => (editorApi = a)}
			/>
		{/if}
	</div>
</div>

{#if menuOpen}
	<ContextMenu items={menuItems} pos={menuPos} onClose={() => (menuOpen = false)} />
{/if}

<style>
	.note-view { display: flex; flex-direction: column; height: 100%; min-height: 0; }
	.topbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 6px 14px;
		border-bottom: 1px solid var(--border);
		gap: 16px;
		background: var(--bg);
	}
	.crumbs { color: var(--fg-muted); font-size: 0.78rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
	.save-status { display: flex; align-items: center; gap: 10px; font-size: 0.78rem; color: var(--fg-dim); }
	.meta { font-size: 0.74rem; color: var(--fg-muted); white-space: nowrap; }

	.mode-group { display: flex; gap: 2px; background: var(--bg); border: 1px solid var(--border); padding: 2px; border-radius: 6px; }
	.mode-group button {
		background: transparent;
		border: 0;
		color: var(--fg-muted);
		padding: 2px 9px;
		border-radius: 4px;
		font-size: 0.74rem;
		cursor: pointer;
		font-family: inherit;
	}
	.mode-group button:hover { color: var(--fg); }
	.mode-group button.active { background: var(--bg-elev); color: var(--accent); }
	.status.saving { color: var(--fg-muted); }
	.status.dirty  { color: var(--accent); font-size: 1.2em; line-height: 1; }
	.status.saved  { color: var(--success); }
	.status.err    { color: var(--danger); }
	.btn {
		padding: 3px 12px;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		border-radius: 5px;
		color: var(--fg);
		font-size: 0.78rem;
		cursor: pointer;
	}
	.btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
	.btn:disabled { opacity: 0.4; cursor: default; }

	.body { flex: 1; min-height: 0; overflow: hidden; }
	.loading { padding: 2rem; color: var(--fg-dim); }
	.mono { font-family: var(--mono); }
</style>
