import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getVault } from '$lib/server/vault';
import { isReadOnlyMode } from '$lib/server/read-only';
import { buildVaultTree } from '$lib/server/tree';

export const load: LayoutServerLoad = async ({ params }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	return {
		vault: {
			id: vault.id,
			name: vault.name,
			path: vault.path,
			excludedFolders: vault.excludedFolders ?? []
		},
		tree: buildVaultTree(vault),
		readOnly: isReadOnlyMode()
	};
};
