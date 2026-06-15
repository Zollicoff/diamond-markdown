import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { vaultAppearancePreference } from '$lib/server/obsidian-appearance';
import { getVault } from '$lib/server/vault';

export const GET: RequestHandler = async ({ params }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	return json(vaultAppearancePreference(vault.path));
};
