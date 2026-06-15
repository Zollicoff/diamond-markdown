import fs from 'node:fs';
import path from 'node:path';
import type { Vault } from './vault';
import { BOOKMARKS_REL_PATH, removeBookmarksForPath } from './bookmarks';
import { commitChange, getVaultGit } from './git';
import { getIndex, removeNote } from './indexer';
import { normalizeVaultPath, resolveInVault } from './paths';
import { renameFolderAtomically } from './rename';
import { moveToLocalTrash, trashChildPath } from './trash';

export interface CreateFolderResult {
	ok: true;
	path: string;
	existed: boolean;
}

export interface DeleteFolderResult {
	ok: true;
	path: string;
	removedNotes: number;
	sha: string | null;
}

export interface RenameFolderResult {
	ok: true;
	from: string;
	to: string;
	touched: string[];
	linksUpdated: number;
	movedNotes: number;
	sha: string | null;
}

export class FolderServiceError extends Error {
	constructor(message: string, readonly status = 409) {
		super(message);
		this.name = 'FolderServiceError';
	}
}

function safeFolderPath(input: string): string {
	try {
		return normalizeVaultPath(input.trim());
	} catch (e) {
		throw new FolderServiceError((e as Error).message, 400);
	}
}

function listFilesRecursively(absRoot: string, relRoot: string): string[] {
	const out: string[] = [];
	const walk = (absDir: string, relDir: string): void => {
		for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
			const abs = path.join(absDir, entry.name);
			const rel = `${relDir}/${entry.name}`.replace(/^\/+/, '');
			if (entry.isDirectory()) {
				walk(abs, rel);
			} else {
				out.push(rel.split(path.sep).join('/'));
			}
		}
	};
	walk(absRoot, relRoot);
	return out;
}

function notesUnderFolder(vault: Vault, rel: string): string[] {
	const idx = getIndex(vault);
	const prefix = rel.replace(/\/+$/, '') + '/';
	const notes: string[] = [];
	for (const note of idx.notes.keys()) {
		if (note.startsWith(prefix)) notes.push(note);
	}
	return notes;
}

export function createFolder(vault: Vault, inputPath: string): CreateFolderResult {
	const rel = safeFolderPath(inputPath);
	const abs = resolveInVault(vault, rel);
	if (fs.existsSync(abs)) {
		if (fs.statSync(abs).isDirectory()) return { ok: true, path: rel, existed: true };
		throw new FolderServiceError('path exists and is not a directory');
	}
	fs.mkdirSync(abs, { recursive: true });
	return { ok: true, path: rel, existed: false };
}

export async function renameFolder(vault: Vault, fromInput: string, toInput: string): Promise<RenameFolderResult> {
	if (!fromInput || !toInput) throw new FolderServiceError('from and to required', 400);
	const from = safeFolderPath(fromInput);
	const to = safeFolderPath(toInput);
	try {
		const res = await renameFolderAtomically(vault, from, to);
		return { ok: true, from, to, ...res };
	} catch (e) {
		throw new FolderServiceError((e as Error).message);
	}
}

export async function deleteFolder(vault: Vault, inputPath: string, force = false): Promise<DeleteFolderResult> {
	const rel = safeFolderPath(inputPath);
	const abs = resolveInVault(vault, rel);
	if (!fs.existsSync(abs)) return { ok: true, path: rel, removedNotes: 0, sha: null };
	if (!fs.statSync(abs).isDirectory()) throw new FolderServiceError('not a directory');

	const entries = fs.readdirSync(abs);
	if (entries.length > 0 && !force) {
		throw new FolderServiceError('folder not empty (pass ?force=1 to recurse)');
	}

	const deletedFiles = listFilesRecursively(abs, rel);
	const removedNotes = notesUnderFolder(vault, rel);
	await getVaultGit(vault);
	const trashed = moveToLocalTrash(vault, rel);

	if (!trashed) fs.rmSync(abs, { recursive: true, force: true });
	for (const note of removedNotes) removeNote(vault, note);
	const bookmarks = removeBookmarksForPath(vault, rel, { folder: true });

	const summary = trashed
		? `${rel}/ -> ${trashed.to}/ (${removedNotes.length} note${removedNotes.length === 1 ? '' : 's'})`
		: `${rel}/ (${removedNotes.length} note${removedNotes.length === 1 ? '' : 's'})`;
	const trashedFiles = trashed ? deletedFiles.map((file) => trashChildPath(trashed, file)) : [];
	const files = bookmarks.changed ? [...deletedFiles, ...trashedFiles, BOOKMARKS_REL_PATH] : [...deletedFiles, ...trashedFiles];
	const commit = files.length > 0
		? await commitChange(vault, files, 'delete', summary)
		: null;

	return { ok: true, path: rel, removedNotes: removedNotes.length, sha: commit?.sha ?? null };
}
