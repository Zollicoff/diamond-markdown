import type { LayoutServerLoad } from './$types';
import { listVaults, getActiveVault } from '$lib/server/vault';

export const load: LayoutServerLoad = async () => {
	return {
		vaults: listVaults(),
		activeVaultId: getActiveVault()?.id ?? null
	};
};
