import { register, unregister, type CommandContext, type CommandDef } from '$lib/commands';
import { api as vaultApi } from '$lib/vault-api';
import {
	clearVaultExtensions,
	registerMarkdownPostprocessor,
	registerRightPanel,
	registerSettingsPanel,
	type PluginMarkdownPostprocessorDef,
	type PluginRightPanelDef,
	type PluginSettingsPanelDef
} from './extensions.svelte';
import { getActivePluginEditor, type PluginEditorCommandContext } from './editor-commands.svelte';
import type { PluginDescriptor } from './types';
import { loadWorkerPlugin } from './worker-runtime';

export interface PluginCommandDef {
	id: string;
	title: string;
	icon?: string;
	shortcut?: string;
	category?: string;
	when?: (ctx: CommandContext) => boolean;
	exec: (ctx: CommandContext) => void | Promise<void>;
}

export interface PluginEditorCommandDef {
	id: string;
	title: string;
	icon?: string;
	shortcut?: string;
	category?: string;
	when?: (ctx: PluginEditorCommandContext) => boolean;
	exec: (ctx: PluginEditorCommandContext) => void | Promise<void>;
}

export interface PluginApi {
	vaultId: string;
	pluginId: string;
	registerCommand: (command: PluginCommandDef) => void;
	registerEditorCommand: (command: PluginEditorCommandDef) => void;
	registerMarkdownPostprocessor: (processor: PluginMarkdownPostprocessorDef) => void;
	registerRightPanel: (panel: PluginRightPanelDef) => void;
	registerSettingsPanel: (panel: PluginSettingsPanelDef) => void;
	notify: (message: string) => void;
}

export interface PluginModule {
	activate?: (api: PluginApi) => void | (() => void) | Promise<void | (() => void)>;
	default?: (api: PluginApi) => void | (() => void) | Promise<void | (() => void)>;
}

export interface PluginLoadResult {
	plugin: PluginDescriptor;
	loaded: boolean;
	error?: string;
}

export interface PluginRuntime {
	results: PluginLoadResult[];
	dispose: () => void;
}

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const MAX_IFRAME_HTML_BYTES = 128 * 1024;

function scopedCommandId(pluginId: string, commandId: string): string {
	return `plugin:${pluginId}:${commandId}`;
}

function scopedEditorCommandId(pluginId: string, commandId: string): string {
	return `plugin:${pluginId}:editor:${commandId}`;
}

function scopedSettingsPanelId(pluginId: string, panelId: string): string {
	return `plugin:${pluginId}:settings:${panelId}`;
}

function scopedRightPanelId(pluginId: string, panelId: string): string {
	return `plugin:${pluginId}:right:${panelId}`;
}

function scopedMarkdownPostprocessorId(pluginId: string, processorId: string): string {
	return `plugin:${pluginId}:markdown:${processorId}`;
}

function isCommandId(value: string): boolean {
	return ID_RE.test(value);
}

function cleanIframeHtml(value: unknown): string {
	if (typeof value !== 'string' || !value.trim()) throw new Error('iframe panel html required');
	const html = value.trim();
	if (new TextEncoder().encode(html).byteLength > MAX_IFRAME_HTML_BYTES) throw new Error('iframe panel html is too large');
	return html;
}

function cleanIframeHeight(value: unknown): number | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	const height = Number(value);
	if (!Number.isFinite(height)) return undefined;
	return Math.min(720, Math.max(80, Math.round(height)));
}

export async function loadVaultPlugins(vaultId: string): Promise<PluginRuntime> {
	const registered = new Set<string>();
	const disposers: (() => void)[] = [];
	const results: PluginLoadResult[] = [];
	clearVaultExtensions(vaultId);
	const { plugins } = await vaultApi.plugins(vaultId);

	for (const plugin of plugins) {
		if (!plugin.enabled) {
			results.push({ plugin, loaded: false, error: plugin.error ?? 'plugin disabled' });
			continue;
		}

		try {
			if (plugin.execution === 'worker') {
				const workerRuntime = await loadWorkerPlugin(vaultId, plugin);
				disposers.push(workerRuntime.dispose);
				results.push({ plugin, loaded: true });
				continue;
			}

			const module = await import(/* @vite-ignore */ `${plugin.moduleUrl}?v=${encodeURIComponent(plugin.version)}`) as PluginModule;
			const activate = module.activate ?? module.default;
			if (typeof activate !== 'function') {
				results.push({ plugin, loaded: false, error: 'plugin module must export activate(api)' });
				continue;
			}

			const pluginApi: PluginApi = {
				vaultId,
				pluginId: plugin.id,
				registerCommand(command) {
					if (!isCommandId(command.id)) throw new Error(`invalid command id: ${command.id}`);
					const id = scopedCommandId(plugin.id, command.id);
					const wrapped: CommandDef = {
						id,
						title: command.title,
						icon: command.icon,
						shortcut: command.shortcut,
						category: command.category ?? `plugin:${plugin.id}`,
						when: command.when,
						async exec(ctx) {
							try {
								await command.exec({ ...ctx, vaultId, pluginId: plugin.id });
							} catch (e) {
								console.error(`[plugin:${plugin.id}] command failed:`, e);
								alert(`Plugin command failed: ${(e as Error).message}`);
							}
						}
					};
					register(wrapped);
					registered.add(id);
				},
				registerEditorCommand(command) {
					if (!isCommandId(command.id)) throw new Error(`invalid editor command id: ${command.id}`);
					if (typeof command.exec !== 'function') throw new Error('editor command exec function required');
					const id = scopedEditorCommandId(plugin.id, command.id);
					const makeContext = (ctx: CommandContext): PluginEditorCommandContext | null => {
						const editor = getActivePluginEditor({ ...ctx, vaultId });
						if (!editor) return null;
						return { ...ctx, ...editor, vaultId, pluginId: plugin.id };
					};
					const wrapped: CommandDef = {
						id,
						title: command.title,
						icon: command.icon,
						shortcut: command.shortcut,
						category: command.category ?? `plugin:${plugin.id}`,
						when(ctx) {
							const pluginCtx = makeContext(ctx);
							if (!pluginCtx) return false;
							return command.when ? command.when(pluginCtx) : true;
						},
						async exec(ctx) {
							const pluginCtx = makeContext(ctx);
							if (!pluginCtx) return;
							try {
								await command.exec(pluginCtx);
							} catch (e) {
								console.error(`[plugin:${plugin.id}] editor command failed:`, e);
								alert(`Plugin editor command failed: ${(e as Error).message}`);
							}
						}
					};
					register(wrapped);
					registered.add(id);
				},
				registerMarkdownPostprocessor(processor) {
					if (!isCommandId(processor.id)) throw new Error(`invalid markdown postprocessor id: ${processor.id}`);
					if (typeof processor.process !== 'function') throw new Error('markdown postprocessor function required');
					const id = scopedMarkdownPostprocessorId(plugin.id, processor.id);
					const unregisterProcessor = registerMarkdownPostprocessor(vaultId, {
						id,
						localId: processor.id,
						pluginId: plugin.id,
						process: processor.process
					});
					disposers.push(unregisterProcessor);
				},
				registerSettingsPanel(panel) {
					if (!isCommandId(panel.id)) throw new Error(`invalid settings panel id: ${panel.id}`);
					if (!panel.title?.trim()) throw new Error('settings panel title required');
					const id = scopedSettingsPanelId(plugin.id, panel.id);
					const common = {
						id,
						localId: panel.id,
						pluginId: plugin.id,
						title: panel.title.trim(),
						description: panel.description?.trim()
					};
					let unregisterPanel: () => void;
					if ('html' in panel) {
						unregisterPanel = registerSettingsPanel(vaultId, {
							...common,
							mode: 'iframe',
							html: cleanIframeHtml(panel.html),
							height: cleanIframeHeight(panel.height)
						});
					} else if (typeof panel.render === 'function') {
						unregisterPanel = registerSettingsPanel(vaultId, {
							...common,
							mode: 'dom',
							render: panel.render
						});
					} else {
						throw new Error('settings panel render function or html required');
					}
					disposers.push(unregisterPanel);
				},
				registerRightPanel(panel) {
					if (!isCommandId(panel.id)) throw new Error(`invalid right panel id: ${panel.id}`);
					if (!panel.title?.trim()) throw new Error('right panel title required');
					const id = scopedRightPanelId(plugin.id, panel.id);
					const common = {
						id,
						localId: panel.id,
						pluginId: plugin.id,
						title: panel.title.trim(),
						description: panel.description?.trim()
					};
					let unregisterPanel: () => void;
					if ('html' in panel) {
						unregisterPanel = registerRightPanel(vaultId, {
							...common,
							mode: 'iframe',
							html: cleanIframeHtml(panel.html),
							height: cleanIframeHeight(panel.height)
						});
					} else if (typeof panel.render === 'function') {
						unregisterPanel = registerRightPanel(vaultId, {
							...common,
							mode: 'dom',
							render: panel.render
						});
					} else {
						throw new Error('right panel render function or html required');
					}
					disposers.push(unregisterPanel);
				},
				notify(message) {
					console.info(`[plugin:${plugin.id}] ${message}`);
				}
			};

			const dispose = await activate(pluginApi);
			if (typeof dispose === 'function') disposers.push(dispose);
			results.push({ plugin, loaded: true });
		} catch (e) {
			console.error(`[plugin:${plugin.id}] failed to load:`, e);
			results.push({ plugin, loaded: false, error: (e as Error).message });
		}
	}

	return {
		results,
		dispose() {
			for (const dispose of disposers.splice(0)) {
				try { dispose(); } catch (e) { console.error('[plugins] disposer failed:', e); }
			}
			for (const id of registered) unregister(id);
			registered.clear();
		}
	};
}
