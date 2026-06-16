import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getVault } from '$lib/server/vault';
import {
	checkGitHubRemote,
	fetchGitHubRemote,
	getGitSyncStatus,
	pullGitHubRemote,
	pushGitHubRemote,
	setGitHubRemote,
	syncGitHubRemote
} from '$lib/server/git-sync';

type SyncAction = 'set-remote' | 'check' | 'fetch' | 'pull' | 'push' | 'sync';

export const GET: RequestHandler = async ({ params }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	return json(await getGitSyncStatus(vault));
};

export const POST: RequestHandler = async ({ params, request }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');

	const body = (await request.json().catch(() => ({}))) as {
		action?: SyncAction;
		remoteUrl?: string;
	};

	try {
		if (body.action === 'set-remote') {
			return json(await setGitHubRemote(vault, body.remoteUrl ?? ''));
		}
		if (body.action === 'check') {
			return json(await checkGitHubRemote(vault));
		}
		if (body.action === 'fetch') {
			return json(await fetchGitHubRemote(vault));
		}
		if (body.action === 'pull') {
			return json(await pullGitHubRemote(vault));
		}
		if (body.action === 'push') {
			return json(await pushGitHubRemote(vault));
		}
		if (body.action === 'sync') {
			return json(await syncGitHubRemote(vault));
		}
		throw error(400, 'unknown sync action');
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		throw error(409, (e as Error).message);
	}
};
