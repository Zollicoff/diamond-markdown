import type { NoteDoc } from '$lib/types';

type PluginRenderCleanup = void | (() => void) | Promise<void | (() => void)>;

export interface PluginExtensionContext {
	vaultId: string;
	pluginId: string;
	extensionId: string;
}

export interface PluginSettingsPanelContext extends PluginExtensionContext {
	panelId: string;
}

export interface PluginRightPanelContext extends PluginSettingsPanelContext {
	doc: NoteDoc;
}

export interface PluginMarkdownPostprocessorContext extends PluginExtensionContext {
	doc: NoteDoc;
	processorId: string;
	root: HTMLElement;
}

export interface PluginIframePanelFields {
	html: string;
	height?: number;
}

export interface PluginDomSettingsPanelDef {
	id: string;
	title: string;
	description?: string;
	render: (
		container: HTMLElement,
		context: PluginSettingsPanelContext
	) => PluginRenderCleanup;
}

export interface PluginIframeSettingsPanelDef extends PluginIframePanelFields {
	id: string;
	title: string;
	description?: string;
}

export type PluginSettingsPanelDef = PluginDomSettingsPanelDef | PluginIframeSettingsPanelDef;

export interface PluginDomRightPanelDef {
	id: string;
	title: string;
	description?: string;
	render: (
		container: HTMLElement,
		context: PluginRightPanelContext
	) => PluginRenderCleanup;
}

export interface PluginIframeRightPanelDef extends PluginIframePanelFields {
	id: string;
	title: string;
	description?: string;
}

export type PluginRightPanelDef = PluginDomRightPanelDef | PluginIframeRightPanelDef;

export interface PluginMarkdownPostprocessorDef {
	id: string;
	process: (
		root: HTMLElement,
		context: PluginMarkdownPostprocessorContext
	) => PluginRenderCleanup;
}

export interface RegisteredDomSettingsPanel {
	id: string;
	localId: string;
	pluginId: string;
	title: string;
	description?: string;
	mode: 'dom';
	render: PluginDomSettingsPanelDef['render'];
}

export interface RegisteredIframeSettingsPanel {
	id: string;
	localId: string;
	pluginId: string;
	title: string;
	description?: string;
	mode: 'iframe';
	html: string;
	height?: number;
}

export type RegisteredSettingsPanel = RegisteredDomSettingsPanel | RegisteredIframeSettingsPanel;

export interface RegisteredDomRightPanel {
	id: string;
	localId: string;
	pluginId: string;
	title: string;
	description?: string;
	mode: 'dom';
	render: PluginDomRightPanelDef['render'];
}

export interface RegisteredIframeRightPanel {
	id: string;
	localId: string;
	pluginId: string;
	title: string;
	description?: string;
	mode: 'iframe';
	html: string;
	height?: number;
}

export type RegisteredRightPanel = RegisteredDomRightPanel | RegisteredIframeRightPanel;

export interface RegisteredMarkdownPostprocessor {
	id: string;
	localId: string;
	pluginId: string;
	process: PluginMarkdownPostprocessorDef['process'];
}

interface PluginExtensionState {
	markdownPostprocessorsByVault: Record<string, RegisteredMarkdownPostprocessor[]>;
	settingsPanelsByVault: Record<string, RegisteredSettingsPanel[]>;
	rightPanelsByVault: Record<string, RegisteredRightPanel[]>;
}

const state = $state<PluginExtensionState>({
	markdownPostprocessorsByVault: {},
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

export function registerMarkdownPostprocessor(vaultId: string, processor: RegisteredMarkdownPostprocessor): () => void {
	const current = state.markdownPostprocessorsByVault[vaultId] ?? [];
	state.markdownPostprocessorsByVault[vaultId] = [
		...current.filter((item) => item.id !== processor.id),
		processor
	].sort((a, b) => a.id.localeCompare(b.id));
	return () => unregisterMarkdownPostprocessor(vaultId, processor.id);
}

export function unregisterMarkdownPostprocessor(vaultId: string, id: string): void {
	const current = state.markdownPostprocessorsByVault[vaultId] ?? [];
	const next = current.filter((processor) => processor.id !== id);
	if (next.length === current.length) return;
	state.markdownPostprocessorsByVault[vaultId] = next;
}

export function listMarkdownPostprocessors(vaultId: string): RegisteredMarkdownPostprocessor[] {
	return state.markdownPostprocessorsByVault[vaultId] ?? [];
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
	delete state.markdownPostprocessorsByVault[vaultId];
	delete state.settingsPanelsByVault[vaultId];
	delete state.rightPanelsByVault[vaultId];
}
