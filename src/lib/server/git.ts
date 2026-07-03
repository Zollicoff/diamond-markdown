/**
 * Git integration. Every vault is a git repo; every save is a commit.
 *
 * Lazy init: if the vault dir is not already a git repo, the first save
 * runs `git init` + sets a default identity (if none is globally set).
 */

import fs from 'node:fs';
import path from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';
import type { Vault } from './vault';

const gitCache = new Map<string, SimpleGit>();

async function gitFor(vault: Vault): Promise<SimpleGit> {
	let g = gitCache.get(vault.id);
	if (g) return g;
	g = simpleGit(vault.path);
	gitCache.set(vault.id, g);
	// Lazy init
	const gitDir = path.join(vault.path, '.git');
	if (!fs.existsSync(gitDir)) {
		await g.init();
	}
	// Ensure a usable identity even if the user hasn't set one globally.
	const cfg = await g.listConfig();
	if (!cfg.all['user.email']) await g.addConfig('user.email', 'noreply@diamondmd', false, 'local');
	if (!cfg.all['user.name']) await g.addConfig('user.name', 'Diamond Markdown', false, 'local');
	return g;
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
	await g.add(files);
	// If nothing's actually staged (e.g. content unchanged), skip.
	const status = await g.status();
	if (status.staged.length === 0 && status.not_added.length === 0 && status.modified.length === 0) {
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
