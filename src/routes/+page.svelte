<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import Wordmark from '$lib/components/Wordmark.svelte';

	let { data }: { data: PageData } = $props();

	let addOpen = $state(false);
	let newName = $state('');
	let newPath = $state('');
	let adding = $state(false);
	let err = $state<string | null>(null);

	// Recent notes across all vaults — read the tab stores for each vault
	// directly from localStorage. No server trip.
	interface Recent { vaultId: string; vaultName: string; path: string; title: string; }
	let recent = $state<Recent[]>([]);

	onMount(() => {
		const out: Recent[] = [];
		for (const v of data.vaults) {
			try {
				const raw = localStorage.getItem(`diamond.tabs.${v.id}`);
				if (!raw) continue;
				const arr = JSON.parse(raw) as { path: string; title: string }[];
				// Most recently stored = last entry in the tabs list.
				for (const t of arr.slice().reverse()) {
					out.push({ vaultId: v.id, vaultName: v.name, path: t.path, title: t.title });
					if (out.length >= 8) break;
				}
				if (out.length >= 8) break;
			} catch { /* skip */ }
		}
		recent = out;
	});

	async function addVault(): Promise<void> {
		if (!newName.trim() || !newPath.trim()) return;
		adding = true; err = null;
		try {
			const res = await fetch('/api/vaults', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name: newName.trim(), path: newPath.trim() })
			});
			if (!res.ok) {
				const d = await res.json().catch(() => ({}));
				err = d?.message ?? `HTTP ${res.status}`;
				return;
			}
			const { vault } = await res.json();
			goto(`/vault/${vault.id}`);
		} catch (e) {
			err = (e as Error).message;
		} finally {
			adding = false;
		}
	}

	function relTime(ms: number | null | undefined): string {
		if (!ms) return '';
		const diff = Date.now() - ms;
		const m = 60_000, h = 60 * m, d = 24 * h, w = 7 * d, mo = 30 * d, y = 365 * d;
		if (diff < m) return 'just now';
		if (diff < h)  return `${Math.round(diff / m)}m ago`;
		if (diff < d)  return `${Math.round(diff / h)}h ago`;
		if (diff < w)  return `${Math.round(diff / d)}d ago`;
		if (diff < mo) return `${Math.round(diff / w)}w ago`;
		if (diff < y)  return `${Math.round(diff / mo)}mo ago`;
		return `${Math.round(diff / y)}y ago`;
	}
</script>

<svelte:head>
	<title>Diamond Markdown</title>
</svelte:head>

<div class="home">
	<header class="head">
		<Wordmark size="md" />
	</header>

	<section class="col">
		<div class="col-head">
			<h2>Vaults</h2>
			<button class="mini-btn" onclick={() => (addOpen = !addOpen)}>
				{addOpen ? '× Cancel' : '＋ Add vault'}
			</button>
		</div>

		<div class="vault-list">
			{#each data.vaults as v}
				<a href="/vault/{v.id}" class="vault-card">
					<div class="row-1">
						<span class="diamond">◆</span>
						<span class="name">{v.name}</span>
						<span class="count mono">{v.stats.noteCount} notes</span>
					</div>
					<div class="row-2">
						<span class="path mono">{v.path.replace(/^\/Users\/[^/]+/, '~')}</span>
						{#if v.stats.lastModified}
							<span class="time mono">{relTime(v.stats.lastModified)}</span>
						{/if}
					</div>
				</a>
			{/each}
		</div>

		{#if addOpen}
			<div class="add-form">
				<label>
					<span>Display name</span>
					<input type="text" bind:value={newName} placeholder="Personal" />
				</label>
				<label>
					<span>Absolute path</span>
					<input type="text" bind:value={newPath} placeholder="/Users/me/Documents/vault" />
				</label>
				<div class="actions">
					<button class="btn primary" disabled={adding} onclick={addVault}>
						{adding ? 'Adding…' : 'Add vault'}
					</button>
				</div>
				{#if err}<p class="err">{err}</p>{/if}
			</div>
		{/if}
	</section>

	<section class="col">
		<div class="col-head">
			<h2>Recent</h2>
		</div>
		{#if recent.length === 0}
			<p class="empty">Nothing opened yet. Pick a vault above to get started.</p>
		{:else}
			<ul class="recent">
				{#each recent as r}
					<li>
						<a href={`/vault/${r.vaultId}/note/${encodeURI(r.path)}`}>
							<span class="r-title">{r.title}</span>
							<span class="r-where mono">{r.vaultName} · {r.path}</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<footer class="foot">
		<span class="hint">
			<kbd>⌘K</kbd> quick switcher inside a vault ·
			<kbd>⌘⇧F</kbd> full-text search ·
			<kbd>F2</kbd> rename
		</span>
		<span class="mono">v0.1 · <a href="https://github.com/Zollicoff/diamondmarkdown" target="_blank" rel="noopener">github</a></span>
	</footer>
</div>

<style>
	.home {
		max-width: 780px;
		margin: 0 auto;
		padding: 3.5rem 2rem 2rem;
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		gap: 2.2rem;
	}

	.head {
		display: flex;
		align-items: center;
	}

	.col-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: 0.6rem;
	}
	h2 {
		font-family: 'Bricolage Grotesque', var(--sans);
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.18em;
		color: var(--fg-dim);
		font-weight: 600;
		margin: 0;
	}

	/* Vault cards — one-per-line, two info rows */
	.vault-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.vault-card {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 12px 16px;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		border-left: 3px solid var(--border);
		border-radius: 8px;
		text-decoration: none;
		color: var(--fg);
		transition: border-color 0.15s, transform 0.1s, background 0.15s;
	}
	.vault-card:hover {
		border-color: var(--border-strong);
		border-left-color: #7dd3fc;
		background: var(--bg-hover);
		transform: translateX(1px);
	}
	.row-1 { display: flex; align-items: center; gap: 10px; }
	.row-2 { display: flex; align-items: center; gap: 10px; justify-content: space-between; }
	.diamond { color: #7dd3fc; }
	.name {
		font-weight: 600;
		font-size: 0.95rem;
		flex: 1;
	}
	.count {
		font-size: 0.78rem;
		color: var(--fg-dim);
	}
	.path {
		font-size: 0.76rem;
		color: var(--fg-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
		min-width: 0;
	}
	.time { font-size: 0.74rem; color: var(--fg-dim); }
	.mono { font-family: var(--mono); font-variant-numeric: tabular-nums; }

	/* Recent */
	.recent { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 2px; }
	.recent a {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px 14px;
		border-radius: 6px;
		color: var(--fg);
		text-decoration: none;
	}
	.recent a:hover { background: var(--bg-hover); }
	.r-title { font-size: 0.92rem; font-weight: 500; }
	.r-where { font-size: 0.74rem; color: var(--fg-dim); }
	.empty { color: var(--fg-dim); font-size: 0.88rem; margin: 0; }

	/* Add form */
	.add-form {
		margin-top: 10px;
		padding: 14px 16px;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		border-radius: 8px;
		display: flex; flex-direction: column; gap: 10px;
	}
	.add-form label { display: flex; flex-direction: column; gap: 3px; }
	.add-form label span { font-size: 0.7rem; color: var(--fg-dim); text-transform: uppercase; letter-spacing: 0.1em; }
	.add-form input {
		padding: 7px 10px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 6px;
		color: var(--fg);
		font-family: var(--mono);
		font-size: 0.85rem;
	}
	.add-form input:focus { outline: 2px solid #7dd3fc; outline-offset: 1px; border-color: transparent; }
	.actions { display: flex; gap: 8px; }

	.btn {
		padding: 7px 14px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 6px;
		color: var(--fg);
		cursor: pointer;
		font: inherit;
		font-size: 0.86rem;
	}
	.btn:hover { border-color: var(--accent); color: var(--accent); }
	.btn.primary {
		background: linear-gradient(135deg, #7dd3fc 0%, #818cf8 100%);
		color: #0a0e1a;
		font-weight: 600;
		border-color: transparent;
	}
	.btn:disabled { opacity: 0.5; cursor: not-allowed; }
	.err { color: var(--danger); margin: 0; font-size: 0.82rem; }

	.mini-btn {
		background: transparent;
		border: 0;
		color: var(--fg-muted);
		padding: 2px 8px;
		border-radius: 4px;
		font-size: 0.78rem;
		cursor: pointer;
		font-family: inherit;
	}
	.mini-btn:hover { color: var(--accent); background: var(--bg-hover); }

	/* Footer */
	.foot {
		margin-top: auto;
		padding-top: 1.5rem;
		border-top: 1px solid var(--border);
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 0.78rem;
		color: var(--fg-dim);
		flex-wrap: wrap;
		gap: 10px;
	}
	.foot a { color: var(--fg-muted); }
	.foot a:hover { color: var(--accent); }
	.hint kbd {
		font-family: var(--mono);
		background: var(--bg-elev);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 1px 5px;
		font-size: 0.78rem;
		margin: 0 1px;
	}
</style>
