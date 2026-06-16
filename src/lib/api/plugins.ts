import type { PluginCatalogResponse, PluginInstallResponse, PluginListResponse } from '$lib/plugins/types';
import { emit } from '$lib/events';
import { json } from '$lib/api/request';

export interface PluginManifestInstallPayload {
	manifestUrl: string;
	replace: boolean;
}

export interface PluginCatalogInstallPayload {
	catalogId: string;
	replace: boolean;
}

export function pluginManifestInstallPayload(
	manifestUrl: string,
	replace = false
): PluginManifestInstallPayload {
	return { manifestUrl, replace };
}

export function pluginCatalogInstallPayload(
	catalogId: string,
	replace = false
): PluginCatalogInstallPayload {
	return { catalogId, replace };
}

async function installPluginRequest(
	vaultId: string,
	payload: PluginManifestInstallPayload | PluginCatalogInstallPayload
): Promise<PluginInstallResponse> {
	const res = await json<PluginInstallResponse>(`/api/vaults/${vaultId}/plugins`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(payload)
	});
	emit('plugins:reload', { vaultId });
	return res;
}

export const pluginsApi = {
	async plugins(vaultId: string): Promise<PluginListResponse> {
		return json(`/api/vaults/${vaultId}/plugins`);
	},

	async pluginCatalog(): Promise<PluginCatalogResponse> {
		return json('/api/plugins/catalog');
	},

	async installPlugin(vaultId: string, manifestUrl: string, replace = false): Promise<PluginInstallResponse> {
		return installPluginRequest(vaultId, pluginManifestInstallPayload(manifestUrl, replace));
	},

	async installCatalogPlugin(vaultId: string, catalogId: string, replace = false): Promise<PluginInstallResponse> {
		return installPluginRequest(vaultId, pluginCatalogInstallPayload(catalogId, replace));
	}
};
