import type { NoteDoc } from '$lib/types';

type PluginRenderCleanup = void | (() => void) | Promise<void | (() => void)>;

export interface PluginSettingsPanelContext {
	vaultId: string;
	pluginId: string;
	panelId: string;
}

export interface PluginRightPanelContext extends PluginSettingsPanelContext {
	doc: NoteDoc;
}

export interface PluginSettingsPanelDef {
	id: string;
	title: string;
	description?: string;
	render: (
		container: HTMLElement,
		context: PluginSettingsPanelContext
	) => PluginRenderCleanup;
}

export interface PluginRightPanelDef {
	id: string;
	title: string;
	description?: string;
	render: (
		container: HTMLElement,
		context: PluginRightPanelContext
	) => PluginRenderCleanup;
}

export interface RegisteredSettingsPanel {
	id: string;
	localId: string;
	pluginId: string;
	title: string;
	description?: string;
	render: PluginSettingsPanelDef['render'];
}

export interface RegisteredRightPanel {
	id: string;
	localId: string;
	pluginId: string;
	title: string;
	description?: string;
	render: PluginRightPanelDef['render'];
}

interface PluginExtensionState {
	settingsPanelsByVault: Record<string, RegisteredSettingsPanel[]>;
	rightPanelsByVault: Record<string, RegisteredRightPanel[]>;
}

const state = $state<PluginExtensionState>({
	settingsPanelsByVault: {},
	rightPanelsByVault: {}
});

function sortPanels<T extends { id: string; title: string }>(panels: T[]): T[] {
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

export function registerRightPanel(vaultId: string, panel: RegisteredRightPanel): () => void {
	const current = state.rightPanelsByVault[vaultId] ?? [];
	state.rightPanelsByVault[vaultId] = sortPanels([
		...current.filter((item) => item.id !== panel.id),
		panel
	]);
	return () => unregisterRightPanel(vaultId, panel.id);
}

export function unregisterRightPanel(vaultId: string, id: string): void {
	const current = state.rightPanelsByVault[vaultId] ?? [];
	const next = current.filter((panel) => panel.id !== id);
	if (next.length === current.length) return;
	state.rightPanelsByVault[vaultId] = next;
}

export function listRightPanels(vaultId: string): RegisteredRightPanel[] {
	return state.rightPanelsByVault[vaultId] ?? [];
}

export function clearVaultExtensions(vaultId: string): void {
	delete state.settingsPanelsByVault[vaultId];
	delete state.rightPanelsByVault[vaultId];
}
