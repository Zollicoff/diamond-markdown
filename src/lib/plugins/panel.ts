import type { PluginCatalogItem, PluginDescriptor, PluginExecutionMode } from '$lib/plugins/types';

export interface CatalogInstallAction {
	installed: boolean;
	busy: boolean;
	actionLabel: 'Install' | 'Installed' | 'Replace';
	buttonText: 'Install' | 'Installed' | 'Replace' | 'Installing...';
	ariaLabel: string;
	disabled: boolean;
}

export function installedPluginIds(plugins: PluginDescriptor[]): Set<string> {
	return new Set(plugins.map((plugin) => plugin.id));
}

export function pluginExecutionLabel(execution: PluginExecutionMode): string {
	return execution === 'worker' ? 'Worker' : 'Trusted';
}

export function pluginValidityLabel(enabled: boolean): string {
	return enabled ? 'Valid' : 'Invalid';
}

export function pluginInstallMessage(message: string): string {
	return `${message} Plugin runtime reload requested.`;
}

export function manifestInstallDisabled(manifestUrl: string, installing: boolean): boolean {
	return installing || manifestUrl.trim().length === 0;
}

export function catalogInstallAction(
	plugin: PluginCatalogItem,
	installedIds: Set<string>,
	replaceExisting: boolean,
	installing: boolean,
	installingCatalogId: string | null
): CatalogInstallAction {
	const installed = installedIds.has(plugin.id);
	const busy = installingCatalogId === plugin.id;
	const actionLabel = installed ? (replaceExisting ? 'Replace' : 'Installed') : 'Install';
	return {
		installed,
		busy,
		actionLabel,
		buttonText: busy ? 'Installing...' : actionLabel,
		ariaLabel: `${actionLabel} ${plugin.name}`,
		disabled: installing || (installed && !replaceExisting)
	};
}
