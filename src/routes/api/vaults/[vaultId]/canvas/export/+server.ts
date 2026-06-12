import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CanvasFileError, exportCanvasSvg } from '$lib/server/canvas';
import { getVault } from '$lib/server/vault';

export const GET: RequestHandler = async ({ params, url }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');

	try {
		const exported = exportCanvasSvg(vault, url.searchParams.get('path') || '');
		return new Response(exported.svg, {
			status: 200,
			headers: {
				'content-type': 'image/svg+xml; charset=utf-8',
				'content-disposition': `attachment; filename="${exported.filename}"`,
				'cache-control': 'private, no-store',
				'x-content-type-options': 'nosniff'
			}
		});
	} catch (e) {
		if (e instanceof CanvasFileError) throw error(e.status, e.message);
		const message = (e as Error).message;
		throw error(message.includes('path escapes vault') ? 400 : 500, message);
	}
};
