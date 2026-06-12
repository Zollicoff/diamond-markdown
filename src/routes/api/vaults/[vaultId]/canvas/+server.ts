import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadCanvas, CanvasFileError } from '$lib/server/canvas';
import { getVault } from '$lib/server/vault';

export const GET: RequestHandler = async ({ params, url }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	try {
		return json(loadCanvas(vault, url.searchParams.get('path') || ''));
	} catch (e) {
		if (e instanceof CanvasFileError) throw error(e.status, e.message);
		const message = (e as Error).message;
		throw error(message.includes('path escapes vault') ? 400 : 500, message);
	}
};
