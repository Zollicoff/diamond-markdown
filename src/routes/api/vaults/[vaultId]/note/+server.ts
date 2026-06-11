import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getVault } from '$lib/server/vault';
import { resolveInVault, ensureMdExt } from '$lib/server/paths';
import { upsertNote, removeNote, getIndex } from '$lib/server/indexer';
import { renderMarkdown } from '$lib/server/markdown';
import { splitFrontmatter } from '$lib/server/frontmatter';
import { commitChange } from '$lib/server/git';
import { renameNoteAtomically, duplicateNoteAtomically } from '$lib/server/rename';

function contentRevision(content: string): string {
	return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

export const GET: RequestHandler = async ({ params, url }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	let rel: string;
	let abs: string;
	try {
		rel = ensureMdExt(url.searchParams.get('path') || '');
		abs = resolveInVault(vault, rel);
	}
	catch (e) { throw error(400, (e as Error).message); }
	if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) throw error(404, 'note not found');
	const content = fs.readFileSync(abs, 'utf-8');
	const stat = fs.statSync(abs);
	const { frontmatter, body } = splitFrontmatter(content);
	const idx = getIndex(vault);
	const { html, outgoingLinks } = renderMarkdown(vault, idx, body);
	const meta = idx.notes.get(rel);
	const backlinks = [...(idx.backlinks.get(rel) ?? [])].map((p) => ({
		path: p,
		title: idx.notes.get(p)?.title ?? p
	}));
	return json({
		path: rel,
		content,
		revision: contentRevision(content),
		mtime: stat.mtimeMs,
		frontmatter,
		body,
		html,
		outgoingLinks,
		backlinks,
		tags: meta?.tags ?? []
	});
};

export const POST: RequestHandler = async ({ params, request }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	const body = (await request.json()) as { path: string; content: string; commitNow?: boolean; expectedRevision?: string };
	if (!body?.path || typeof body?.content !== 'string') throw error(400, 'path and content required');
	let rel: string;
	let abs: string;
	try {
		rel = ensureMdExt(body.path);
		abs = resolveInVault(vault, rel);
	}
	catch (e) { throw error(400, (e as Error).message); }
	const existed = fs.existsSync(abs);
	if (existed && body.expectedRevision) {
		const current = fs.readFileSync(abs, 'utf-8');
		if (contentRevision(current) !== body.expectedRevision && current !== body.content) {
			throw error(409, 'note changed on disk; reload before saving');
		}
	}
	fs.mkdirSync(path.dirname(abs), { recursive: true });
	const tmp = abs + '.tmp';
	fs.writeFileSync(tmp, body.content);
	fs.renameSync(tmp, abs);
	upsertNote(vault, rel, body.content);
	let sha: string | null = null;
	if (body.commitNow !== false) {
		const res = await commitChange(vault, [rel], existed ? 'edit' : 'create', rel);
		sha = res?.sha ?? null;
	}
	return json({ ok: true, created: !existed, sha });
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
	let rel: string;
	let abs: string;
	try {
		rel = ensureMdExt(url.searchParams.get('path') || '');
		abs = resolveInVault(vault, rel);
	}
	catch (e) { throw error(400, (e as Error).message); }
	if (fs.existsSync(abs)) fs.unlinkSync(abs);
	removeNote(vault, rel);
	const res = await commitChange(vault, [rel], 'delete', rel);
	return json({ ok: true, sha: res?.sha ?? null });
};
