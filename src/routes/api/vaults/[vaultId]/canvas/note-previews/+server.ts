import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadCanvasNotePreviews } from '$lib/server/canvas-note-previews';
import { getVault } from '$lib/server/vault';

export const POST: RequestHandler = async ({ params, request }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	const body = (await request.json().catch(() => ({}))) as { paths?: unknown };
	if (!Array.isArray(body.paths)) throw error(400, 'paths array required');
	return json({ previews: loadCanvasNotePreviews(vault, body.paths) });
};
