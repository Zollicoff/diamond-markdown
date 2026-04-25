import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getVault, toggleExcludedFolder } from '$lib/server/vault';
import { rebuildIndex } from '$lib/server/indexer';

/**
 * Toggle a folder's excluded-from-index state.
 * POST { folder: "archive" }   →   add or remove from vault.excludedFolders
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	const body = await request.json().catch(() => ({}));
	const folder = typeof body.folder === 'string' ? body.folder : '';
	if (!folder) throw error(400, 'folder required');
	const updated = toggleExcludedFolder(vault.id, folder);
	if (!updated) throw error(404, 'vault not found after update');
	rebuildIndex(updated);
	return json({ excludedFolders: updated.excludedFolders ?? [] });
};
