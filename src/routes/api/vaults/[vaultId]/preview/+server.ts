import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'node:fs';
import { getVault } from '$lib/server/vault';
import { resolveInVault, ensureMdExt } from '$lib/server/paths';
import { getIndex } from '$lib/server/indexer';
import { renderMarkdown } from '$lib/server/markdown';
import { splitFrontmatter } from '$lib/server/frontmatter';

const PREVIEW_CHARS = 800;

/**
 * Lightweight hover-preview endpoint. Returns the first ~800 characters of
 * the target note's body, rendered to sanitized HTML. No backlinks, no
 * heavy work — just enough for a preview card.
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	const rel = ensureMdExt(url.searchParams.get('path') || '');
	if (!rel) throw error(400, 'path required');

	let abs: string;
	try { abs = resolveInVault(vault, rel); } catch (e) { throw error(400, (e as Error).message); }
	if (!fs.existsSync(abs)) throw error(404, 'note not found');

	const raw = fs.readFileSync(abs, 'utf-8');
	const { body, frontmatter } = splitFrontmatter(raw);
	let snippet = body.slice(0, PREVIEW_CHARS);
	if (body.length > PREVIEW_CHARS) snippet += '\n\n_…_';

	const idx = getIndex(vault);
	const { html } = renderMarkdown(vault, idx, snippet);
	const title = (typeof frontmatter.title === 'string' && frontmatter.title) || rel.split('/').pop()!.replace(/\.md$/, '');
	return json({ path: rel, title, html });
};
