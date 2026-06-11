import type { GitSyncStatus } from '../types';

export type GitSyncIndicator = 'loading' | 'ok' | 'warn' | 'danger';
export type GitSyncRecoveryKind = 'setup' | 'remote-changes' | 'conflicts' | 'diverged' | null;

export interface GitSyncUiState {
	isBusy: boolean;
	canSaveRemote: boolean;
	canCheck: boolean;
	canFetch: boolean;
	canPull: boolean;
	canPush: boolean;
	indicator: GitSyncIndicator;
	recovery: GitSyncRecoveryKind;
}

export function classifyGitSyncRecovery(status: GitSyncStatus | null): GitSyncRecoveryKind {
	if (!status) return null;
	if (status.needsRemote) return 'setup';
	if (status.conflicted.length > 0) return 'conflicts';
	if (status.diverged) return 'diverged';
	if (status.behind > 0) return 'remote-changes';
	return null;
}

export function gitSyncIndicator(status: GitSyncStatus | null): GitSyncIndicator {
	if (!status) return 'loading';
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
	return {
		isBusy,
		canSaveRemote: remoteUrl.trim().length > 0 && !isBusy,
		canCheck: !!status?.remoteUrl && !isBusy,
		canFetch: !!status?.remoteUrl && !isBusy,
		canPull: !!status?.canPull && !isBusy,
		canPush: !!status?.canPush && !isBusy,
		indicator: gitSyncIndicator(status),
		recovery: classifyGitSyncRecovery(status)
	};
}
