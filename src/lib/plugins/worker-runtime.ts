import { register, unregister, type CommandContext, type CommandDef } from '$lib/commands';
import type { PluginCommandManifest, PluginDescriptor } from './types';
import { registerRightPanel, registerSettingsPanel } from './extensions.svelte';
import { createPluginFilesApi, type PluginFilesApi } from './capabilities';
import { getActivePluginEditor, type ActivePluginEditor } from './editor-commands.svelte';
import { alertDialog, notify } from '$lib/dialogs';

interface WorkerCommandMessage {
	type: 'registerCommand';
	command: PluginCommandManifest & { shortcut?: string };
}

interface WorkerEditorCommandMessage {
	type: 'registerEditorCommand';
	command: PluginCommandManifest & { shortcut?: string };
}

interface WorkerIframePanelDef {
	id: string;
	title: string;
	description?: string;
	html: string;
	height?: number;
}

interface WorkerPanelMessage {
	type: 'registerSettingsPanel' | 'registerRightPanel';
	panel: WorkerIframePanelDef;
}

interface WorkerNotifyMessage {
	type: 'notify';
	message: string;
}

type WorkerCapabilityName =
	| 'files.readNote'
	| 'files.writeNote'
	| 'editor.insert'
	| 'editor.insertTemplate'
	| 'editor.wrap'
	| 'editor.prependLines'
	| 'editor.toggleHeading'
	| 'editor.insertWikilink'
	| 'editor.insertCodeBlock'
	| 'editor.scrollToHeading'
	| 'editor.focus';

interface WorkerCapabilityRequestMessage {
	type: 'capabilityRequest';
	requestId: number;
	capability: WorkerCapabilityName;
	input: unknown;
}

interface WorkerReadyMessage {
	type: 'ready';
}

interface WorkerErrorMessage {
	type: 'error' | 'commandError';
	requestId?: number;
	error: string;
}

interface WorkerCompleteMessage {
	type: 'commandComplete';
	requestId: number;
}

type WorkerMessage =
	| WorkerCommandMessage
	| WorkerEditorCommandMessage
	| WorkerPanelMessage
	| WorkerNotifyMessage
	| WorkerCapabilityRequestMessage
	| WorkerReadyMessage
	| WorkerErrorMessage
	| WorkerCompleteMessage;

interface PendingCommand {
	resolve: () => void;
	reject: (error: Error) => void;
}

interface WorkerEditorTarget {
	vaultId: string;
	paneId: string;
	tabId: string;
	notePath: string;
}

export interface WorkerPluginRuntime {
	dispose: () => void;
}

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const MAX_IFRAME_HTML_BYTES = 128 * 1024;

const WORKER_SOURCE = `
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const MAX_IFRAME_HTML_BYTES = 128 * 1024;
const commands = new Map();
const capabilityPending = new Map();
let api = null;
let dispose = null;
let capabilityRequestId = 0;

function pluginError(message) {
  return message instanceof Error ? message.message : String(message);
}

function cleanCommand(command) {
  if (!command || typeof command !== 'object') throw new Error('command required');
  if (!ID_RE.test(command.id ?? '')) throw new Error('invalid command id: ' + command.id);
  if (typeof command.title !== 'string' || !command.title.trim()) throw new Error('command title required');
  if (typeof command.exec !== 'function') throw new Error('command exec function required');
  return {
    id: command.id.trim(),
    title: command.title.trim(),
    icon: typeof command.icon === 'string' ? command.icon.slice(0, 8) : undefined,
    shortcut: typeof command.shortcut === 'string' ? command.shortcut.slice(0, 24) : undefined,
    category: typeof command.category === 'string' ? command.category.slice(0, 32) : undefined
  };
}

function cleanPanel(panel, label) {
  if (!panel || typeof panel !== 'object') throw new Error(label + ' panel required');
  if (!ID_RE.test(panel.id ?? '')) throw new Error('invalid ' + label + ' panel id: ' + panel.id);
  if (typeof panel.title !== 'string' || !panel.title.trim()) throw new Error(label + ' panel title required');
  if (typeof panel.html !== 'string' || !panel.html.trim()) throw new Error(label + ' panel html required');
  const encodedLength = new TextEncoder().encode(panel.html).byteLength;
  if (encodedLength > MAX_IFRAME_HTML_BYTES) throw new Error(label + ' panel html is too large');
  const out = {
    id: panel.id.trim(),
    title: panel.title.trim(),
    description: typeof panel.description === 'string' ? panel.description.trim().slice(0, 500) : undefined,
    html: panel.html.trim()
  };
  const height = Number(panel.height);
  if (Number.isFinite(height)) out.height = Math.min(720, Math.max(80, Math.round(height)));
  return out;
}

function requestCapability(capability, input) {
  const requestId = ++capabilityRequestId;
  return new Promise((resolve, reject) => {
    capabilityPending.set(requestId, { resolve, reject });
    self.postMessage({ type: 'capabilityRequest', requestId, capability, input });
  });
}

function rejectCapabilities(error) {
  for (const item of capabilityPending.values()) item.reject(error);
  capabilityPending.clear();
}

function makeEditorProxy(target) {
  return Object.freeze({
    insert(text) {
      return requestCapability('editor.insert', { target, text });
    },
    insertTemplate(text) {
      return requestCapability('editor.insertTemplate', { target, text });
    },
    wrap(prefix, suffix) {
      return requestCapability('editor.wrap', { target, prefix, suffix });
    },
    prependLines(text) {
      return requestCapability('editor.prependLines', { target, text });
    },
    toggleHeading(level) {
      return requestCapability('editor.toggleHeading', { target, level });
    },
    insertWikilink() {
      return requestCapability('editor.insertWikilink', { target });
    },
    insertCodeBlock(lang) {
      return requestCapability('editor.insertCodeBlock', { target, lang });
    },
    scrollToHeading(id) {
      return requestCapability('editor.scrollToHeading', { target, id });
    },
    focus() {
      return requestCapability('editor.focus', { target });
    }
  });
}

function makeApi(vaultId, pluginId) {
  return {
    vaultId,
    pluginId,
    files: Object.freeze({
      readNote(path) {
        return requestCapability('files.readNote', { path });
      },
      writeNote(path, content, options = {}) {
        return requestCapability('files.writeNote', {
          path,
          content,
          expectedRevision: options && typeof options.expectedRevision === 'string' ? options.expectedRevision : undefined
        });
      }
    }),
    registerCommand(command) {
      const manifest = cleanCommand(command);
      commands.set(manifest.id, command.exec);
      self.postMessage({ type: 'registerCommand', command: manifest });
    },
    registerEditorCommand(command) {
      const manifest = cleanCommand(command);
      commands.set(manifest.id, command.exec);
      self.postMessage({ type: 'registerEditorCommand', command: manifest });
    },
    registerMarkdownPostprocessor() {
      throw new Error('worker plugins cannot register markdown postprocessors');
    },
    registerRightPanel(panel) {
      self.postMessage({ type: 'registerRightPanel', panel: cleanPanel(panel, 'right') });
    },
    registerSettingsPanel(panel) {
      self.postMessage({ type: 'registerSettingsPanel', panel: cleanPanel(panel, 'settings') });
    },
    notify(message) {
      self.postMessage({ type: 'notify', message: String(message).slice(0, 500) });
    }
  };
}

try {
  self.fetch = () => Promise.reject(new Error('Network access is disabled in Diamond worker plugins.'));
  self.XMLHttpRequest = undefined;
  self.WebSocket = undefined;
  self.EventSource = undefined;
} catch {}

self.onmessage = async (event) => {
  const data = event.data ?? {};
  try {
    if (data.type === 'capabilityResponse') {
      const item = capabilityPending.get(data.requestId);
      if (!item) return;
      capabilityPending.delete(data.requestId);
      if (data.ok) item.resolve(data.result);
      else item.reject(new Error(data.error || 'capability request failed'));
      return;
    }
    if (data.type === 'activate') {
      api = makeApi(data.vaultId, data.pluginId);
      const mod = await import(data.moduleUrl);
      const activate = mod.activate ?? mod.default;
      if (typeof activate !== 'function') throw new Error('plugin module must export activate(api)');
      const result = await activate(api);
      if (typeof result === 'function') dispose = result;
      self.postMessage({ type: 'ready' });
      return;
    }
    if (data.type === 'execCommand') {
      const exec = commands.get(data.commandId);
      if (!exec) throw new Error('unknown command: ' + data.commandId);
      const context = { ...(data.context ?? {}), vaultId: data.vaultId, pluginId: data.pluginId };
      if (data.editorTarget) context.editor = makeEditorProxy(data.editorTarget);
      const result = await exec(context);
      if (result && typeof result.notify === 'string') api?.notify(result.notify);
      self.postMessage({ type: 'commandComplete', requestId: data.requestId });
      return;
    }
    if (data.type === 'dispose') {
      rejectCapabilities(new Error('worker plugin disposed'));
      if (dispose) await dispose();
      self.close();
    }
  } catch (error) {
    rejectCapabilities(error instanceof Error ? error : new Error(String(error)));
    self.postMessage({
      type: data.type === 'execCommand' ? 'commandError' : 'error',
      requestId: data.requestId,
      error: pluginError(error)
    });
  }
};
`;

function scopedWorkerCommandId(pluginId: string, commandId: string): string {
	return `plugin:${pluginId}:worker:${commandId}`;
}

function scopedWorkerEditorCommandId(pluginId: string, commandId: string): string {
	return `plugin:${pluginId}:worker-editor:${commandId}`;
}

function serializableContext(ctx: CommandContext): CommandContext {
	const out: CommandContext = {};
	if (typeof ctx.vaultId === 'string') out.vaultId = ctx.vaultId;
	if (typeof ctx.paneId === 'string') out.paneId = ctx.paneId;
	if (typeof ctx.tabId === 'string') out.tabId = ctx.tabId;
	if (typeof ctx.notePath === 'string') out.notePath = ctx.notePath;
	if (typeof ctx.selection === 'string') out.selection = ctx.selection;
	if (ctx.node && typeof ctx.node.path === 'string' && typeof ctx.node.type === 'string' && typeof ctx.node.name === 'string') {
		out.node = { path: ctx.node.path, type: ctx.node.type, name: ctx.node.name };
	}
	return out;
}

function serializableDoc(editor: ActivePluginEditor): Record<string, unknown> {
	return {
		path: editor.doc.path,
		content: editor.doc.content,
		revision: editor.doc.revision,
		mtime: editor.doc.mtime,
		frontmatter: JSON.parse(JSON.stringify(editor.doc.frontmatter ?? {})) as Record<string, unknown>,
		body: editor.doc.body,
		tags: [...editor.doc.tags]
	};
}

function editorTarget(editor: ActivePluginEditor): WorkerEditorTarget {
	return {
		vaultId: editor.vaultId,
		paneId: editor.paneId,
		tabId: editor.tabId,
		notePath: editor.notePath
	};
}

function serializableEditorContext(ctx: CommandContext, editor: ActivePluginEditor): CommandContext {
	return {
		...serializableContext(ctx),
		vaultId: editor.vaultId,
		paneId: editor.paneId,
		tabId: editor.tabId,
		notePath: editor.notePath,
		doc: serializableDoc(editor)
	};
}

function cleanWorkerIframePanel(panel: WorkerIframePanelDef, label: string): WorkerIframePanelDef {
	if (!panel || typeof panel !== 'object') throw new Error(`${label} panel required`);
	const candidate = panel as Partial<WorkerIframePanelDef>;
	if (typeof candidate.id !== 'string' || !ID_RE.test(candidate.id)) throw new Error(`invalid ${label} panel id: ${candidate.id}`);
	if (typeof candidate.title !== 'string' || !candidate.title.trim()) throw new Error(`${label} panel title required`);
	if (typeof candidate.html !== 'string' || !candidate.html.trim()) throw new Error(`${label} panel html required`);
	const id = candidate.id.trim();
	const title = candidate.title.trim();
	const html = candidate.html.trim();
	if (new TextEncoder().encode(html).byteLength > MAX_IFRAME_HTML_BYTES) throw new Error(`${label} panel html is too large`);
	const height = Number(candidate.height);
	return {
		id,
		title,
		description: typeof candidate.description === 'string' ? candidate.description.trim().slice(0, 500) : undefined,
		html,
		height: Number.isFinite(height) ? Math.min(720, Math.max(80, Math.round(height))) : undefined
	};
}

function messageError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function readCapabilityInput(input: unknown): Record<string, unknown> {
	if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('capability input must be an object');
	return input as Record<string, unknown>;
}

function readString(input: Record<string, unknown>, key: string, maxBytes = 128 * 1024): string {
	const value = input[key];
	if (typeof value !== 'string') throw new Error(`${key} must be a string`);
	if (new TextEncoder().encode(value).byteLength > maxBytes) throw new Error(`${key} is too large`);
	return value;
}

function readOptionalString(input: Record<string, unknown>, key: string, maxBytes = 128 * 1024): string | undefined {
	const value = input[key];
	if (value === undefined || value === null || value === '') return undefined;
	if (typeof value !== 'string') throw new Error(`${key} must be a string`);
	if (new TextEncoder().encode(value).byteLength > maxBytes) throw new Error(`${key} is too large`);
	return value;
}

function readEditorTarget(input: Record<string, unknown>): WorkerEditorTarget {
	const target = input.target;
	if (!target || typeof target !== 'object' || Array.isArray(target)) throw new Error('editor target required');
	const obj = target as Record<string, unknown>;
	const out = {
		vaultId: obj.vaultId,
		paneId: obj.paneId,
		tabId: obj.tabId,
		notePath: obj.notePath
	};
	if (
		typeof out.vaultId !== 'string' ||
		typeof out.paneId !== 'string' ||
		typeof out.tabId !== 'string' ||
		typeof out.notePath !== 'string'
	) {
		throw new Error('editor target is invalid');
	}
	return out as WorkerEditorTarget;
}

function activeEditorForTarget(target: WorkerEditorTarget): ActivePluginEditor {
	const editor = getActivePluginEditor({
		vaultId: target.vaultId,
		paneId: target.paneId,
		tabId: target.tabId,
		notePath: target.notePath
	});
	if (
		!editor ||
		editor.vaultId !== target.vaultId ||
		editor.paneId !== target.paneId ||
		editor.tabId !== target.tabId ||
		editor.notePath !== target.notePath
	) {
		throw new Error('active editor is no longer available');
	}
	return editor;
}

async function runWorkerCapability(files: PluginFilesApi, message: WorkerCapabilityRequestMessage): Promise<unknown> {
	const input = readCapabilityInput(message.input);
	switch (message.capability) {
		case 'files.readNote':
			return files.readNote(input.path as string);
		case 'files.writeNote':
			return files.writeNote(input.path as string, input.content as string, {
				expectedRevision: typeof input.expectedRevision === 'string' ? input.expectedRevision : undefined
			});
		case 'editor.insert':
			activeEditorForTarget(readEditorTarget(input)).editor.insert(readString(input, 'text'));
			return { ok: true };
		case 'editor.insertTemplate':
			activeEditorForTarget(readEditorTarget(input)).editor.insertTemplate(readString(input, 'text'));
			return { ok: true };
		case 'editor.wrap':
			activeEditorForTarget(readEditorTarget(input)).editor.wrap(
				readString(input, 'prefix', 256),
				readOptionalString(input, 'suffix', 256)
			);
			return { ok: true };
		case 'editor.prependLines':
			activeEditorForTarget(readEditorTarget(input)).editor.prependLines(readString(input, 'text', 256));
			return { ok: true };
		case 'editor.toggleHeading': {
			const level = Number(input.level);
			if (![1, 2, 3, 4, 5, 6].includes(level)) throw new Error('heading level must be 1-6');
			activeEditorForTarget(readEditorTarget(input)).editor.toggleHeading(level as 1 | 2 | 3 | 4 | 5 | 6);
			return { ok: true };
		}
		case 'editor.insertWikilink':
			activeEditorForTarget(readEditorTarget(input)).editor.insertWikilink();
			return { ok: true };
		case 'editor.insertCodeBlock':
			activeEditorForTarget(readEditorTarget(input)).editor.insertCodeBlock(readOptionalString(input, 'lang', 32));
			return { ok: true };
		case 'editor.scrollToHeading':
			return {
				ok: activeEditorForTarget(readEditorTarget(input)).editor.scrollToHeading(readString(input, 'id', 256))
			};
		case 'editor.focus':
			activeEditorForTarget(readEditorTarget(input)).editor.focus();
			return { ok: true };
		default:
			throw new Error(`unknown capability: ${message.capability}`);
	}
}

export async function loadWorkerPlugin(vaultId: string, plugin: PluginDescriptor): Promise<WorkerPluginRuntime> {
	const workerUrl = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
	const worker = new Worker(workerUrl, { type: 'module', name: `diamond-plugin-${plugin.id}` });
	const files = createPluginFilesApi(vaultId);
	const registered = new Set<string>();
	const panelDisposers: (() => void)[] = [];
	const pending = new Map<number, PendingCommand>();
	let requestId = 0;
	let readyResolve: () => void;
	let readyReject: (error: Error) => void;
	const ready = new Promise<void>((resolve, reject) => {
		readyResolve = resolve;
		readyReject = reject;
	});

	function rejectPending(error: Error): void {
		for (const item of pending.values()) item.reject(error);
		pending.clear();
	}

	function registerWorkerCommand(command: PluginCommandManifest & { shortcut?: string }): void {
		if (!ID_RE.test(command.id)) throw new Error(`invalid worker command id: ${command.id}`);
		if (!command.title?.trim()) throw new Error('worker command title required');
		const id = scopedWorkerCommandId(plugin.id, command.id);
		const wrapped: CommandDef = {
			id,
			title: command.title,
			icon: command.icon,
			shortcut: command.shortcut,
			category: command.category ?? `plugin:${plugin.id}`,
			async exec(ctx) {
				const currentRequestId = ++requestId;
				await new Promise<void>((resolve, reject) => {
					pending.set(currentRequestId, { resolve, reject });
					worker.postMessage({
						type: 'execCommand',
						requestId: currentRequestId,
						commandId: command.id,
						vaultId,
						pluginId: plugin.id,
						context: serializableContext(ctx)
					});
				}).catch((error) => {
					console.error(`[plugin:${plugin.id}] worker command failed:`, error);
					void alertDialog({ title: 'Plugin worker command failed', message: (error as Error).message, tone: 'danger' });
				});
			}
		};
		register(wrapped);
		registered.add(id);
	}

	function registerWorkerEditorCommand(command: PluginCommandManifest & { shortcut?: string }): void {
		if (!ID_RE.test(command.id)) throw new Error(`invalid worker editor command id: ${command.id}`);
		if (!command.title?.trim()) throw new Error('worker editor command title required');
		const id = scopedWorkerEditorCommandId(plugin.id, command.id);
		const activeEditor = (ctx: CommandContext): ActivePluginEditor | null => (
			getActivePluginEditor({ ...ctx, vaultId })
		);
		const wrapped: CommandDef = {
			id,
			title: command.title,
			icon: command.icon,
			shortcut: command.shortcut,
			category: command.category ?? `plugin:${plugin.id}`,
			when(ctx) {
				return activeEditor(ctx) !== null;
			},
			async exec(ctx) {
				const editor = activeEditor(ctx);
				if (!editor) return;
				const currentRequestId = ++requestId;
				await new Promise<void>((resolve, reject) => {
					pending.set(currentRequestId, { resolve, reject });
					worker.postMessage({
						type: 'execCommand',
						requestId: currentRequestId,
						commandId: command.id,
						vaultId,
						pluginId: plugin.id,
						context: serializableEditorContext(ctx, editor),
						editorTarget: editorTarget(editor)
					});
				}).catch((error) => {
					console.error(`[plugin:${plugin.id}] worker editor command failed:`, error);
					void alertDialog({ title: 'Plugin worker editor command failed', message: (error as Error).message, tone: 'danger' });
				});
			}
		};
		register(wrapped);
		registered.add(id);
	}

	function registerWorkerSettingsPanel(panel: WorkerIframePanelDef): void {
		const cleanPanel = cleanWorkerIframePanel(panel, 'settings');
		const id = `plugin:${plugin.id}:settings:${cleanPanel.id}`;
		const dispose = registerSettingsPanel(vaultId, {
			id,
			localId: cleanPanel.id,
			pluginId: plugin.id,
			title: cleanPanel.title,
			description: cleanPanel.description,
			mode: 'iframe',
			html: cleanPanel.html,
			height: cleanPanel.height
		});
		panelDisposers.push(dispose);
	}

	function registerWorkerRightPanel(panel: WorkerIframePanelDef): void {
		const cleanPanel = cleanWorkerIframePanel(panel, 'right');
		const id = `plugin:${plugin.id}:right:${cleanPanel.id}`;
		const dispose = registerRightPanel(vaultId, {
			id,
			localId: cleanPanel.id,
			pluginId: plugin.id,
			title: cleanPanel.title,
			description: cleanPanel.description,
			mode: 'iframe',
			html: cleanPanel.html,
			height: cleanPanel.height
		});
		panelDisposers.push(dispose);
	}

	async function handleCapabilityRequest(message: WorkerCapabilityRequestMessage): Promise<void> {
		if (!Number.isSafeInteger(message.requestId) || message.requestId < 1) {
			console.error(`[plugin:${plugin.id}] worker capability request rejected: invalid request id`);
			return;
		}
		try {
			worker.postMessage({
				type: 'capabilityResponse',
				requestId: message.requestId,
				ok: true,
				result: await runWorkerCapability(files, message)
			});
		} catch (error) {
			worker.postMessage({
				type: 'capabilityResponse',
				requestId: message.requestId,
				ok: false,
				error: messageError(error)
			});
		}
	}

	worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
		const message = event.data;
		try {
			if (message.type === 'registerCommand') {
				registerWorkerCommand(message.command);
				return;
			}
			if (message.type === 'registerEditorCommand') {
				registerWorkerEditorCommand(message.command);
				return;
			}
			if (message.type === 'registerSettingsPanel') {
				registerWorkerSettingsPanel(message.panel);
				return;
			}
			if (message.type === 'registerRightPanel') {
				registerWorkerRightPanel(message.panel);
				return;
			}
			if (message.type === 'notify') {
				console.info(`[plugin:${plugin.id}] ${message.message}`);
				notify({ title: plugin.name, message: message.message, tone: 'success' });
				return;
			}
			if (message.type === 'capabilityRequest') {
				void handleCapabilityRequest(message);
				return;
			}
			if (message.type === 'ready') {
				readyResolve();
				return;
			}
			if (message.type === 'commandComplete') {
				const item = pending.get(message.requestId);
				if (!item) return;
				pending.delete(message.requestId);
				item.resolve();
				return;
			}
			if (message.type === 'commandError') {
				const item = message.requestId ? pending.get(message.requestId) : null;
				if (!item) return;
				pending.delete(message.requestId!);
				item.reject(new Error(message.error));
				return;
			}
			if (message.type === 'error') {
				readyReject(new Error(message.error));
				rejectPending(new Error(message.error));
			}
		} catch (error) {
			const workerError = error instanceof Error ? error : new Error(String(error));
			console.error(`[plugin:${plugin.id}] worker message rejected:`, workerError);
			readyReject(workerError);
			rejectPending(workerError);
		}
	};

	worker.onerror = (event) => {
		const error = new Error(event.message || 'worker plugin failed');
		readyReject(error);
		rejectPending(error);
	};

	worker.postMessage({
		type: 'activate',
		moduleUrl: new URL(`${plugin.moduleUrl}?v=${encodeURIComponent(plugin.version)}`, window.location.origin).href,
		vaultId,
		pluginId: plugin.id
	});

	await ready;

	return {
		dispose() {
			for (const id of registered) unregister(id);
			registered.clear();
			for (const dispose of panelDisposers.splice(0)) dispose();
			rejectPending(new Error('worker plugin disposed'));
			worker.postMessage({ type: 'dispose' });
			worker.terminate();
			URL.revokeObjectURL(workerUrl);
		}
	};
}
