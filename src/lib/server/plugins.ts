import fs from 'node:fs';
import path from 'node:path';
import type { VaultRef } from '$lib/types';
import type { PluginCommandManifest, PluginDescriptor, PluginExecutionMode, PluginManifest } from '$lib/plugins/types';

const PLUGIN_ROOT = '.diamondmd/plugins';
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const MAX_MANIFEST_BYTES = 128 * 1024;
const MAX_ENTRY_BYTES = 1024 * 1024;

export interface PluginInstallInput {
	manifestUrl: string;
	replace?: boolean;
}

function cleanEntry(entry: unknown): string {
	const value = typeof entry === 'string' && entry.trim() ? entry.trim() : 'main.js';
	if (/^[a-z][a-z0-9+.-]*:/i.test(value)) throw new Error('entry must be a relative module path');
	if (value.includes('?') || value.includes('#')) throw new Error('entry cannot include query or hash');
	if (path.isAbsolute(value)) throw new Error('entry must be vault-plugin relative');
	const normalized = value.split(/[\\/]+/).filter(Boolean).join('/');
	if (!normalized || normalized.startsWith('../') || normalized.includes('/../')) {
		throw new Error('entry cannot escape plugin directory');
	}
	if (!/\.(m?js)$/i.test(normalized)) throw new Error('entry must be a .js or .mjs module');
	return normalized;
}

function cleanCommand(raw: unknown): PluginCommandManifest | null {
	if (!raw || typeof raw !== 'object') return null;
	const obj = raw as Record<string, unknown>;
	const id = typeof obj.id === 'string' ? obj.id.trim() : '';
	const title = typeof obj.title === 'string' ? obj.title.trim() : '';
	if (!id || !title || !ID_RE.test(id)) return null;
	const command: PluginCommandManifest = { id, title };
	if (typeof obj.icon === 'string' && obj.icon.trim()) command.icon = obj.icon.trim().slice(0, 8);
	if (typeof obj.category === 'string' && obj.category.trim()) command.category = obj.category.trim().slice(0, 32);
	return command;
}

function cleanExecution(raw: unknown): PluginExecutionMode {
	if (raw === undefined || raw === null || raw === '') return 'trusted';
	if (raw === 'trusted' || raw === 'worker') return raw;
	throw new Error('execution must be trusted or worker');
}

function parseManifest(raw: unknown, fallbackId: string): PluginManifest {
	if (!raw || typeof raw !== 'object') throw new Error('plugin manifest must be an object');
	const obj = raw as Record<string, unknown>;
	const id = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : fallbackId;
	const name = typeof obj.name === 'string' ? obj.name.trim() : '';
	const version = typeof obj.version === 'string' ? obj.version.trim() : '';
	if (!ID_RE.test(id)) throw new Error('plugin id must use letters, numbers, _ or -');
	if (!name) throw new Error('plugin name required');
	if (!version) throw new Error('plugin version required');
	const manifest: PluginManifest = {
		id,
		name,
		version,
		entry: cleanEntry(obj.entry),
		execution: cleanExecution(obj.execution),
		commands: Array.isArray(obj.commands)
			? obj.commands.map(cleanCommand).filter((cmd): cmd is PluginCommandManifest => !!cmd)
			: []
	};
	if (typeof obj.description === 'string' && obj.description.trim()) manifest.description = obj.description.trim();
	if (typeof obj.author === 'string' && obj.author.trim()) manifest.author = obj.author.trim();
	return manifest;
}

function pluginRoot(vault: VaultRef): string {
	return path.join(vault.path, PLUGIN_ROOT);
}

function assertInsideRoot(root: string, candidate: string): void {
	const rel = path.relative(root, candidate);
	if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('plugin path escapes plugin root');
}

function isLoopbackHost(hostname: string): boolean {
	return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

function parseInstallUrl(rawUrl: string, label: string): URL {
	const raw = typeof rawUrl === 'string' ? rawUrl.trim() : '';
	if (!raw) throw new Error(`${label} URL required`);
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new Error(`${label} URL is invalid`);
	}
	if (url.username || url.password) throw new Error(`${label} URL cannot include credentials`);
	if (url.protocol === 'http:' && !isLoopbackHost(url.hostname)) {
		throw new Error(`${label} URL must use HTTPS unless it targets localhost`);
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') {
		throw new Error(`${label} URL must use HTTP or HTTPS`);
	}
	url.hash = '';
	return url;
}

function entryUrlFor(manifestUrl: URL, entry: string): URL {
	const entryUrl = parseInstallUrl(new URL(entry, manifestUrl).toString(), 'plugin entry');
	if (entryUrl.origin !== manifestUrl.origin) throw new Error('entry URL must share the manifest origin');
	const basePath = manifestUrl.pathname.slice(0, manifestUrl.pathname.lastIndexOf('/') + 1);
	if (!entryUrl.pathname.startsWith(basePath)) throw new Error('entry URL must stay beside the manifest');
	return entryUrl;
}

async function fetchText(url: URL, maxBytes: number, label: string): Promise<string> {
	const res = await fetch(url, {
		headers: { accept: label === 'plugin manifest' ? 'application/json,text/plain,*/*' : 'application/javascript,text/plain,*/*' }
	});
	if (!res.ok) throw new Error(`${label} fetch failed: ${res.status}`);
	const size = Number(res.headers.get('content-length') ?? '0');
	if (Number.isFinite(size) && size > maxBytes) throw new Error(`${label} is too large`);
	const body = await res.arrayBuffer();
	if (body.byteLength > maxBytes) throw new Error(`${label} is too large`);
	return new TextDecoder().decode(body);
}

function descriptorFromManifest(vaultId: string, manifest: PluginManifest): PluginDescriptor {
	return {
		id: manifest.id,
		name: manifest.name,
		version: manifest.version,
		description: manifest.description,
		author: manifest.author,
		entry: manifest.entry,
		execution: manifest.execution,
		commands: manifest.commands ?? [],
		moduleUrl: `/api/vaults/${encodeURIComponent(vaultId)}/plugins/${encodeURIComponent(manifest.id)}/module`,
		enabled: true
	};
}

function errorDescriptor(vaultId: string, id: string, message: string): PluginDescriptor {
	return {
		id,
		name: id,
		version: 'invalid',
		entry: 'main.js',
		execution: 'trusted',
		commands: [],
		moduleUrl: `/api/vaults/${encodeURIComponent(vaultId)}/plugins/${encodeURIComponent(id)}/module`,
		enabled: false,
		error: message
	};
}

export function listPlugins(vault: VaultRef): PluginDescriptor[] {
	const root = pluginRoot(vault);
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(root, { withFileTypes: true });
	} catch {
		return [];
	}

	const plugins: PluginDescriptor[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory() || !ID_RE.test(entry.name)) continue;
		const manifestPath = path.join(root, entry.name, 'plugin.json');
		try {
			const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as unknown;
			const manifest = parseManifest(raw, entry.name);
			if (manifest.id !== entry.name) throw new Error('plugin id must match its folder name');
			plugins.push(descriptorFromManifest(vault.id, manifest));
		} catch (e) {
			plugins.push(errorDescriptor(vault.id, entry.name, (e as Error).message));
		}
	}
	return plugins.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export function readPluginModule(vault: VaultRef, pluginId: string): { code: string; filename: string } {
	if (!ID_RE.test(pluginId)) throw new Error('invalid plugin id');
	const descriptor = listPlugins(vault).find((plugin) => plugin.id === pluginId);
	if (!descriptor || !descriptor.enabled) throw new Error(descriptor?.error ?? 'plugin not found');

	const root = path.join(pluginRoot(vault), pluginId);
	const target = path.resolve(root, descriptor.entry);
	const relative = path.relative(root, target);
	if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('plugin module escaped plugin directory');
	if (!fs.existsSync(target)) throw new Error('plugin module not found');
	const stat = fs.statSync(target);
	if (!stat.isFile()) throw new Error('plugin module is not a file');
	return { code: fs.readFileSync(target, 'utf-8'), filename: descriptor.entry };
}

export async function installPluginFromUrl(vault: VaultRef, input: PluginInstallInput): Promise<PluginDescriptor> {
	const manifestUrl = parseInstallUrl(input.manifestUrl, 'plugin manifest');
	const manifestText = await fetchText(manifestUrl, MAX_MANIFEST_BYTES, 'plugin manifest');
	let rawManifest: unknown;
	try {
		rawManifest = JSON.parse(manifestText) as unknown;
	} catch {
		throw new Error('plugin manifest must be valid JSON');
	}
	const manifest = parseManifest(rawManifest, '');
	const entryUrl = entryUrlFor(manifestUrl, manifest.entry);
	const entryCode = await fetchText(entryUrl, MAX_ENTRY_BYTES, 'plugin entry');

	const root = path.resolve(pluginRoot(vault));
	const targetDir = path.resolve(root, manifest.id);
	assertInsideRoot(root, targetDir);
	if (fs.existsSync(targetDir)) {
		if (!input.replace) throw new Error('plugin already installed; enable replace to overwrite');
		fs.rmSync(targetDir, { recursive: true, force: true });
	}

	const entryPath = path.resolve(targetDir, manifest.entry);
	assertInsideRoot(targetDir, entryPath);
	fs.mkdirSync(path.dirname(entryPath), { recursive: true });
	fs.writeFileSync(path.join(targetDir, 'plugin.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
	fs.writeFileSync(entryPath, entryCode, 'utf-8');
	return descriptorFromManifest(vault.id, manifest);
}
