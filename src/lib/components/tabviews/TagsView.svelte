<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/vault-api';
	import { on as onBus } from '$lib/events';
	import { openNote } from '$lib/workspace/actions';

	interface Props {
		vaultId: string;
		filter?: string;
	}

	let { vaultId, filter }: Props = $props();

	let allTags = $state<{ tag: string; count: number }[]>([]);
	let tagNotes = $state<{ path: string; title: string }[]>([]);
	let loading = $state(false);
	let err = $state<string | null>(null);
	let query = $state('');

	const filteredAll = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return allTags;
		return allTags.filter((t) => t.tag.toLowerCase().includes(q));
	});

	async function loadAll(): Promise<void> {
		loading = true; err = null;
		try {
			allTags = await api.tags(vaultId);
		} catch (e) {
			err = (e as Error).message;
		} finally {
			loading = false;
		}
	}

	async function loadTagNotes(tag: string): Promise<void> {
		loading = true; err = null;
		try {
			tagNotes = await api.notesByTag(vaultId, tag);
		} catch (e) {
			err = (e as Error).message;
		} finally {
			loading = false;
		}
	}

	function openTag(tag: string): void {
		// Update URL-less state: reuse this tab with a filter.
		filter = tag;
	}

	function clearFilter(): void {
		filter = undefined;
		tagNotes = [];
	}

	function pickNote(path: string, title: string): void {
		openNote(vaultId, path, title, 'replace');
	}

	$effect(() => {
		if (filter) {
			void loadTagNotes(filter);
		}
	});

	onMount(() => {
		void loadAll();
		const offs = [
			onBus('note:saved', (e) => { if (e.vaultId === vaultId) void (filter ? loadTagNotes(filter) : loadAll()); }),
			onBus('note:created', (e) => { if (e.vaultId === vaultId) void loadAll(); }),
			onBus('note:deleted', (e) => { if (e.vaultId === vaultId) void loadAll(); }),
			onBus('note:renamed', (e) => { if (e.vaultId === vaultId) void loadAll(); })
		];
		return () => offs.forEach((o) => o());
	});
</script>

<div class="tags-view">
	{#if !filter}
		<header class="head">
			<h1>Tags</h1>
			<input
				type="search"
				placeholder="Filter tags…"
				bind:value={query}
				spellcheck="false"
				autocomplete="off"
			/>
		</header>
		{#if loading}
			<p class="status">Loading…</p>
		{:else if err}
			<p class="err">{err}</p>
		{:else if filteredAll.length === 0}
			<p class="empty">{allTags.length === 0 ? 'No tags in this vault yet.' : 'No tags match.'}</p>
		{:else}
			<ul class="tag-cloud">
				{#each filteredAll as t (t.tag)}
					<li>
						<button class="tag" onclick={() => openTag(t.tag)}>
							<span class="hash">#</span>
							<span class="name">{t.tag}</span>
							<span class="count mono">{t.count}</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	{:else}
		<header class="head">
			<button class="back" onclick={clearFilter} aria-label="Back to all tags">‹ All tags</button>
			<h1><span class="hash">#</span>{filter}</h1>
			<span class="count mono">{tagNotes.length} {tagNotes.length === 1 ? 'note' : 'notes'}</span>
		</header>
		{#if loading}
			<p class="status">Loading…</p>
		{:else if err}
			<p class="err">{err}</p>
		{:else if tagNotes.length === 0}
			<p class="empty">No notes tagged #{filter}.</p>
		{:else}
			<ul class="note-list">
				{#each tagNotes as n (n.path)}
					<li>
						<button class="note" onclick={() => pickNote(n.path, n.title)}>
							<span class="title">{n.title}</span>
							<span class="path mono">{n.path}</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>

<style>
	.tags-view {
		max-width: 820px;
		margin: 0 auto;
		padding: 2rem 1.5rem 3rem;
		height: 100%;
		overflow-y: auto;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
	}
	h1 {
		font-family: 'Bricolage Grotesque', var(--sans);
		font-size: 1.6rem;
		font-weight: 600;
		margin: 0;
		color: var(--fg);
	}
	.hash { color: var(--fg-dim); margin-right: 1px; }
	.head input[type='search'] {
		flex: 1;
		min-width: 180px;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 7px 10px;
		color: var(--fg);
		font: inherit;
		font-size: 0.88rem;
	}
	.head input[type='search']:focus { outline: 2px solid #7dd3fc; border-color: transparent; }

	.back {
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 4px 9px;
		color: var(--fg-muted);
		cursor: pointer;
		font: inherit;
		font-size: 0.82rem;
	}
	.back:hover { color: var(--accent); border-color: var(--accent); }

	.status, .empty, .err { color: var(--fg-dim); font-size: 0.9rem; }
	.err { color: var(--danger); }

	.tag-cloud {
		list-style: none; padding: 0; margin: 0;
		display: flex; flex-wrap: wrap; gap: 8px;
	}
	.tag-cloud li { padding: 0; }
	.tag {
		display: inline-flex; align-items: center; gap: 6px;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 6px 12px 6px 10px;
		color: var(--fg);
		cursor: pointer;
		font: inherit;
		font-size: 0.88rem;
		transition: border-color 0.15s, background 0.15s;
	}
	.tag:hover { border-color: var(--accent); background: var(--bg-hover); }
	.tag .name { font-weight: 500; }
	.tag .count {
		font-size: 0.72rem;
		color: var(--fg-dim);
		background: var(--bg);
		border-radius: 999px;
		padding: 1px 7px;
		min-width: 18px;
		text-align: center;
	}

	.note-list {
		list-style: none; padding: 0; margin: 0;
		display: flex; flex-direction: column; gap: 2px;
	}
	.note-list li { padding: 0; }
	.note {
		display: flex; flex-direction: column; gap: 2px;
		width: 100%;
		background: transparent; border: 0;
		padding: 8px 12px;
		border-radius: 6px;
		color: inherit;
		text-align: left;
		cursor: pointer;
		font: inherit;
	}
	.note:hover { background: var(--bg-hover); }
	.note .title { font-size: 0.94rem; color: var(--fg); font-weight: 500; }
	.note .path { font-size: 0.76rem; color: var(--fg-dim); }
	.mono { font-family: var(--mono); font-variant-numeric: tabular-nums; }
</style>
