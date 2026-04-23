<script lang="ts">
	import type { PageData } from './$types';
	import { invalidate } from '$app/navigation';
	import { untrack } from 'svelte';
	import Editor from '$lib/components/Editor.svelte';
	import Preview from '$lib/components/Preview.svelte';
	import BacklinksPanel from '$lib/components/BacklinksPanel.svelte';

	let { data }: { data: PageData } = $props();

	type Mode = 'edit' | 'preview' | 'split';
	let mode = $state<Mode>('split');

	// Editor source of truth while editing. Re-seeded when the note changes.
	let content = $state(data.note.content);
	let dirty = $state(false);
	let saving = $state(false);
	let savedAt = $state<number | null>(null);
	let err = $state<string | null>(null);

	let lastLoadedPath = data.note.path;

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
			// Re-run page.server load — fresh html + backlinks.
			await invalidate(`/vault/${data.vault.id}/note/${data.note.path}`);
		} catch (e) {
			err = (e as Error).message;
		} finally {
			saving = false;
		}
	}

	// Auto-save 1.5s after idle.
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
	<header class="topbar">
		<div class="crumbs mono">{data.note.path}</div>
		<div class="tools">
			<div class="mode-group" role="tablist" aria-label="View mode">
				<button class:active={mode === 'edit'}    onclick={() => (mode = 'edit')}>Edit</button>
				<button class:active={mode === 'split'}   onclick={() => (mode = 'split')}>Split</button>
				<button class:active={mode === 'preview'} onclick={() => (mode = 'preview')}>Preview</button>
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

	<div class="body mode-{mode}">
		{#if mode !== 'preview'}
			<div class="pane edit-pane">
				<Editor value={content} onChange={onContentChange} onSave={save} />
			</div>
		{/if}
		{#if mode !== 'edit'}
			<div class="pane preview-pane">
				<Preview html={data.note.html} />
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
		padding: 10px 16px;
		border-bottom: 1px solid var(--border);
		gap: 16px;
	}
	.crumbs {
		color: var(--fg-muted);
		font-size: 0.82rem;
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
		padding: 4px 12px;
		border-radius: 4px;
		font-size: 0.82rem;
		cursor: pointer;
	}
	.mode-group button.active { background: var(--bg); color: var(--accent); }
	.save-status {
		display: flex; align-items: center; gap: 10px;
		font-size: 0.82rem;
		color: var(--fg-dim);
	}
	.status.saving { color: var(--fg-muted); }
	.status.dirty { color: var(--accent); font-size: 1.2em; line-height: 1; }
	.status.saved { color: var(--success); }
	.status.err { color: var(--danger); }
	.btn {
		padding: 4px 12px;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		border-radius: 5px;
		color: var(--fg);
		font-size: 0.82rem;
		cursor: pointer;
	}
	.btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
	.btn:disabled { opacity: 0.4; cursor: default; }

	.body {
		flex: 1;
		min-height: 0;
		display: grid;
		overflow: hidden;
	}
	.body.mode-edit    { grid-template-columns: 1fr; }
	.body.mode-preview { grid-template-columns: 1fr; }
	.body.mode-split   { grid-template-columns: 1fr 1fr; }

	.pane { overflow: hidden; min-height: 0; }
	.edit-pane { border-right: 1px solid var(--border); }
	.body.mode-edit .edit-pane { border-right: 0; }

	.right-panel {
		overflow: hidden;
		background: var(--bg-elev);
	}
</style>
