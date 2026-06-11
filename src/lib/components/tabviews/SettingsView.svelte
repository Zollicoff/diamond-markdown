<script lang="ts">
	import { page } from '$app/state';
	import { theme, setMode, type ThemeMode } from '$lib/theme.svelte';
	import { api } from '$lib/vault-api';
	import { listSettingsPanels } from '$lib/plugins/extensions.svelte';
	import GitSyncPanel from './GitSyncPanel.svelte';
	import PluginPanel from './plugins/PluginPanel.svelte';
	import PluginSettingsSlot from './plugins/PluginSettingsSlot.svelte';

	const vault = $derived(page.data.vault as { id: string; name: string; path: string; excludedFolders: string[] });
	const pluginSettingsPanels = $derived(listSettingsPanels(vault.id));
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

	const settingsSections = $derived.by(() => [
		{ id: 'appearance', label: 'Appearance' },
		{ id: 'vault', label: 'Vault' },
		{ id: 'sync', label: 'Sync' },
		{ id: 'plugins', label: 'Plugins' },
		...(pluginSettingsPanels.length > 0 ? [{ id: 'plugin-settings', label: 'Plugin settings' }] : []),
		{ id: 'excluded', label: 'Folders' },
		{ id: 'about', label: 'About' }
	]);

	function jumpToSection(id: string): void {
		document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
</script>

<div class="settings">
	<div class="settings-shell">
		<nav class="settings-nav" aria-label="Settings sections">
			{#each settingsSections as item (item.id)}
				<button class="nav-btn" onclick={() => jumpToSection(item.id)}>{item.label}</button>
			{/each}
		</nav>

		<div class="settings-content">
			<header class="head">
				<h1>Settings</h1>
				<span class="hint">Per-vault and per-app preferences</span>
			</header>

			<section class="group" id="appearance">
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

			<section class="group" id="vault">
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

			<div id="sync" class="anchor">
				<GitSyncPanel vaultId={vault.id} />
			</div>

			<div id="plugins" class="anchor">
				<PluginPanel vaultId={vault.id} />
			</div>

			{#if pluginSettingsPanels.length > 0}
				<div id="plugin-settings" class="anchor">
					{#each pluginSettingsPanels as panel (panel.id)}
						<PluginSettingsSlot vaultId={vault.id} {panel} />
					{/each}
				</div>
			{/if}

			<section class="group" id="excluded">
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

			<section class="group" id="about">
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
	</div>
</div>

<style>
	.settings {
		overflow-y: auto;
		height: 100%;
		min-height: 0;
		color: var(--fg);
	}
	.settings-shell {
		display: grid;
		grid-template-columns: 150px minmax(0, 760px);
		gap: 34px;
		align-items: start;
		max-width: 1000px;
		margin: 0 auto;
		padding: 28px 32px 56px;
	}
	.settings-nav {
		position: sticky;
		top: 22px;
		display: grid;
		gap: 3px;
		padding: 4px 0;
		border-right: 1px solid var(--border);
	}
	.nav-btn {
		width: calc(100% - 12px);
		text-align: left;
		border: 0;
		border-radius: 5px;
		background: transparent;
		color: var(--fg-muted);
		font: inherit;
		font-size: 0.8rem;
		padding: 6px 8px;
		cursor: pointer;
	}
	.nav-btn:hover,
	.nav-btn:focus-visible {
		color: var(--accent);
		background: var(--bg-hover);
		outline: none;
	}
	.settings-content {
		min-width: 0;
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
		scroll-margin-top: 20px;
		margin-bottom: 28px;
		padding-bottom: 20px;
		border-bottom: 1px solid var(--border);
	}
	.anchor {
		scroll-margin-top: 20px;
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

	@media (max-width: 760px) {
		.settings-shell {
			grid-template-columns: 1fr;
			gap: 18px;
			padding: 20px 18px 44px;
		}
		.settings-nav {
			position: sticky;
			top: 0;
			z-index: 2;
			display: flex;
			gap: 4px;
			overflow-x: auto;
			border-right: 0;
			border-bottom: 1px solid var(--border);
			background: var(--bg);
			padding: 0 0 8px;
		}
		.nav-btn {
			width: auto;
			white-space: nowrap;
			flex: none;
		}
		.row {
			align-items: flex-start;
			flex-direction: column;
			gap: 10px;
		}
		.value { text-align: left; }
		.value.path { max-width: 100%; }
	}
</style>
