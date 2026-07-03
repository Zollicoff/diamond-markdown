/**
 * Vault registry. Reads/writes ~/.diamondmd/config.json.
 *
 * First run: copy the bundled sample-vault into a user-data location
 * (default: ~/Documents/Diamond Markdown) and register THAT path. The
 * in-repo sample-vault stays a read-only fixture — user data never
 * leaks back into the program directory. Override the destination with
 * the DIAMOND_DEFAULT_VAULT_DIR env var.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { slugify } from '$lib/util/strings';

export interface Vault {
	id: string;
	name: string;
	path: string;
	/** Folder paths (vault-relative, no trailing slash) skipped from index +
	 *  search + graph + tree. Useful for archive/, attachments/, etc. */
	excludedFolders?: string[];
}

export function setExcludedFolders(id: string, folders: string[]): Vault | null {
	const cfg = load();
	const v = cfg.vaults.find((x) => x.id === id);
	if (!v) return null;
	const cleaned = [...new Set(folders.map((f) => f.replace(/^\/+|\/+$/g, '')).filter(Boolean))];
	v.excludedFolders = cleaned;
	save(cfg);
	return v;
}

export function toggleExcludedFolder(id: string, folder: string): Vault | null {
	const cfg = load();
	const v = cfg.vaults.find((x) => x.id === id);
	if (!v) return null;
	const cleaned = folder.replace(/^\/+|\/+$/g, '');
	const cur = new Set(v.excludedFolders ?? []);
	if (cur.has(cleaned)) cur.delete(cleaned);
	else cur.add(cleaned);
	v.excludedFolders = [...cur];
	save(cfg);
	return v;
}

export interface Config {
	vaults: Vault[];
	activeVaultId: string | null;
}

/**
 * Where the vault registry lives. Defaults to `~/.diamondmd/`. Override
 * with `DIAMOND_CONFIG_DIR` — useful for isolated test runs that don't
 * want to touch the user's real config.
 */
function configDir(): string {
	const override = process.env.DIAMOND_CONFIG_DIR;
	if (override && override.trim()) {
		return path.resolve(override.trim().replace(/^~/, os.homedir()));
	}
	return path.join(os.homedir(), '.diamondmd');
}
const CONFIG_DIR = configDir();
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

function defaultUserVaultDir(): string {
	const override = process.env.DIAMOND_DEFAULT_VAULT_DIR;
	if (override && override.trim()) return path.resolve(override.trim().replace(/^~/, os.homedir()));
	const home = os.homedir();
	const docs = path.join(home, 'Documents');
	const base = fs.existsSync(docs) && fs.statSync(docs).isDirectory() ? docs : home;
	return path.join(base, 'Diamond Markdown');
}

/** Recursive copy. Skips .git and .diamond-publish so users get a clean
 *  starter vault — no inherited commit history, no stale build output. */
function copyTree(src: string, dest: string): void {
	fs.mkdirSync(dest, { recursive: true });
	for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
		if (entry.name === '.git' || entry.name === '.diamond-publish') continue;
		const s = path.join(src, entry.name);
		const d = path.join(dest, entry.name);
		if (entry.isDirectory()) copyTree(s, d);
		else if (entry.isFile()) fs.copyFileSync(s, d);
	}
}

function defaultConfig(): Config {
	const dest = defaultUserVaultDir();
	// If the user already has a directory at the default location, register
	// it as-is (don't overwrite their files). Otherwise copy the bundled
	// sample-vault to seed it with starter content.
	if (!fs.existsSync(dest)) {
		const seed = sampleVaultPath();
		try {
			if (fs.existsSync(seed)) copyTree(seed, dest);
			else fs.mkdirSync(dest, { recursive: true });
		} catch {
			fs.mkdirSync(dest, { recursive: true });
		}
	}
	return {
		vaults: [{ id: 'default', name: 'Diamond Markdown', path: dest }],
		activeVaultId: 'default'
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

/** Vault id slug — 48-char cap, falls back to 'vault'. */
function vaultSlug(s: string): string {
	return slugify(s, { maxLength: 48, fallback: 'vault' });
}

export function addVault(input: { name: string; path: string }): Vault {
	const cfg = load();
	const absPath = path.resolve(input.path.replace(/^~/, os.homedir()));
	if (!fs.existsSync(absPath) || !fs.statSync(absPath).isDirectory()) {
		throw new Error('path is not a directory');
	}
	let id = vaultSlug(input.name);
	let n = 1;
	while (cfg.vaults.some((v) => v.id === id)) {
		id = `${vaultSlug(input.name)}-${++n}`;
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
