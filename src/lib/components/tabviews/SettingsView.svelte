<script lang="ts">
	import { page } from '$app/state';
	import { api } from '$lib/vault-api';
	import { listSettingsPanels } from '$lib/plugins/extensions.svelte';
	import { buildSettingsSections } from '$lib/settings/view';
	import GitSyncPanel from './GitSyncPanel.svelte';
	import PluginPanel from './plugins/PluginPanel.svelte';
	import PluginSettingsSlot from './plugins/PluginSettingsSlot.svelte';
	import AboutSettingsSection from './settings/AboutSettingsSection.svelte';
	import ExcludedFoldersSection from './settings/ExcludedFoldersSection.svelte';
	import SettingsNav from './settings/SettingsNav.svelte';
	import ThemeSettingsSection from './settings/ThemeSettingsSection.svelte';
	import VaultSettingsSection from './settings/VaultSettingsSection.svelte';

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

	const settingsSections = $derived(buildSettingsSections(pluginSettingsPanels.length));

	function jumpToSection(id: string): void {
		document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
</script>

<div class="settings">
	<div class="settings-shell">
		<SettingsNav sections={settingsSections} onJump={jumpToSection} />

		<div class="settings-content">
			<header class="head">
				<h1>Settings</h1>
				<span class="hint">Per-vault and per-app preferences</span>
			</header>

			<ThemeSettingsSection />
			<VaultSettingsSection {vault} />

			<div id="sync" class="anchor">
				<GitSyncPanel vaultId={vault.id} vaultPath={vault.path} />
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

			<ExcludedFoldersSection {excluded} {busy} {error} onRemove={removeExcluded} />

			<AboutSettingsSection />
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

	.anchor {
		scroll-margin-top: 20px;
	}

	@media (max-width: 760px) {
		.settings-shell {
			grid-template-columns: 1fr;
			gap: 18px;
			padding: 20px 18px 44px;
		}
	}
</style>
