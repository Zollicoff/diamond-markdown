import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { editorDisplayPreference } from '$lib/server/obsidian-config';
import { getVault } from '$lib/server/vault';

export const GET: RequestHandler = async ({ params }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	return json(editorDisplayPreference(vault.path));
};
