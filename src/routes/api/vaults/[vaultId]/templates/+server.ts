import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'node:fs';
import path from 'node:path';
import { getVault } from '$lib/server/vault';
import { resolveInVault } from '$lib/server/paths';
import { splitFrontmatter } from '$lib/server/frontmatter';

const TEMPLATES_DIR = 'Templates';

interface TemplateMeta { path: string; name: string; }

/**
 * List or read templates from the vault's `Templates/` folder.
 * GET /api/vaults/:id/templates             → list
 * GET /api/vaults/:id/templates?name=NAME   → read body (with substitutions
 *   for {{date}} / {{date:YYYY-MM-DD}} / {{time}} / {{title}})
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');

	const root = path.join(vault.path, TEMPLATES_DIR);
	const name = url.searchParams.get('name');

	if (!name) {
		const list: TemplateMeta[] = [];
		try {
			for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
				if (entry.isFile() && entry.name.endsWith('.md')) {
					list.push({ path: `${TEMPLATES_DIR}/${entry.name}`, name: entry.name.replace(/\.md$/, '') });
				}
			}
		} catch { /* dir doesn't exist yet — return empty */ }
		list.sort((a, b) => a.name.localeCompare(b.name));
		return json({ templates: list });
	}

	// Read mode.
	const rel = `${TEMPLATES_DIR}/${name.endsWith('.md') ? name : name + '.md'}`;
	let abs: string;
	try { abs = resolveInVault(vault, rel); } catch (e) { throw error(400, (e as Error).message); }
	if (!fs.existsSync(abs)) throw error(404, 'template not found');
	const raw = fs.readFileSync(abs, 'utf-8');
	const { body } = splitFrontmatter(raw);
	const title = url.searchParams.get('title') ?? '';
	const today = new Date();
	const isoDate = today.toISOString().slice(0, 10);
	const time = today.toISOString().slice(11, 16);
	const expanded = body
		.replace(/\{\{date(?::YYYY-MM-DD)?\}\}/g, isoDate)
		.replace(/\{\{time\}\}/g, time)
		.replace(/\{\{title\}\}/g, title);
	return json({ name, content: expanded });
};
