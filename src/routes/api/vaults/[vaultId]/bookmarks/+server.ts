import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { assertVaultCanWrite, commitChange, isVaultWriteBlockedError } from '$lib/server/git';
import {
	BOOKMARKS_REL_PATH,
	deleteBookmark,
	listBookmarks,
	saveBookmark
} from '$lib/server/bookmarks';
import { getVault } from '$lib/server/vault';

export const GET: RequestHandler = async ({ params }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	try {
		return json({ bookmarks: listBookmarks(vault) });
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
		const result = saveBookmark(vault, body && typeof body === 'object' ? body : {});
		const commit = await commitChange(
			vault,
			[BOOKMARKS_REL_PATH],
			result.created ? 'create' : 'edit',
			`bookmark ${result.bookmark.title}`
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
		const result = deleteBookmark(vault, url.searchParams.get('path'));
		const commit = result.deleted
			? await commitChange(vault, [BOOKMARKS_REL_PATH], 'edit', 'bookmark')
			: null;
		return json({ ...result, sha: commit?.sha ?? null });
	} catch (e) {
		throw error(isVaultWriteBlockedError(e) ? 409 : 400, (e as Error).message);
	}
};
