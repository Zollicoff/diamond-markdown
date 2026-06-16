import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getVault } from '$lib/server/vault';
import { getIndex } from '$lib/server/indexer';
import type { NoteLinkTarget } from '$lib/types';

export const GET: RequestHandler = async ({ params }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');

	const idx = getIndex(vault);
	const targets: NoteLinkTarget[] = [...idx.notes.values()].map((meta) => ({
		path: meta.notePath,
		title: meta.title,
		aliases: meta.aliases,
		stem: meta.stem
	}));
	return json({ targets });
};
