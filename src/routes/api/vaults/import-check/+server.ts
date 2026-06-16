import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { analyzeVaultImport } from '$lib/server/import-analysis';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null) as { path?: string } | null;
	try {
		return json(analyzeVaultImport(body?.path ?? ''));
	} catch (e) {
		throw error(400, (e as Error).message);
	}
};
