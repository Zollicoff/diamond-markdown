import type { GitSyncStatus } from '../types';

export type GitSyncIndicator = 'loading' | 'ok' | 'warn' | 'danger';
export type GitSyncRecoveryKind = 'setup' | 'local-changes' | 'remote-changes' | 'conflicts' | 'diverged' | null;

export interface GitSyncUiState {
	isBusy: boolean;
	canSaveRemote: boolean;
	canCheck: boolean;
	canFetch: boolean;
	canPull: boolean;
	canPush: boolean;
	canSync: boolean;
	indicator: GitSyncIndicator;
	recovery: GitSyncRecoveryKind;
}

export function classifyGitSyncRecovery(status: GitSyncStatus | null): GitSyncRecoveryKind {
	if (!status) return null;
	if (!status.initialized) return null;
	if (status.needsRemote) return 'setup';
	if (status.conflicted.length > 0) return 'conflicts';
	if (status.diverged) return 'diverged';
	if (!status.clean) return 'local-changes';
	if (status.behind > 0) return 'remote-changes';
	return null;
}

export function gitSyncIndicator(status: GitSyncStatus | null): GitSyncIndicator {
	if (!status) return 'loading';
	if (!status.initialized) return 'warn';
	if (status.conflicted.length > 0 || status.diverged) return 'danger';
	if (status.needsRemote || !status.clean || status.behind > 0) return 'warn';
	return 'ok';
}

export function buildGitSyncUiState(
	status: GitSyncStatus | null,
	remoteUrl: string,
	busy: string | null
): GitSyncUiState {
	const isBusy = busy !== null;
	const canRunSync = !!status && status.initialized && !!status.remoteUrl && status.clean && status.conflicted.length === 0 && !status.diverged && !isBusy;
	return {
		isBusy,
		canSaveRemote: remoteUrl.trim().length > 0 && (status?.initialized ?? true) && !isBusy,
		canCheck: !!status?.initialized && !!status.remoteUrl && !isBusy,
		canFetch: !!status?.initialized && !!status.remoteUrl && !isBusy,
		canPull: !!status?.initialized && !!status.canPull && !isBusy,
		canPush: !!status?.initialized && !!status.canPush && !isBusy,
		canSync: canRunSync,
		indicator: gitSyncIndicator(status),
		recovery: classifyGitSyncRecovery(status)
	};
}
