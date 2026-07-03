import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listVaults, addVault, getActiveVault } from '$lib/server/vault';

export const GET: RequestHandler = async () => {
	return json({ vaults: listVaults(), activeVaultId: getActiveVault()?.id ?? null });
};

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as { name?: string; path?: string };
	if (!body?.name || !body?.path) throw error(400, 'name and path required');
	try {
		const vault = addVault({ name: body.name, path: body.path });
		return json({ vault });
	} catch (e) {
		throw error(400, (e as Error).message);
	}
};
