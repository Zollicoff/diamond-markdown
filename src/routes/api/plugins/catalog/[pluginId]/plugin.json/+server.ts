import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pluginCatalogDefinition } from '$lib/plugins/catalog';

export const GET: RequestHandler = ({ params }) => {
	const plugin = pluginCatalogDefinition(params.pluginId);
	if (!plugin) throw error(404, 'catalog plugin not found');
	return json(plugin.manifest);
};
