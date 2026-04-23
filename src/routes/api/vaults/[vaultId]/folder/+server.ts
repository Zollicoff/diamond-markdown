import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'node:fs';
import path from 'node:path';
import { getVault } from '$lib/server/vault';
import { resolveInVault } from '$lib/server/paths';
import { renameFolderAtomically } from '$lib/server/rename';
import { simpleGit } from 'simple-git';
import { removeNote, getIndex } from '$lib/server/indexer';

export const POST: RequestHandler = async ({ params, request }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	const body = (await request.json().catch(() => ({}))) as { path?: string };
	const rel = (body.path ?? '').replace(/^\/+/, '').trim();
	if (!rel) throw error(400, 'path required');
	let abs: string;
	try { abs = resolveInVault(vault, rel); }
	catch (e) { throw error(400, (e as Error).message); }
	if (fs.existsSync(abs)) {
		if (fs.statSync(abs).isDirectory()) return json({ ok: true, existed: true });
		throw error(409, 'path exists and is not a directory');
	}
	fs.mkdirSync(abs, { recursive: true });
	return json({ ok: true, existed: false });
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	const body = (await request.json().catch(() => ({}))) as { from?: string; to?: string };
	if (!body.from || !body.to) throw error(400, 'from and to required');
	try {
		const res = await renameFolderAtomically(vault, body.from, body.to);
		return json({ ok: true, from: body.from, to: body.to, ...res });
	} catch (e) {
		throw error(409, (e as Error).message);
	}
};

export const DELETE: RequestHandler = async ({ params, url }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	const rel = (url.searchParams.get('path') ?? '').replace(/^\/+/, '').trim();
	const force = url.searchParams.get('force') === '1';
	if (!rel) throw error(400, 'path required');
	let abs: string;
	try { abs = resolveInVault(vault, rel); }
	catch (e) { throw error(400, (e as Error).message); }
	if (!fs.existsSync(abs)) return json({ ok: true });
	if (!fs.statSync(abs).isDirectory()) throw error(409, 'not a directory');

	const entries = fs.readdirSync(abs);
	if (entries.length > 0 && !force) throw error(409, 'folder not empty (pass ?force=1 to recurse)');

	// Enumerate markdown files for index removal before we nuke the tree.
	const idx = getIndex(vault);
	const prefix = rel.replace(/\/+$/, '') + '/';
	const toRemoveFromIndex: string[] = [];
	for (const note of idx.notes.keys()) {
		if (note === rel || note.startsWith(prefix)) toRemoveFromIndex.push(note);
	}

	fs.rmSync(abs, { recursive: true, force: true });
	for (const p of toRemoveFromIndex) removeNote(vault, p);

	// Commit via simple-git to capture the deletion. `git add -A` + commit.
	try {
		const g = simpleGit(vault.path);
		await g.add('.').catch(() => { /* ok */ });
		await g.commit(`delete: ${rel}/ (${toRemoveFromIndex.length} note${toRemoveFromIndex.length === 1 ? '' : 's'})`).catch(() => { /* nothing staged is ok */ });
	} catch { /* best-effort */ }

	return json({ ok: true, removedNotes: toRemoveFromIndex.length });
};
