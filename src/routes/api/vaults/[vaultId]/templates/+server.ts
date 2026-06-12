import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'node:fs';
import path from 'node:path';
import { getVault } from '$lib/server/vault';
import { normalizeVaultPath, resolveInVault } from '$lib/server/paths';
import { splitFrontmatter } from '$lib/server/frontmatter';
import { expandTemplate } from '$lib/server/templates';
import { templateRuntimeSettings } from '$lib/server/obsidian-templates';

interface TemplateMeta { path: string; name: string; }

/**
 * List or read templates from the configured Obsidian Templates folder.
 * GET /api/vaults/:id/templates             → list
 * GET /api/vaults/:id/templates?path=PATH   → read body (with full token
 *   substitution; see src/lib/server/templates.ts)
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');

	const settings = templateRuntimeSettings(vault.path);
	const root = resolveInVault(vault, settings.folder);
	const requestedPath = url.searchParams.get('path');
	const requestedName = url.searchParams.get('name');

	if (!requestedPath && !requestedName) {
		const list: TemplateMeta[] = [];
		try {
			walkTemplates(root, settings.folder, settings.folder, list);
		} catch { /* dir doesn't exist yet — return empty */ }
		list.sort((a, b) => a.name.localeCompare(b.name));
		return json({ templates: list, folder: settings.folder });
	}

	// Read mode.
	let rel: string;
	try {
		rel = templateRelFromQuery(settings.folder, requestedPath, requestedName);
	} catch (e) {
		throw error(400, (e as Error).message);
	}
	let abs: string;
	try { abs = resolveInVault(vault, rel); } catch (e) { throw error(400, (e as Error).message); }
	if (!fs.existsSync(abs)) throw error(404, 'template not found');
	const raw = fs.readFileSync(abs, 'utf-8');
	const { body } = splitFrontmatter(raw);
	const title = url.searchParams.get('title') ?? '';
	const expanded = expandTemplate(body, {
		title,
		dateFormat: settings.dateFormat,
		timeFormat: settings.timeFormat
	});
	return json({ name: templateName(rel, settings.folder), path: rel, content: expanded });
};

function walkTemplates(absDir: string, relDir: string, baseFolder: string, list: TemplateMeta[]): void {
	for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
		if (entry.isSymbolicLink()) continue;
		const rel = `${relDir}/${entry.name}`;
		const abs = path.join(absDir, entry.name);
		if (entry.isDirectory()) {
			walkTemplates(abs, rel, baseFolder, list);
			continue;
		}
		if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
			list.push({
				path: rel,
				name: templateName(rel, baseFolder)
			});
		}
	}
}

function templateName(rel: string, folder: string): string {
	const prefix = `${folder}/`;
	const inner = rel.startsWith(prefix) ? rel.slice(prefix.length) : rel;
	return inner.replace(/\.md$/i, '');
}

function templateRelFromQuery(folder: string, requestedPath: string | null, requestedName: string | null): string {
	const raw = requestedPath ?? `${requestedName ?? ''}${requestedName?.toLowerCase().endsWith('.md') ? '' : '.md'}`;
	const rel = normalizeVaultPath(requestedPath ? raw : `${folder}/${raw}`);
	if (!rel.toLowerCase().endsWith('.md')) throw new Error('template must be a markdown file');
	if (rel !== folder && !rel.startsWith(`${folder}/`)) throw new Error('template path must stay inside the configured templates folder');
	return rel;
}
