/**
 * Vault-relative path resolver. The single source of truth for "is this
 * path safe to read/write." Every server handler that touches disk must
 * go through here.
 */

import path from 'node:path';
import type { Vault } from './vault';

/**
 * Resolve a vault-relative path to an absolute filesystem path, rejecting
 * anything that tries to escape the vault root via `..` or absolute paths.
 */
export function resolveInVault(vault: Vault, relPath: string): string {
	if (!relPath || typeof relPath !== 'string') {
		throw new Error('path required');
	}
	// Normalize: strip leading slash, collapse '..', reject absolute input.
	const normalized = relPath.replace(/^\/+/, '');
	if (path.isAbsolute(normalized)) {
		throw new Error('absolute paths not allowed');
	}
	const abs = path.resolve(vault.path, normalized);
	const root = path.resolve(vault.path);
	if (abs !== root && !abs.startsWith(root + path.sep)) {
		throw new Error('path escapes vault');
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
	return /\.[a-z0-9]+$/i.test(p) ? p : p + '.md';
}
