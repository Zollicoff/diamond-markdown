<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/vault-api';
	import type { PluginCatalogItem, PluginDescriptor } from '$lib/plugins/types';
	import { installedPluginIds, pluginInstallMessage } from '$lib/plugins/panel';
	import PluginInstaller from './PluginInstaller.svelte';
	import PluginCatalogList from './PluginCatalogList.svelte';
	import InstalledPluginList from './InstalledPluginList.svelte';

	interface Props {
		vaultId: string;
	}

	let { vaultId }: Props = $props();
	let plugins = $state<PluginDescriptor[]>([]);
	let catalog = $state<PluginCatalogItem[]>([]);
	let loading = $state(true);
	let catalogLoading = $state(true);
	let error = $state<string | null>(null);
	let replaceExisting = $state(false);
	let installing = $state(false);
	let installingCatalogId = $state<string | null>(null);
	let installMessage = $state<string | null>(null);
	let installedIds = $derived(installedPluginIds(plugins));

	async function load(): Promise<void> {
		loading = true;
		catalogLoading = true;
		error = null;
		try {
			const [res, catalogRes] = await Promise.all([
				api.plugins(vaultId),
				api.pluginCatalog()
			]);
			plugins = res.plugins;
			catalog = catalogRes.plugins;
		} catch (e) {
			error = (e as Error).message;
		} finally {
			loading = false;
			catalogLoading = false;
		}
	}

	onMount(() => {
		void load();
	});

	async function install(manifestUrl: string): Promise<boolean> {
		manifestUrl = manifestUrl.trim();
		if (!manifestUrl || installing) return false;
		installing = true;
		error = null;
		installMessage = null;
		try {
			const res = await api.installPlugin(vaultId, manifestUrl, replaceExisting);
			plugins = res.plugins;
			installMessage = pluginInstallMessage(res.message);
			replaceExisting = false;
			return true;
		} catch (e) {
			error = (e as Error).message;
			return false;
		} finally {
			installing = false;
		}
	}

	async function installCatalogPlugin(plugin: PluginCatalogItem): Promise<void> {
		if (installing) return;
		installing = true;
		installingCatalogId = plugin.id;
		error = null;
		installMessage = null;
		try {
			const res = await api.installCatalogPlugin(vaultId, plugin.id, replaceExisting);
			plugins = res.plugins;
			installMessage = pluginInstallMessage(res.message);
			replaceExisting = false;
		} catch (e) {
			error = (e as Error).message;
		} finally {
			installing = false;
			installingCatalogId = null;
		}
	}
</script>

<section class="group">
	<h2>Plugins</h2>
	<p class="group-hint">
		Vault plugins live in <span class="mono">.diamondmd/plugins/&lt;plugin-id&gt;/</span>
		with a <span class="mono">plugin.json</span> manifest and ESM entry module.
	</p>

	<PluginInstaller
		{installing}
		{installMessage}
		{replaceExisting}
		onReplaceExistingChange={(value) => { replaceExisting = value; }}
		onInstall={install}
	/>
	<PluginCatalogList
		{catalog}
		{catalogLoading}
		{installedIds}
		{replaceExisting}
		{installing}
		{installingCatalogId}
		onInstallCatalog={installCatalogPlugin}
	/>
	<InstalledPluginList {plugins} {loading} {error} />
</section>

<style>
	.group {
		margin-bottom: 28px;
		padding-bottom: 20px;
		border-bottom: 1px solid var(--border);
	}
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
	.mono { font-family: var(--mono); }
</style>
