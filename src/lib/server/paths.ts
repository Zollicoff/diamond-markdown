/**
 * Vault-relative path resolver. The single source of truth for "is this
 * path safe to read/write." Every server handler that touches disk must
 * go through here.
 */

import path from 'node:path';
import fs from 'node:fs';
import type { Vault } from './vault';

function assertInsideRoot(root: string, candidate: string): void {
	if (candidate !== root && !candidate.startsWith(root + path.sep)) {
		throw new Error('path escapes vault');
	}
}

function nearestExistingParent(abs: string): string {
	let cur = path.dirname(abs);
	while (!fs.existsSync(cur)) {
		const parent = path.dirname(cur);
		if (parent === cur) break;
		cur = parent;
	}
	return cur;
}

/**
 * Normalize client-supplied vault paths before filesystem use. Paths are
 * always relative, slash-separated, and never empty.
 */
export function normalizeVaultPath(relPath: string): string {
	if (!relPath || typeof relPath !== 'string') {
		throw new Error('path required');
	}
	if (relPath.includes('\0')) {
		throw new Error('path contains null byte');
	}
	if (path.isAbsolute(relPath) || path.win32.isAbsolute(relPath) || relPath.startsWith('/')) {
		throw new Error('absolute paths not allowed');
	}
	if (relPath.includes('\\')) {
		throw new Error('backslashes not allowed in vault paths');
	}
	const normalized = path.normalize(relPath).split(path.sep).join('/');
	if (!normalized || normalized === '.') {
		throw new Error('path required');
	}
	if (normalized === '..' || normalized.startsWith('../')) {
		throw new Error('path escapes vault');
	}
	return normalized;
}

/**
 * Resolve a vault-relative path to an absolute filesystem path, rejecting
 * anything that tries to escape the vault root via `..` or absolute paths.
 */
export function resolveInVault(vault: Vault, relPath: string): string {
	const normalized = normalizeVaultPath(relPath);
	const abs = path.resolve(vault.path, normalized);
	const root = path.resolve(vault.path);
	assertInsideRoot(root, abs);

	const realRoot = fs.realpathSync.native(root);
	if (fs.existsSync(abs)) {
		assertInsideRoot(realRoot, fs.realpathSync.native(abs));
	} else {
		assertInsideRoot(realRoot, fs.realpathSync.native(nearestExistingParent(abs)));
	}
	return abs;
}

/**
 * Convert an absolute path to a vault-relative one. Throws if the path is
 * outside the vault.
 */
export function relativeToVault(vault: Vault, absPath: string): string {
	const rel = path.relative(vault.path, absPath);
	if (rel.startsWith('..') || path.isAbsolute(rel)) {
		throw new Error('path outside vault');
	}
	return rel.split(path.sep).join('/');
}

/**
 * Append `.md` if the caller didn't.
 */
export function ensureMdExt(p: string): string {
	const normalized = normalizeVaultPath(p);
	return /\.[a-z0-9]+$/i.test(normalized) ? normalized : normalized + '.md';
}
