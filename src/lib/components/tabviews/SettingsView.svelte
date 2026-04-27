<script lang="ts">
	import { page } from '$app/state';
	import { theme, setMode, type ThemeMode } from '$lib/theme.svelte';
	import { api } from '$lib/vault-api';

	const vault = $derived(page.data.vault as { id: string; name: string; path: string; excludedFolders: string[] });
	let excluded = $state<string[]>([]);
	let busy = $state(false);
	let error = $state<string | null>(null);

	$effect(() => {
		excluded = vault.excludedFolders ?? [];
	});

	async function removeExcluded(folder: string): Promise<void> {
		if (busy) return;
		busy = true;
		error = null;
		try {
			const res = await api.toggleExcluded(vault.id, folder);
			excluded = res.excludedFolders;
		} catch (e) {
			error = (e as Error).message;
		} finally {
			busy = false;
		}
	}

	const themeModes: { id: ThemeMode; label: string; icon: string }[] = [
		{ id: 'auto',  label: 'Auto',  icon: '◐' },
		{ id: 'light', label: 'Light', icon: '○' },
		{ id: 'dark',  label: 'Dark',  icon: '●' }
	];
</script>

<div class="settings">
	<header class="head">
		<h1>Settings</h1>
		<span class="hint">Per-vault and per-app preferences</span>
	</header>

	<section class="group">
		<h2>Appearance</h2>
		<div class="row">
			<div class="row-label">
				<div class="row-title">Theme</div>
				<div class="row-hint">Choose the editor's color scheme. Auto follows your system.</div>
			</div>
			<div class="seg" role="radiogroup" aria-label="Theme">
				{#each themeModes as m (m.id)}
					<button
						class="seg-btn"
						class:active={theme.mode === m.id}
						role="radio"
						aria-checked={theme.mode === m.id}
						onclick={() => setMode(m.id)}
					>
						<span class="seg-icon">{m.icon}</span>{m.label}
					</button>
				{/each}
			</div>
		</div>
	</section>

	<section class="group">
		<h2>Vault</h2>
		<div class="row">
			<div class="row-label">
				<div class="row-title">Name</div>
				<div class="row-hint">The display name of the active vault.</div>
			</div>
			<div class="value mono">{vault.name}</div>
		</div>
		<div class="row">
			<div class="row-label">
				<div class="row-title">Location</div>
				<div class="row-hint">Where the markdown files live on disk.</div>
			</div>
			<div class="value mono path" title={vault.path}>{vault.path}</div>
		</div>
		<div class="row">
			<div class="row-label">
				<div class="row-title">Switch vault</div>
				<div class="row-hint">Pick a different vault from the registry.</div>
			</div>
			<a class="link-btn" href="/">Open vault picker →</a>
		</div>
	</section>

	<section class="group">
		<h2>Excluded folders</h2>
		<p class="group-hint">
			Folders listed here are skipped by the indexer, file tree, and search.
			Right-click any folder in the file tree → <em>Exclude from index</em> to add one.
		</p>
		{#if excluded.length === 0}
			<div class="empty">No folders excluded.</div>
		{:else}
			<ul class="ex-list">
				{#each excluded as folder (folder)}
					<li class="ex-item">
						<span class="ex-path mono">{folder}</span>
						<button class="ex-remove" onclick={() => removeExcluded(folder)} disabled={busy}>Remove</button>
					</li>
				{/each}
			</ul>
		{/if}
		{#if error}
			<div class="err">{error}</div>
		{/if}
	</section>

	<section class="group">
		<h2>About</h2>
		<div class="row">
			<div class="row-label">
				<div class="row-title">Diamond Markdown</div>
				<div class="row-hint">Self-hosted, git-native, web-first knowledge base.</div>
			</div>
			<div class="value">
				<a href="https://github.com/Zollicoff/diamondmarkdown" target="_blank" rel="noopener">GitHub</a>
				·
				<a href="https://diamondmarkdown.com" target="_blank" rel="noopener">Site</a>
			</div>
		</div>
	</section>
</div>

<style>
	.settings {
		max-width: 760px;
		margin: 0 auto;
		padding: 28px 32px 56px;
		overflow-y: auto;
		height: 100%;
		min-height: 0;
		color: var(--fg);
	}
	.head {
		margin-bottom: 28px;
	}
	.head h1 {
		font-family: 'Bricolage Grotesque', var(--sans);
		font-weight: 700;
		font-size: 1.6rem;
		margin: 0 0 4px;
		letter-spacing: -0.02em;
	}
	.head .hint {
		color: var(--fg-dim);
		font-size: 0.85rem;
	}

	.group {
		margin-bottom: 28px;
		padding-bottom: 20px;
		border-bottom: 1px solid var(--border);
	}
	.group:last-of-type { border-bottom: 0; }
	.group h2 {
		font-family: 'Bricolage Grotesque', var(--sans);
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--fg-muted);
		margin: 0 0 14px;
	}
	.group-hint {
		color: var(--fg-dim);
		font-size: 0.85rem;
		margin: -8px 0 14px;
	}
	.group-hint em { color: var(--fg-muted); font-style: normal; }

	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
		padding: 10px 0;
	}
	.row + .row { border-top: 1px dashed var(--border); }
	.row-label { min-width: 0; flex: 1; }
	.row-title { font-size: 0.92rem; color: var(--fg); }
	.row-hint { font-size: 0.78rem; color: var(--fg-dim); margin-top: 2px; }
	.value { font-size: 0.85rem; color: var(--fg-muted); text-align: right; }
	.value.path { max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.value a { color: var(--accent); text-decoration: none; }
	.value a:hover { text-decoration: underline; }

	.seg {
		display: flex;
		gap: 2px;
		background: var(--bg);
		border: 1px solid var(--border);
		padding: 2px;
		border-radius: 7px;
	}
	.seg-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: transparent;
		border: 0;
		color: var(--fg-muted);
		padding: 5px 12px;
		border-radius: 5px;
		font: inherit;
		font-size: 0.82rem;
		cursor: pointer;
	}
	.seg-btn:hover { color: var(--fg); }
	.seg-btn.active {
		background: var(--bg-elev);
		color: var(--accent);
	}
	.seg-icon { font-size: 0.92rem; }

	.link-btn {
		color: var(--accent);
		text-decoration: none;
		font-size: 0.86rem;
	}
	.link-btn:hover { text-decoration: underline; }

	.ex-list { list-style: none; padding: 0; margin: 0; }
	.ex-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 8px 12px;
		border: 1px solid var(--border);
		border-radius: 6px;
		margin-bottom: 6px;
		background: var(--bg-elev);
	}
	.ex-path { font-size: 0.86rem; color: var(--fg); overflow: hidden; text-overflow: ellipsis; }
	.ex-remove {
		background: transparent;
		border: 1px solid var(--border);
		color: var(--fg-muted);
		font: inherit;
		font-size: 0.78rem;
		padding: 3px 10px;
		border-radius: 4px;
		cursor: pointer;
		flex: none;
	}
	.ex-remove:hover:not(:disabled) { color: var(--danger); border-color: var(--danger); }
	.ex-remove:disabled { opacity: 0.5; cursor: default; }

	.empty {
		color: var(--fg-dim);
		font-size: 0.85rem;
		font-style: italic;
		padding: 12px 4px;
	}
	.err {
		color: var(--danger);
		font-size: 0.82rem;
		margin-top: 8px;
	}

	.mono { font-family: var(--mono); }
</style>
