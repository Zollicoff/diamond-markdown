import fs from 'node:fs';
import path from 'node:path';
import type { VaultRef } from '$lib/types';
import type { PluginCommandManifest, PluginDescriptor, PluginManifest } from '$lib/plugins/types';

const PLUGIN_ROOT = '.diamondmd/plugins';
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

function cleanEntry(entry: unknown): string {
	const value = typeof entry === 'string' && entry.trim() ? entry.trim() : 'main.js';
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

function descriptorFromManifest(vaultId: string, manifest: PluginManifest): PluginDescriptor {
	return {
		id: manifest.id,
		name: manifest.name,
		version: manifest.version,
		description: manifest.description,
		author: manifest.author,
		entry: manifest.entry,
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
