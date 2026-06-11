export interface PluginSettingsPanelContext {
	vaultId: string;
	pluginId: string;
	panelId: string;
}

export interface PluginSettingsPanelDef {
	id: string;
	title: string;
	description?: string;
	render: (
		container: HTMLElement,
		context: PluginSettingsPanelContext
	) => void | (() => void) | Promise<void | (() => void)>;
}

export interface RegisteredSettingsPanel {
	id: string;
	localId: string;
	pluginId: string;
	title: string;
	description?: string;
	render: PluginSettingsPanelDef['render'];
}

interface PluginExtensionState {
	settingsPanelsByVault: Record<string, RegisteredSettingsPanel[]>;
}

const state = $state<PluginExtensionState>({
	settingsPanelsByVault: {}
});

function sortPanels(panels: RegisteredSettingsPanel[]): RegisteredSettingsPanel[] {
	return [...panels].sort((a, b) => {
		const byTitle = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
		return byTitle || a.id.localeCompare(b.id);
	});
}

export function registerSettingsPanel(vaultId: string, panel: RegisteredSettingsPanel): () => void {
	const current = state.settingsPanelsByVault[vaultId] ?? [];
	state.settingsPanelsByVault[vaultId] = sortPanels([
		...current.filter((item) => item.id !== panel.id),
		panel
	]);
	return () => unregisterSettingsPanel(vaultId, panel.id);
}

export function unregisterSettingsPanel(vaultId: string, id: string): void {
	const current = state.settingsPanelsByVault[vaultId] ?? [];
	const next = current.filter((panel) => panel.id !== id);
	if (next.length === current.length) return;
	state.settingsPanelsByVault[vaultId] = next;
}

export function listSettingsPanels(vaultId: string): RegisteredSettingsPanel[] {
	return state.settingsPanelsByVault[vaultId] ?? [];
}

export function clearVaultExtensions(vaultId: string): void {
	delete state.settingsPanelsByVault[vaultId];
}
