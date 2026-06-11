import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getVault } from '$lib/server/vault';
import {
	createFolder,
	deleteFolder,
	FolderServiceError,
	renameFolder
} from '$lib/server/folder-service';
import { assertVaultCanWrite } from '$lib/server/git';

function fail(e: unknown): never {
	throw error(e instanceof FolderServiceError ? e.status : 409, (e as Error).message);
}

export const POST: RequestHandler = async ({ params, request }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	const body = (await request.json().catch(() => ({}))) as { path?: string };
	try {
		await assertVaultCanWrite(vault);
		return json(createFolder(vault, body.path ?? ''));
	} catch (e) {
		fail(e);
	}
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	const body = (await request.json().catch(() => ({}))) as { from?: string; to?: string };
	try {
		await assertVaultCanWrite(vault);
		return json(await renameFolder(vault, body.from ?? '', body.to ?? ''));
	} catch (e) {
		fail(e);
	}
};

export const DELETE: RequestHandler = async ({ params, url }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	const force = url.searchParams.get('force') === '1';
	try {
		await assertVaultCanWrite(vault);
		return json(await deleteFolder(vault, url.searchParams.get('path') ?? '', force));
	} catch (e) {
		fail(e);
	}
};
