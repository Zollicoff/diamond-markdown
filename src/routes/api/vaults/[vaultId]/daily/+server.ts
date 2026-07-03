import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'node:fs';
import path from 'node:path';
import { getVault } from '$lib/server/vault';
import { resolveInVault } from '$lib/server/paths';
import { upsertNote } from '$lib/server/indexer';
import { commitChange } from '$lib/server/git';
import { expandTemplate, CURSOR_TOKEN } from '$lib/server/templates';

const DAILY_FOLDER = 'Daily Notes';
const TEMPLATE_REL = 'Daily Notes/Template.md';

function todayRel(): string {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${DAILY_FOLDER}/${y}-${m}-${day}.md`;
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

	// Build content from template if present, else a simple heading. We
	// fix `now` to noon of the dated day so date math like `{{date+1d}}`
	// in the template lands on the correct calendar day regardless of
	// the actual time of creation.
	const [yy, mm, dd] = isoDate.split('-').map(Number);
	const now = new Date(yy, mm - 1, dd, 12, 0, 0);
	let content: string;
	try {
		const absTpl = resolveInVault(vault, TEMPLATE_REL);
		if (fs.existsSync(absTpl)) {
			const tpl = fs.readFileSync(absTpl, 'utf-8');
			// File-on-disk content has the cursor token stripped — only the
			// in-editor `template.insert` flow uses it.
			content = expandTemplate(tpl, { now, title: isoDate }).split(CURSOR_TOKEN).join('');
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
