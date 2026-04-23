<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	let addOpen = $state(false);
	let newName = $state('');
	let newPath = $state('');
	let adding = $state(false);
	let err = $state<string | null>(null);

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
				const data = await res.json().catch(() => ({}));
				err = data?.message ?? `HTTP ${res.status}`;
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
</script>

<div class="welcome">
	<header>
		<h1>DiamondMD</h1>
		<p class="tagline">Self-hosted markdown knowledge base — Obsidian-style links, git-native history, web-first.</p>
	</header>

	<section class="vaults">
		<h2>Vaults</h2>
		<div class="vault-list">
			{#each data.vaults as v}
				<a href="/vault/{v.id}" class="vault-card">
					<div class="vault-name">{v.name}</div>
					<div class="vault-path mono">{v.path}</div>
				</a>
			{/each}
			<button class="vault-card vault-add" onclick={() => (addOpen = !addOpen)}>
				<div class="vault-name">+ Add vault</div>
				<div class="vault-path mono">register an existing folder of .md files</div>
			</button>
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
					<button class="btn" onclick={() => (addOpen = false)}>Cancel</button>
				</div>
				{#if err}<p class="err">{err}</p>{/if}
			</div>
		{/if}
	</section>

	<footer>
		<a href="https://github.com/Zollicoff/diamondmd" target="_blank" rel="noopener">GitHub</a>
		<span class="dot">·</span>
		<span>MIT License</span>
	</footer>
</div>

<style>
	.welcome {
		max-width: 760px;
		margin: 0 auto;
		padding: 5rem 2rem 3rem;
	}
	header h1 {
		font-family: var(--serif);
		font-size: 3.5rem;
		line-height: 1;
		letter-spacing: -0.02em;
		margin: 0 0 0.5rem;
	}
	.tagline { color: var(--fg-muted); font-size: 1.08rem; margin: 0 0 3rem; }
	h2 { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.12em; color: var(--fg-dim); margin: 0 0 0.75rem; }

	.vault-list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 10px;
	}
	.vault-card {
		display: flex; flex-direction: column; gap: 6px;
		padding: 16px 18px;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		border-radius: 10px;
		text-decoration: none;
		color: var(--fg);
		cursor: pointer;
		text-align: left;
		font: inherit;
		transition: border-color 0.15s, transform 0.1s, background 0.15s;
	}
	.vault-card:hover { border-color: var(--accent); transform: translateY(-1px); }
	.vault-name { font-weight: 600; font-size: 1rem; }
	.vault-path { font-size: 0.78rem; color: var(--fg-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.mono { font-family: var(--mono); }

	.vault-add { border-style: dashed; background: transparent; }

	.add-form {
		margin-top: 1rem;
		padding: 18px;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		border-radius: 10px;
		display: flex; flex-direction: column; gap: 12px;
	}
	.add-form label { display: flex; flex-direction: column; gap: 4px; }
	.add-form span { font-size: 0.75rem; color: var(--fg-dim); text-transform: uppercase; letter-spacing: 0.08em; }
	.add-form input {
		padding: 8px 10px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 6px;
		color: var(--fg);
		font-family: var(--mono);
		font-size: 0.9rem;
	}
	.add-form input:focus { outline: 2px solid var(--accent); outline-offset: 1px; border-color: transparent; }
	.actions { display: flex; gap: 10px; }
	.btn {
		padding: 8px 14px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 6px;
		color: var(--fg);
		cursor: pointer;
		font-size: 0.88rem;
	}
	.btn:hover { border-color: var(--accent); }
	.btn.primary { background: var(--accent); color: var(--bg); font-weight: 600; border-color: var(--accent); }
	.btn:disabled { opacity: 0.5; cursor: not-allowed; }
	.err { color: var(--danger); margin: 0; font-size: 0.88rem; }

	footer {
		margin-top: 3rem;
		font-size: 0.82rem;
		color: var(--fg-dim);
	}
	.dot { margin: 0 8px; }
</style>
