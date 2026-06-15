import fs from 'node:fs';
import path from 'node:path';
import { readObsidianAppConfig } from './obsidian-config';
import { normalizeVaultPath, resolveInVault } from './paths';
import type { Vault } from './vault';

const LOCAL_TRASH_FOLDER = '.trash';

export interface LocalTrashMove {
	from: string;
	to: string;
}

export function shouldUseLocalTrash(vault: Vault): boolean {
	return readObsidianAppConfig(vault.path).trashOption === 'local';
}

function candidateTrashPath(rel: string, index: number): string {
	const target = normalizeVaultPath(`${LOCAL_TRASH_FOLDER}/${rel}`);
	if (index === 1) return target;

	const dir = path.posix.dirname(target);
	const parsed = path.posix.parse(path.posix.basename(target));
	const suffix = `${parsed.name || 'deleted'} ${index}${parsed.ext}`;
	return dir === '.' ? suffix : `${dir}/${suffix}`;
}

function nextAvailableTrashPath(vault: Vault, rel: string): string {
	for (let index = 1; index <= 999; index += 1) {
		const candidate = candidateTrashPath(rel, index);
		if (!fs.existsSync(resolveInVault(vault, candidate))) return candidate;
	}
	throw new Error('could not find an available local trash path');
}

export function trashChildPath(move: LocalTrashMove, childPath: string): string {
	const prefix = move.from.replace(/\/+$/, '');
	if (childPath === prefix) return move.to;
	const suffix = childPath.slice(prefix.length).replace(/^\/+/, '');
	return suffix ? `${move.to}/${suffix}` : move.to;
}

export function moveToLocalTrash(vault: Vault, relPath: string): LocalTrashMove | null {
	const rel = normalizeVaultPath(relPath);
	if (rel === LOCAL_TRASH_FOLDER || rel.startsWith(`${LOCAL_TRASH_FOLDER}/`)) return null;
	if (!shouldUseLocalTrash(vault)) return null;

	const fromAbs = resolveInVault(vault, rel);
	if (!fs.existsSync(fromAbs)) return null;

	const to = nextAvailableTrashPath(vault, rel);
	const toAbs = resolveInVault(vault, to);
	fs.mkdirSync(path.dirname(toAbs), { recursive: true });
	fs.renameSync(fromAbs, toAbs);
	return { from: rel, to };
}
