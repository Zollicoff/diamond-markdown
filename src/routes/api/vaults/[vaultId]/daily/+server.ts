import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'node:fs';
import path from 'node:path';
import { getVault } from '$lib/server/vault';
import { resolveInVault } from '$lib/server/paths';
import { upsertNote } from '$lib/server/indexer';
import { commitChange } from '$lib/server/git';

const DAILY_FOLDER = 'Daily Notes';
const TEMPLATE_REL = 'Daily Notes/Template.md';

function todayRel(): string {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${DAILY_FOLDER}/${y}-${m}-${day}.md`;
}

function substituteTemplate(tpl: string, isoDate: string): string {
	// Minimal substitutions. Keep dependencies zero.
	return tpl
		.replace(/\{\{date\}\}/g, isoDate)
		.replace(/\{\{date:YYYY-MM-DD\}\}/g, isoDate)
		.replace(/\{\{time\}\}/g, new Date().toISOString().slice(11, 16));
}

export const POST: RequestHandler = async ({ params }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');

	const rel = todayRel();
	const isoDate = rel.split('/').pop()!.replace(/\.md$/, '');

	const absTarget = resolveInVault(vault, rel);
	if (fs.existsSync(absTarget)) {
		return json({ path: rel, created: false });
	}

	// Ensure folder exists.
	fs.mkdirSync(path.dirname(absTarget), { recursive: true });

	// Build content from template if present, else a simple heading.
	let content: string;
	try {
		const absTpl = resolveInVault(vault, TEMPLATE_REL);
		if (fs.existsSync(absTpl)) {
			const tpl = fs.readFileSync(absTpl, 'utf-8');
			content = substituteTemplate(tpl, isoDate);
		} else {
			content = `# ${isoDate}\n\n`;
		}
	} catch {
		content = `# ${isoDate}\n\n`;
	}

	fs.writeFileSync(absTarget, content);
	upsertNote(vault, rel, content);
	const commit = await commitChange(vault, [rel], 'create', rel);

	return json({ path: rel, created: true, sha: commit?.sha ?? null });
};
