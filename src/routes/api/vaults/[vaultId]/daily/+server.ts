import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'node:fs';
import path from 'node:path';
import { getVault } from '$lib/server/vault';
import { resolveInVault } from '$lib/server/paths';
import { upsertNote } from '$lib/server/indexer';
import { assertVaultCanWrite, commitChange } from '$lib/server/git';
import { expandTemplate, CURSOR_TOKEN } from '$lib/server/templates';
import { dailyNotePlan } from '$lib/server/obsidian-daily';

export const POST: RequestHandler = async ({ params }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');

	const plan = dailyNotePlan(vault.path);
	const rel = plan.path;

	const absTarget = resolveInVault(vault, rel);
	if (fs.existsSync(absTarget)) {
		return json({ path: rel, created: false });
	}

	try {
		await assertVaultCanWrite(vault);
	} catch (e) {
		throw error(409, (e as Error).message);
	}

	// Ensure folder exists.
	fs.mkdirSync(path.dirname(absTarget), { recursive: true });

	// Build content from template if present, else a simple heading. The
	// plan fixes `date` to noon so template date math lands on the dated
	// day regardless of the actual creation time.
	let content: string;
	try {
		const absTpl = resolveInVault(vault, plan.templateRel);
		if (fs.existsSync(absTpl)) {
			const tpl = fs.readFileSync(absTpl, 'utf-8');
			// File-on-disk content has the cursor token stripped — only the
			// in-editor `template.insert` flow uses it.
			content = expandTemplate(tpl, { now: plan.date, title: plan.title }).split(CURSOR_TOKEN).join('');
		} else {
			content = `# ${plan.title}\n\n`;
		}
	} catch {
		content = `# ${plan.title}\n\n`;
	}

	fs.writeFileSync(absTarget, content);
	upsertNote(vault, rel, content);
	const commit = await commitChange(vault, [rel], 'create', rel);

	return json({ path: rel, created: true, sha: commit?.sha ?? null });
};
