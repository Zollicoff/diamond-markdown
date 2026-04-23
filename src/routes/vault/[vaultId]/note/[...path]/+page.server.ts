import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import fs from 'node:fs';
import { getVault } from '$lib/server/vault';
import { resolveInVault, ensureMdExt } from '$lib/server/paths';
import { getIndex } from '$lib/server/indexer';
import { renderMarkdown } from '$lib/server/markdown';
import { splitFrontmatter } from '$lib/server/frontmatter';

export const load: PageServerLoad = async ({ params }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');

	const rel = ensureMdExt(decodeURIComponent(params.path));
	let abs: string;
	try { abs = resolveInVault(vault, rel); }
	catch { throw error(400, 'bad path'); }

	const exists = fs.existsSync(abs);
	const content = exists ? fs.readFileSync(abs, 'utf-8') : '';
	const { frontmatter, body } = splitFrontmatter(content);

	const idx = getIndex(vault);
	const { html, outgoingLinks } = renderMarkdown(vault, idx, body);
	const meta = idx.notes.get(rel);
	const backlinks = [...(idx.backlinks.get(rel) ?? [])].map((p) => ({
		path: p,
		title: idx.notes.get(p)?.title ?? p
	}));

	return {
		vault: { id: vault.id, name: vault.name },
		note: {
			path: rel,
			exists,
			content,
			frontmatter,
			body,
			html,
			outgoingLinks,
			backlinks,
			tags: meta?.tags ?? []
		}
	};
};
