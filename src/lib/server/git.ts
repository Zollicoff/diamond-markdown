/**
 * Git integration. Every vault is a git repo; every save is a commit.
 *
 * Lazy init: if the vault dir is not already a git repo, the first git
 * operation runs `git init`, sets a default identity, and creates an
 * `init: vault` baseline commit for existing files.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { simpleGit, type SimpleGit } from 'simple-git';
import type { Vault } from './vault';

const gitCache = new Map<string, SimpleGit>();
const gitInitCache = new Map<string, Promise<SimpleGit>>();
const VAULT_WRITE_BLOCKED_MESSAGES = new Set([
	'resolve merge conflicts before editing vault files',
	'local and remote histories diverged; resolve sync before editing vault files',
	'pull remote changes before editing vault files'
]);

async function initializeGit(vault: Vault): Promise<SimpleGit> {
	// Lazy init. Use explicit `git -C <vault> init` before constructing the
	// long-lived simple-git instance so vaults nested inside another repo do
	// not accidentally operate on the parent repository.
	if (!fs.existsSync(vault.path) || !fs.statSync(vault.path).isDirectory()) {
		throw new Error('vault directory is unavailable');
	}
	const gitDir = path.join(vault.path, '.git');
	const initialized = !fs.existsSync(gitDir);
	if (initialized) {
		execFileSync('git', ['-C', vault.path, 'init'], { stdio: 'ignore' });
	}
	const g = simpleGit(vault.path);

	// Ensure a usable identity even if the user hasn't set one globally.
	const cfg = await g.listConfig();
	if (!cfg.all['user.email']) await g.addConfig('user.email', 'noreply@diamondmd', false, 'local');
	if (!cfg.all['user.name']) await g.addConfig('user.name', 'Diamond Markdown', false, 'local');

	if (initialized) {
		await g.add('.');
		try {
			await g.commit('init: vault');
		} catch (err) {
			if (!String(err).includes('nothing to commit')) throw err;
		}
	}

	gitCache.set(gitCacheKey(vault), g);
	return g;
}

function gitCacheKey(vault: Vault): string {
	return `${vault.id}:${path.resolve(vault.path)}`;
}

async function pointsAtVaultWorktree(g: SimpleGit, vault: Vault): Promise<boolean> {
	try {
		const topLevel = (await g.raw(['rev-parse', '--show-toplevel'])).trim();
		return path.resolve(topLevel) === path.resolve(vault.path);
	} catch {
		return false;
	}
}

async function gitFor(vault: Vault): Promise<SimpleGit> {
	const key = gitCacheKey(vault);
	const cached = gitCache.get(key);
	if (cached) {
		const gitDir = path.join(vault.path, '.git');
		if (fs.existsSync(gitDir) && await pointsAtVaultWorktree(cached, vault)) return cached;
		gitCache.delete(key);
	}

	const pending = gitInitCache.get(key);
	if (pending) return pending;

	const initializing = initializeGit(vault).finally(() => {
		gitInitCache.delete(key);
	});
	gitInitCache.set(key, initializing);
	return initializing;
}

export async function rawOrNull(g: SimpleGit, args: string[]): Promise<string | null> {
	try {
		const out = await g.raw(args);
		const trimmed = out.trim();
		return trimmed || null;
	} catch {
		return null;
	}
}

export async function hasRef(g: SimpleGit, ref: string): Promise<boolean> {
	try {
		await g.raw(['show-ref', '--verify', '--quiet', ref]);
		return true;
	} catch {
		return false;
	}
}

export function parseAheadBehind(raw: string | null): { ahead: number; behind: number } {
	if (!raw) return { ahead: 0, behind: 0 };
	const [aheadRaw, behindRaw] = raw.split(/\s+/);
	return {
		ahead: Number.parseInt(aheadRaw ?? '0', 10) || 0,
		behind: Number.parseInt(behindRaw ?? '0', 10) || 0
	};
}

export async function getVaultGit(vault: Vault): Promise<SimpleGit> {
	return gitFor(vault);
}

export async function assertVaultCanWrite(vault: Vault): Promise<void> {
	const g = await gitFor(vault);
	const status = await g.status();
	if ((status.conflicted ?? []).length > 0) {
		throw new Error('resolve merge conflicts before editing vault files');
	}

	const remoteUrl = await rawOrNull(g, ['remote', 'get-url', 'origin']);
	const branch = status.current || await rawOrNull(g, ['rev-parse', '--abbrev-ref', 'HEAD']);
	if (!remoteUrl || !branch || branch === 'HEAD') return;

	const remoteBranch = `origin/${branch}`;
	if (!(await hasRef(g, `refs/remotes/${remoteBranch}`))) return;

	const { ahead, behind } = parseAheadBehind(
		await rawOrNull(g, ['rev-list', '--left-right', '--count', `HEAD...${remoteBranch}`])
	);
	if (ahead > 0 && behind > 0) {
		throw new Error('local and remote histories diverged; resolve sync before editing vault files');
	}
	if (behind > 0) {
		throw new Error('pull remote changes before editing vault files');
	}
}

export function isVaultWriteBlockedError(e: unknown): boolean {
	return e instanceof Error && VAULT_WRITE_BLOCKED_MESSAGES.has(e.message);
}

type Verb = 'create' | 'edit' | 'rename' | 'delete';

export async function commitChange(
	vault: Vault,
	files: string[],
	verb: Verb,
	summary: string
): Promise<{ sha: string } | null> {
	if (files.length === 0) return null;
	const g = await gitFor(vault);
	await g.raw(['add', '-A', '--', ...files]);
	// If nothing is staged, skip. `git status()` is not reliable enough here,
	// and `git diff --quiet` can treat a pure rename with identical content as
	// no patch. Name-status reports staged renames/deletes explicitly.
	const staged = await g.raw(['diff', '--cached', '--name-status', '--', ...files]);
	if (!staged.trim()) {
		return null;
	}
	try {
		const res = await g.commit(`${verb}: ${summary}`);
		return { sha: res.commit };
	} catch (err) {
		// "nothing to commit" is not an error for our purposes.
		if (String(err).includes('nothing to commit')) return null;
		throw err;
	}
}

export interface FileLogEntry {
	sha: string;
	shortSha: string;
	date: string;
	author: string;
	message: string;
}

export async function fileLog(vault: Vault, relPath: string, limit = 50): Promise<FileLogEntry[]> {
	try {
		const g = await gitFor(vault);
		const log = await g.log({ file: relPath, maxCount: limit });
		return log.all.map((entry) => ({
			sha: entry.hash,
			shortSha: entry.hash.slice(0, 7),
			date: entry.date,
			author: entry.author_name,
			message: entry.message
		}));
	} catch {
		return [];
	}
}

/**
 * Read a file's contents at a specific commit. Returns null if the file
 * did not exist at that sha (e.g. looking before the first commit).
 */
export async function fileAtSha(vault: Vault, relPath: string, sha: string): Promise<string | null> {
	try {
		const g = await gitFor(vault);
		return await g.show([`${sha}:${relPath}`]);
	} catch {
		return null;
	}
}
