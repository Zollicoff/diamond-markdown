import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pluginCatalogItems } from '$lib/plugins/catalog';

export const GET: RequestHandler = ({ url }) => {
	return json({ plugins: pluginCatalogItems(url.origin) });
};
