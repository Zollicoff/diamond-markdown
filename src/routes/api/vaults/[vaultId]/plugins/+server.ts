import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getVault } from '$lib/server/vault';
import { installPluginFromUrl, listPlugins } from '$lib/server/plugins';

export const GET: RequestHandler = async ({ params }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	return json({ plugins: listPlugins(vault) });
};

export const POST: RequestHandler = async ({ params, request }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	const body = await request.json().catch(() => null) as { manifestUrl?: string; replace?: boolean } | null;
	if (!body?.manifestUrl) throw error(400, 'manifestUrl required');
	try {
		const plugin = await installPluginFromUrl(vault, {
			manifestUrl: body.manifestUrl,
			replace: body.replace === true
		});
		return json({ plugin, plugins: listPlugins(vault), message: `Installed ${plugin.name}.` });
	} catch (e) {
		throw error(400, (e as Error).message);
	}
};
