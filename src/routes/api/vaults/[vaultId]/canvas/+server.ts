import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteCanvas, loadCanvas, CanvasFileError, renameCanvas } from '$lib/server/canvas';
import { getVault } from '$lib/server/vault';
import { assertVaultCanWrite, isVaultWriteBlockedError } from '$lib/server/git';

function statusFor(e: unknown): number {
	if (e instanceof CanvasFileError) return e.status;
	if (isVaultWriteBlockedError(e)) return 409;
	const message = (e as Error).message;
	if (message.includes('path escapes vault')) return 400;
	return 400;
}

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

export const PATCH: RequestHandler = async ({ params, request }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	const body = (await request.json().catch(() => ({}))) as { from?: string; to?: string };
	if (!body.from || !body.to) throw error(400, 'from and to required');
	try {
		await assertVaultCanWrite(vault);
		return json(await renameCanvas(vault, body.from, body.to));
	} catch (e) {
		throw error(statusFor(e), (e as Error).message);
	}
};

export const DELETE: RequestHandler = async ({ params, url }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	try {
		await assertVaultCanWrite(vault);
		return json(await deleteCanvas(vault, url.searchParams.get('path') || ''));
	} catch (e) {
		throw error(statusFor(e), (e as Error).message);
	}
};
