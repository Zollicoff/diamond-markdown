import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { preferredObsidianNewNoteFolder } from '$lib/server/obsidian-config';
import { getVault } from '$lib/server/vault';
import type { NewNoteLocation } from '$lib/types';

export const GET: RequestHandler = async ({ params }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	const folder = preferredObsidianNewNoteFolder(vault.path);
	const body: NewNoteLocation = {
		folder,
		source: folder ? 'obsidian-app-config' : 'vault-root'
	};
	return json(body);
};
