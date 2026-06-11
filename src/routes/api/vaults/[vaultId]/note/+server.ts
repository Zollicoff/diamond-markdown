import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getVault } from '$lib/server/vault';
import { deleteNote, loadNote, NoteConflictError, saveNote } from '$lib/server/note-service';
import { ensureMdExt } from '$lib/server/paths';
import { renameNoteAtomically, duplicateNoteAtomically } from '$lib/server/rename';

export const GET: RequestHandler = async ({ params, url }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	try {
		return json(loadNote(vault, url.searchParams.get('path') || ''));
	}
	catch (e) {
		const message = (e as Error).message;
		throw error(message === 'note not found' ? 404 : 400, message);
	}
};

export const POST: RequestHandler = async ({ params, request }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	const body = (await request.json()) as { path: string; content: string; commitNow?: boolean; expectedRevision?: string };
	if (!body?.path || typeof body?.content !== 'string') throw error(400, 'path and content required');
	try {
		return json(await saveNote(vault, body));
	}
	catch (e) {
		throw error(e instanceof NoteConflictError ? e.status : 400, (e as Error).message);
	}
};

/**
 * Rename or move a note. Body: { from, to }. Rewrites incoming wikilinks
 * across the vault and commits everything as one `rename:` commit.
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	const body = (await request.json().catch(() => ({}))) as { from?: string; to?: string; duplicate?: boolean };
	if (!body.from) throw error(400, 'from required');

	if (body.duplicate) {
		try {
			const src = ensureMdExt(body.from);
			const dst = body.to ? ensureMdExt(body.to) : undefined;
			const res = await duplicateNoteAtomically(vault, src, dst);
			return json({ ok: true, ...res });
		} catch (e) {
			throw error(409, (e as Error).message);
		}
	}

	if (!body.to) throw error(400, 'to required for rename');
	try {
		const from = ensureMdExt(body.from);
		const to = ensureMdExt(body.to);
		const res = await renameNoteAtomically(vault, from, to);
		return json({ ok: true, from, to, ...res });
	} catch (e) {
		throw error(409, (e as Error).message);
	}
};

export const DELETE: RequestHandler = async ({ params, url }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	try {
		return json(await deleteNote(vault, url.searchParams.get('path') || ''));
	}
	catch (e) { throw error(400, (e as Error).message); }
};
