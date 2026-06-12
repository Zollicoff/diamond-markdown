import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getVault } from '$lib/server/vault';
import { buildVaultTree } from '$lib/server/tree';

export const GET: RequestHandler = async ({ params }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	return json({ tree: buildVaultTree(vault), excludedFolders: vault.excludedFolders ?? [] });
};
