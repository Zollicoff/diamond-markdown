import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { assertVaultCanWrite, isVaultWriteBlockedError } from '$lib/server/git';
import { deleteAttachment, listAttachments, renameAttachment, saveAttachment } from '$lib/server/attachment-service';
import { getVault } from '$lib/server/vault';

function isUploadedFile(value: FormDataEntryValue | null): value is File {
	return typeof value === 'object'
		&& value !== null
		&& 'arrayBuffer' in value
		&& 'name' in value
		&& typeof value.arrayBuffer === 'function'
		&& typeof value.name === 'string';
}

function mutationStatus(e: unknown): number {
	const message = (e as Error).message;
	if (message.includes('path escapes vault')) return 400;
	if (message.includes('absolute paths not allowed')) return 400;
	if (message.includes('not an attachment')) return 400;
	if (message.includes('attachment not found')) return 404;
	if (message.includes('destination')) return 400;
	if (message.includes('attachment is larger')) return 413;
	if (isVaultWriteBlockedError(e)) return 409;
	return 400;
}

export const GET: RequestHandler = async ({ params }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	try {
		return json({ attachments: listAttachments(vault) });
	} catch (e) {
		throw error(mutationStatus(e), (e as Error).message);
	}
};

export const POST: RequestHandler = async ({ params, request }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');

	const form = await request.formData();
	const file = form.get('file');
	if (!isUploadedFile(file) || file.size <= 0) throw error(400, 'file required');

	try {
		await assertVaultCanWrite(vault);
		return json(await saveAttachment(vault, file));
	} catch (e) {
		throw error(mutationStatus(e), (e as Error).message);
	}
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');

	const body = await request.json().catch(() => ({})) as { from?: string; to?: string };
	if (!body.from || !body.to) throw error(400, 'from and to required');

	try {
		await assertVaultCanWrite(vault);
		return json(await renameAttachment(vault, body.from, body.to));
	} catch (e) {
		throw error(mutationStatus(e), (e as Error).message);
	}
};

export const DELETE: RequestHandler = async ({ params, url }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');

	try {
		await assertVaultCanWrite(vault);
		return json(await deleteAttachment(vault, url.searchParams.get('path') || ''));
	} catch (e) {
		throw error(mutationStatus(e), (e as Error).message);
	}
};
