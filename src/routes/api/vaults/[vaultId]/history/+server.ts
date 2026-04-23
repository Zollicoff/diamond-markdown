import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getVault } from '$lib/server/vault';
import { ensureMdExt } from '$lib/server/paths';
import { fileLog } from '$lib/server/git';

export const GET: RequestHandler = async ({ params, url }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	const rel = ensureMdExt(url.searchParams.get('path') || '');
	const log = await fileLog(vault, rel);
	return json({ path: rel, log });
};
