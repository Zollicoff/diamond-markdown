import type { AttachmentMoveResult, AttachmentRef, AttachmentUploadResult } from '$lib/types';
import { emit } from '$lib/events';
import { json } from '$lib/api/request';

export interface AttachmentRenamePayload {
	from: string;
	to: string;
}

export interface AttachmentMovePayload {
	paths: string[];
	folder: string;
}

export function attachmentRenamePayload(from: string, to: string): AttachmentRenamePayload {
	return { from, to };
}

export function attachmentMovePayload(paths: string[], folder: string): AttachmentMovePayload {
	return { paths, folder };
}

function emitAttachmentLinkUpdates(
	vaultId: string,
	touched: string[],
	sha: string | null
): void {
	for (const path of touched) {
		emit('note:saved', { vaultId, path, sha });
	}
}

export const attachmentsApi = {
	async uploadAttachment(vaultId: string, file: File): Promise<AttachmentUploadResult> {
		const form = new FormData();
		form.append('file', file);
		const res = await json<AttachmentUploadResult>(`/api/vaults/${vaultId}/attachment`, {
			method: 'POST',
			body: form
		});
		emit('tree:invalidate', { vaultId });
		return res;
	},

	async attachments(vaultId: string): Promise<AttachmentRef[]> {
		const res = await json<{ attachments: AttachmentRef[] }>(`/api/vaults/${vaultId}/attachment`);
		return res.attachments ?? [];
	},

	async deleteAttachment(vaultId: string, path: string): Promise<void> {
		await json(`/api/vaults/${vaultId}/attachment?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
		emit('tree:invalidate', { vaultId });
	},

	async renameAttachment(
		vaultId: string,
		from: string,
		to: string
	): Promise<{ from: string; to: string; linksUpdated: number; touched: string[]; sha: string | null }> {
		const res = await json<{ from: string; to: string; linksUpdated: number; touched: string[]; sha: string | null }>(
			`/api/vaults/${vaultId}/attachment`,
			{
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(attachmentRenamePayload(from, to))
			}
		);
		emitAttachmentLinkUpdates(vaultId, res.touched, res.sha);
		emit('tree:invalidate', { vaultId });
		return res;
	},

	async moveAttachments(vaultId: string, paths: string[], folder: string): Promise<AttachmentMoveResult> {
		const res = await json<AttachmentMoveResult>(`/api/vaults/${vaultId}/attachment`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(attachmentMovePayload(paths, folder))
		});
		emitAttachmentLinkUpdates(vaultId, res.touched, res.sha);
		emit('tree:invalidate', { vaultId });
		return res;
	}
};
