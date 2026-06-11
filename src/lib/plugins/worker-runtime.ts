import { register, unregister, type CommandContext, type CommandDef } from '$lib/commands';
import type { PluginCommandManifest, PluginDescriptor } from './types';

interface WorkerCommandMessage {
	type: 'registerCommand';
	command: PluginCommandManifest & { shortcut?: string };
}

interface WorkerNotifyMessage {
	type: 'notify';
	message: string;
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
	| WorkerNotifyMessage
	| WorkerReadyMessage
	| WorkerErrorMessage
	| WorkerCompleteMessage;

interface PendingCommand {
	resolve: () => void;
	reject: (error: Error) => void;
}

export interface WorkerPluginRuntime {
	dispose: () => void;
}

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

const WORKER_SOURCE = `
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const commands = new Map();
let api = null;
let dispose = null;

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

function makeApi(vaultId, pluginId) {
  return {
    vaultId,
    pluginId,
    registerCommand(command) {
      const manifest = cleanCommand(command);
      commands.set(manifest.id, command.exec);
      self.postMessage({ type: 'registerCommand', command: manifest });
    },
    registerEditorCommand() {
      throw new Error('worker plugins cannot register editor commands yet');
    },
    registerMarkdownPostprocessor() {
      throw new Error('worker plugins cannot register markdown postprocessors');
    },
    registerRightPanel() {
      throw new Error('worker plugins cannot register right panels');
    },
    registerSettingsPanel() {
      throw new Error('worker plugins cannot register settings panels');
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
      const result = await exec({ ...(data.context ?? {}), vaultId: data.vaultId, pluginId: data.pluginId });
      if (result && typeof result.notify === 'string') api?.notify(result.notify);
      self.postMessage({ type: 'commandComplete', requestId: data.requestId });
      return;
    }
    if (data.type === 'dispose') {
      if (dispose) await dispose();
      self.close();
    }
  } catch (error) {
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

export async function loadWorkerPlugin(vaultId: string, plugin: PluginDescriptor): Promise<WorkerPluginRuntime> {
	const workerUrl = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
	const worker = new Worker(workerUrl, { type: 'module', name: `diamond-plugin-${plugin.id}` });
	const registered = new Set<string>();
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
					alert(`Plugin worker command failed: ${(error as Error).message}`);
				});
			}
		};
		register(wrapped);
		registered.add(id);
	}

	worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
		const message = event.data;
		if (message.type === 'registerCommand') {
			registerWorkerCommand(message.command);
			return;
		}
		if (message.type === 'notify') {
			console.info(`[plugin:${plugin.id}] ${message.message}`);
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
			rejectPending(new Error('worker plugin disposed'));
			worker.postMessage({ type: 'dispose' });
			worker.terminate();
			URL.revokeObjectURL(workerUrl);
		}
	};
}
