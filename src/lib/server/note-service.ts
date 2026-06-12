import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { NoteDoc } from '$lib/types';
import { BOOKMARKS_REL_PATH, removeBookmarksForPath } from './bookmarks';
import { commitChange } from './git';
import { splitFrontmatter } from './frontmatter';
import { getIndex, removeNote, upsertNote } from './indexer';
import { unlinkedMentionsForNote } from './mentions';
import { renderMarkdown } from './markdown';
import { ensureMdExt, resolveInVault } from './paths';
import type { Vault } from './vault';

export interface SaveNoteInput {
	path: string;
	content: string;
	commitNow?: boolean;
	expectedRevision?: string;
}

export interface SaveNoteResult {
	ok: true;
	created: boolean;
	sha: string | null;
	path: string;
	revision: string;
	mtime: number;
}

export interface DeleteNoteResult {
	ok: true;
	sha: string | null;
	path: string;
}

export class NoteConflictError extends Error {
	status = 409;

	constructor(message = 'note changed on disk; reload before saving') {
		super(message);
		this.name = 'NoteConflictError';
	}
}

export function contentRevision(content: string): string {
	return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

export function loadNote(vault: Vault, inputPath: string): NoteDoc {
	const rel = ensureMdExt(inputPath);
	const abs = resolveInVault(vault, rel);
	if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
		throw new Error('note not found');
	}

	const content = fs.readFileSync(abs, 'utf-8');
	const stat = fs.statSync(abs);
	const { frontmatter, body } = splitFrontmatter(content);
	const idx = getIndex(vault);
	const { html, outgoingLinks } = renderMarkdown(vault, idx, body, rel);
	const meta = idx.notes.get(rel);
	const backlinks = [...(idx.backlinks.get(rel) ?? [])].map((p) => ({
		path: p,
		title: idx.notes.get(p)?.title ?? p
	}));
	const unlinkedMentions = unlinkedMentionsForNote(idx, rel);

	return {
		path: rel,
		content,
		revision: contentRevision(content),
		mtime: stat.mtimeMs,
		frontmatter,
		body,
		html,
		outgoingLinks,
		backlinks,
		unlinkedMentions,
		tags: meta?.tags ?? []
	};
}

export async function saveNote(vault: Vault, input: SaveNoteInput): Promise<SaveNoteResult> {
	const rel = ensureMdExt(input.path);
	const abs = resolveInVault(vault, rel);
	const existed = fs.existsSync(abs);

	if (existed && input.expectedRevision) {
		const current = fs.readFileSync(abs, 'utf-8');
		if (contentRevision(current) !== input.expectedRevision && current !== input.content) {
			throw new NoteConflictError();
		}
	}

	fs.mkdirSync(path.dirname(abs), { recursive: true });
	const tmp = abs + '.tmp';
	fs.writeFileSync(tmp, input.content);
	fs.renameSync(tmp, abs);
	upsertNote(vault, rel, input.content);

	let sha: string | null = null;
	if (input.commitNow !== false) {
		const res = await commitChange(vault, [rel], existed ? 'edit' : 'create', rel);
		sha = res?.sha ?? null;
	}

	const stat = fs.statSync(abs);
	return {
		ok: true,
		created: !existed,
		sha,
		path: rel,
		revision: contentRevision(input.content),
		mtime: stat.mtimeMs
	};
}

export async function deleteNote(vault: Vault, inputPath: string): Promise<DeleteNoteResult> {
	const rel = ensureMdExt(inputPath);
	const abs = resolveInVault(vault, rel);
	if (fs.existsSync(abs)) fs.unlinkSync(abs);
	removeNote(vault, rel);
	const bookmarks = removeBookmarksForPath(vault, rel);
	const files = bookmarks.changed ? [rel, BOOKMARKS_REL_PATH] : [rel];
	const res = await commitChange(vault, files, 'delete', rel);
	return { ok: true, sha: res?.sha ?? null, path: rel };
}
