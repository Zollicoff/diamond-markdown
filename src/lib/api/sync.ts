import type { GitSyncResult, GitSyncStatus } from '$lib/types';
import { emit } from '$lib/events';
import { json } from '$lib/api/request';

export type GitSyncAction = 'set-remote' | 'check' | 'fetch' | 'pull' | 'push' | 'sync';

export interface GitSyncActionPayload {
	action: GitSyncAction;
	remoteUrl?: string;
}

export function gitSyncActionPayload(action: GitSyncAction, remoteUrl?: string): GitSyncActionPayload {
	const payload: GitSyncActionPayload = { action };
	if (action === 'set-remote') payload.remoteUrl = remoteUrl ?? '';
	return payload;
}

async function runGitSyncAction(
	vaultId: string,
	payload: GitSyncActionPayload,
	invalidateTree = false
): Promise<GitSyncResult> {
	const res = await json<GitSyncResult>(`/api/vaults/${vaultId}/sync`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(payload)
	});
	if (invalidateTree) emit('tree:invalidate', { vaultId });
	return res;
}

export const syncApi = {
	async syncStatus(vaultId: string): Promise<GitSyncStatus> {
		return json(`/api/vaults/${vaultId}/sync`);
	},

	async setSyncRemote(vaultId: string, remoteUrl: string): Promise<GitSyncResult> {
		return runGitSyncAction(vaultId, gitSyncActionPayload('set-remote', remoteUrl));
	},

	async checkSync(vaultId: string): Promise<GitSyncResult> {
		return runGitSyncAction(vaultId, gitSyncActionPayload('check'));
	},

	async fetchSync(vaultId: string): Promise<GitSyncResult> {
		return runGitSyncAction(vaultId, gitSyncActionPayload('fetch'));
	},

	async pullSync(vaultId: string): Promise<GitSyncResult> {
		return runGitSyncAction(vaultId, gitSyncActionPayload('pull'), true);
	},

	async pushSync(vaultId: string): Promise<GitSyncResult> {
		return runGitSyncAction(vaultId, gitSyncActionPayload('push'));
	},

	async syncNow(vaultId: string): Promise<GitSyncResult> {
		return runGitSyncAction(vaultId, gitSyncActionPayload('sync'), true);
	}
};
