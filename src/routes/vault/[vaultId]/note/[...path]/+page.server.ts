/**
 * Thin server load — just the vault info so the layout can render.
 * Note data itself is fetched client-side per-pane so multi-pane views
 * can each own their data independently.
 */

import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getVault } from '$lib/server/vault';

export const load: PageServerLoad = async ({ params }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	return {
		vault: { id: vault.id, name: vault.name },
		path: decodeURIComponent(params.path)
	};
};
