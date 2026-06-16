import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getVault } from '$lib/server/vault';
import { readPluginModule } from '$lib/server/plugins';

export const GET: RequestHandler = async ({ params }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	try {
		const { code } = readPluginModule(vault, params.pluginId);
		return new Response(code, {
			status: 200,
			headers: {
				'content-type': 'application/javascript; charset=utf-8',
				'cache-control': 'no-store',
				'x-content-type-options': 'nosniff'
			}
		});
	} catch (e) {
		throw error(404, (e as Error).message);
	}
};
