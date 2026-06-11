import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pluginCatalogDefinition } from '$lib/plugins/catalog';

export const GET: RequestHandler = ({ params }) => {
	const plugin = pluginCatalogDefinition(params.pluginId);
	if (!plugin) throw error(404, 'catalog plugin not found');
	return new Response(plugin.source, {
		headers: {
			'content-type': 'application/javascript; charset=utf-8',
			'cache-control': 'no-store'
		}
	});
};
