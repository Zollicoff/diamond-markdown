<script lang="ts">
	import type { PageData } from './$types';
	import { invalidate, goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import Editor from '$lib/components/Editor.svelte';
	import Preview from '$lib/components/Preview.svelte';
	import BacklinksPanel from '$lib/components/BacklinksPanel.svelte';
	import EditorToolbar from '$lib/components/EditorToolbar.svelte';
	import TabBar from '$lib/components/TabBar.svelte';
	import type { LinkResolver } from '$lib/editor/live-preview';
	import type { EditorApi } from '$lib/editor/commands';
	import { tabsStore } from '$lib/tabs.svelte';

	let { data }: { data: PageData } = $props();

	type Mode = 'live' | 'source' | 'read';
	let mode = $state<Mode>('live');

	let content = $state(data.note.content);
	let dirty = $state(false);
	let saving = $state(false);
	let savedAt = $state<number | null>(null);
	let err = $state<string | null>(null);
	let editorApi = $state<EditorApi | null>(null);

	let lastLoadedPath = data.note.path;

	$effect(() => {
		// Register (or refresh title on) the active tab whenever the note changes.
		const title = (data.note.frontmatter?.title as string | undefined) ?? data.note.path.split('/').pop()!.replace(/\.md$/, '');
		tabsStore.open(data.vault.id, data.note.path, title);
	});

	$effect(() => {
		if (data.note.path !== lastLoadedPath) {
			untrack(() => {
				content = data.note.content;
				dirty = false;
				err = null;
				lastLoadedPath = data.note.path;
			});
		}
	});

	const knownLinks = $derived(() => {
		const out = new Map<string, string>();
		for (const link of data.note.outgoingLinks) {
			if (link.resolved) out.set(link.target.toLowerCase(), link.resolved);
		}
		for (const b of data.note.backlinks) {
			out.set(b.title.toLowerCase(), b.path);
			out.set(b.path.toLowerCase(), b.path);
		}
		return out;
	});

	const resolveLink: LinkResolver = (target: string) => {
		const resolvedPath = knownLinks().get(target.trim().toLowerCase());
		if (!resolvedPath) return { resolved: false };
		return {
			resolved: true,
			href: `/vault/${data.vault.id}/note/${encodeURI(resolvedPath)}`
		};
	};

	function handleWikilinkClick(target: string, href: string | null, resolved: boolean): void {
		if (resolved && href) {
			goto(href);
			return;
		}
		const newPath = confirm(`Create note "${target}"?`)
			? (target.endsWith('.md') ? target : `${target}.md`)
			: null;
		if (!newPath) return;
		goto(`/vault/${data.vault.id}/note/${encodeURI(newPath)}`);
	}

	async function save(): Promise<void> {
		if (saving) return;
		saving = true;
		err = null;
		try {
			const res = await fetch(`/api/vaults/${data.vault.id}/note`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ path: data.note.path, content })
			});
			if (!res.ok) {
				const body = await res.text();
				err = `Save failed: HTTP ${res.status} ${body.slice(0, 120)}`;
				return;
			}
			dirty = false;
			savedAt = Date.now();
			await invalidate(`/vault/${data.vault.id}/note/${data.note.path}`);
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

	function fmtSaved(ms: number | null): string {
		if (!ms) return '';
		const d = Date.now() - ms;
		if (d < 2000) return 'just saved';
		return `saved ${Math.round(d / 1000)}s ago`;
	}
</script>

<svelte:head>
	<title>{data.note.frontmatter?.title ?? data.note.path.replace(/\.md$/, '')} — {data.vault.name}</title>
</svelte:head>

<div class="page">
	<TabBar vaultId={data.vault.id} activePath={data.note.path} />

	<header class="topbar">
		<div class="crumbs mono">{data.note.path}</div>
		<div class="tools">
			<div class="mode-group" role="tablist" aria-label="View mode">
				<button class:active={mode === 'live'}   onclick={() => (mode = 'live')}>Live</button>
				<button class:active={mode === 'source'} onclick={() => (mode = 'source')}>Source</button>
				<button class:active={mode === 'read'}   onclick={() => (mode = 'read')}>Read</button>
			</div>
			<div class="save-status">
				{#if saving}
					<span class="status saving">saving…</span>
				{:else if err}
					<span class="status err" title={err}>error</span>
				{:else if dirty}
					<span class="status dirty">●</span>
				{:else if savedAt}
					<span class="status saved">{fmtSaved(savedAt)}</span>
				{/if}
				<button class="btn" onclick={save} disabled={!dirty || saving}>Save</button>
			</div>
		</div>
	</header>

	{#if mode !== 'read'}
		<EditorToolbar api={editorApi} />
	{/if}

	<div class="body">
		{#if mode === 'read'}
			<div class="pane preview-pane">
				<Preview html={data.note.html} />
			</div>
		{:else}
			<div class="pane edit-pane">
				<Editor
					value={content}
					mode={mode as 'live' | 'source'}
					{resolveLink}
					onChange={onContentChange}
					onSave={save}
					onWikilinkClick={handleWikilinkClick}
					onReady={(api) => (editorApi = api)}
				/>
			</div>
		{/if}
	</div>
</div>

<div class="right-panel">
	<BacklinksPanel
		vaultId={data.vault.id}
		backlinks={data.note.backlinks}
		outgoing={data.note.outgoingLinks}
		tags={data.note.tags}
	/>
</div>

<style>
	:global(.content) {
		display: grid;
		grid-template-columns: 1fr 280px;
		height: 100vh;
		overflow: hidden;
	}

	.page {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border-right: 1px solid var(--border);
	}

	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 16px;
		border-bottom: 1px solid var(--border);
		gap: 16px;
	}
	.crumbs {
		color: var(--fg-muted);
		font-size: 0.8rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}
	.tools {
		display: flex;
		gap: 12px;
		align-items: center;
	}
	.mode-group {
		display: flex; gap: 2px;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		padding: 2px;
		border-radius: 6px;
	}
	.mode-group button {
		background: transparent;
		border: 0;
		color: var(--fg-muted);
		padding: 3px 10px;
		border-radius: 4px;
		font-size: 0.8rem;
		cursor: pointer;
	}
	.mode-group button.active { background: var(--bg); color: var(--accent); }
	.save-status {
		display: flex; align-items: center; gap: 10px;
		font-size: 0.8rem;
		color: var(--fg-dim);
	}
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
		font-size: 0.8rem;
		cursor: pointer;
	}
	.btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
	.btn:disabled { opacity: 0.4; cursor: default; }

	.body {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}
	.pane { height: 100%; overflow: hidden; min-height: 0; }

	.right-panel {
		overflow: hidden;
		background: var(--bg-elev);
	}
</style>
