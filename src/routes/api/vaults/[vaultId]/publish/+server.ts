import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getVault } from '$lib/server/vault';
import { assertVaultCanWrite } from '$lib/server/git';
import { publishVault } from '$lib/server/publish';

export const POST: RequestHandler = async ({ params }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	try {
		await assertVaultCanWrite(vault);
	} catch (e) {
		throw error(409, (e as Error).message);
	}
	const report = await publishVault(vault);
	return json(report);
};
