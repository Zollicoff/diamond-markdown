/**
 * Vault registry. Reads/writes ~/.diamondmd/config.json.
 *
 * First run — if the config doesn't exist — we bootstrap with the in-repo
 * sample-vault so the app has something to render without any setup.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export interface Vault {
	id: string;
	name: string;
	path: string;
}

export interface Config {
	vaults: Vault[];
	activeVaultId: string | null;
}

const CONFIG_DIR = path.join(os.homedir(), '.diamondmd');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

// Repo-relative sample vault — works in dev (src/) and prod (build/) alike,
// since import.meta.url resolves to the built file's location.
function sampleVaultPath(): string {
	const here = path.dirname(fileURLToPath(import.meta.url));
	// In dev/src: here = src/lib/server. In build: here = build/.../server.
	// Walk up until we find the repo root containing sample-vault/.
	let cur = here;
	for (let i = 0; i < 10; i++) {
		const candidate = path.join(cur, 'sample-vault');
		if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
			return candidate;
		}
		const parent = path.dirname(cur);
		if (parent === cur) break;
		cur = parent;
	}
	// Fallback: current working directory.
	return path.resolve(process.cwd(), 'sample-vault');
}

function defaultConfig(): Config {
	const sample = sampleVaultPath();
	return {
		vaults: [{ id: 'sample', name: 'Sample', path: sample }],
		activeVaultId: 'sample'
	};
}

let _config: Config | null = null;

function load(): Config {
	if (_config) return _config;
	try {
		if (fs.existsSync(CONFIG_PATH)) {
			_config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as Config;
			if (!_config.vaults || !Array.isArray(_config.vaults)) _config.vaults = [];
			return _config;
		}
	} catch { /* fall through to defaults */ }
	_config = defaultConfig();
	save(_config);
	return _config;
}

function save(cfg: Config): void {
	fs.mkdirSync(CONFIG_DIR, { recursive: true });
	fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
	_config = cfg;
}

export function listVaults(): Vault[] {
	return load().vaults;
}

export function getVault(id: string): Vault | null {
	return load().vaults.find((v) => v.id === id) ?? null;
}

export function getActiveVault(): Vault | null {
	const cfg = load();
	return cfg.activeVaultId ? getVault(cfg.activeVaultId) : cfg.vaults[0] ?? null;
}

export function setActiveVault(id: string): void {
	const cfg = load();
	if (!cfg.vaults.some((v) => v.id === id)) throw new Error('unknown vault');
	cfg.activeVaultId = id;
	save(cfg);
}

function slugify(s: string): string {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48) || 'vault';
}

export function addVault(input: { name: string; path: string }): Vault {
	const cfg = load();
	const absPath = path.resolve(input.path.replace(/^~/, os.homedir()));
	if (!fs.existsSync(absPath) || !fs.statSync(absPath).isDirectory()) {
		throw new Error('path is not a directory');
	}
	let id = slugify(input.name);
	let n = 1;
	while (cfg.vaults.some((v) => v.id === id)) {
		id = `${slugify(input.name)}-${++n}`;
	}
	const vault: Vault = { id, name: input.name, path: absPath };
	cfg.vaults.push(vault);
	if (!cfg.activeVaultId) cfg.activeVaultId = id;
	save(cfg);
	return vault;
}

export function removeVault(id: string): void {
	const cfg = load();
	cfg.vaults = cfg.vaults.filter((v) => v.id !== id);
	if (cfg.activeVaultId === id) {
		cfg.activeVaultId = cfg.vaults[0]?.id ?? null;
	}
	save(cfg);
}
