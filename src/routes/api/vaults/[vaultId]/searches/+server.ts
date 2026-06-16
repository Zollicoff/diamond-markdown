import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { assertVaultCanWrite, commitChange, isVaultWriteBlockedError } from '$lib/server/git';
import {
	deleteSavedSearch,
	listSavedSearches,
	SAVED_SEARCHES_REL_PATH,
	saveSavedSearch
} from '$lib/server/saved-searches';
import { getVault } from '$lib/server/vault';

export const GET: RequestHandler = async ({ params }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	try {
		return json({ searches: listSavedSearches(vault) });
	} catch (e) {
		throw error(400, (e as Error).message);
	}
};

export const POST: RequestHandler = async ({ params, request }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	const body = await request.json().catch(() => null);
	try {
		await assertVaultCanWrite(vault);
		const result = saveSavedSearch(vault, body && typeof body === 'object' ? body : {});
		const commit = await commitChange(
			vault,
			[SAVED_SEARCHES_REL_PATH],
			result.created ? 'create' : 'edit',
			`saved search ${result.search.name}`
		);
		return json({ ...result, sha: commit?.sha ?? null });
	} catch (e) {
		throw error(isVaultWriteBlockedError(e) ? 409 : 400, (e as Error).message);
	}
};

export const DELETE: RequestHandler = async ({ params, url }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	try {
		await assertVaultCanWrite(vault);
		const result = deleteSavedSearch(vault, url.searchParams.get('id'));
		const commit = result.deleted
			? await commitChange(vault, [SAVED_SEARCHES_REL_PATH], 'edit', 'saved search')
			: null;
		return json({ ...result, sha: commit?.sha ?? null });
	} catch (e) {
		throw error(isVaultWriteBlockedError(e) ? 409 : 400, (e as Error).message);
	}
};
