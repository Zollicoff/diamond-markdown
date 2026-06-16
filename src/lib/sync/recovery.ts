import type { GitSyncStatus } from '$lib/types';
import { classifyGitSyncRecovery, type GitSyncRecoveryKind } from './status';

export interface GitSyncRecoveryCopy {
	kind: Exclude<GitSyncRecoveryKind, null>;
	title: string;
	subtitle: string;
	badge: string;
	body: string;
}

function commits(count: number): string {
	return `${count} commit${count === 1 ? '' : 's'}`;
}

export function buildGitSyncRecoveryCopy(status: GitSyncStatus | null): GitSyncRecoveryCopy | null {
	const kind = classifyGitSyncRecovery(status);
	if (!kind || !status) return null;

	if (kind === 'setup') {
		return {
			kind,
			title: 'Connect a GitHub repository',
			subtitle: 'Save a remote above, or run the equivalent git commands in this vault.',
			badge: 'Setup',
			body: ''
		};
	}

	if (kind === 'remote-changes') {
		return {
			kind,
			title: 'Remote changes waiting',
			subtitle: `${commits(status.behind)} must be pulled before vault writes continue.`,
			badge: 'Writes paused',
			body: 'Pull the fast-forward changes, then continue editing. Diamond blocks new vault mutations while the last fetched remote is ahead.'
		};
	}

	if (kind === 'local-changes') {
		return {
			kind,
			title: 'Local vault changes',
			subtitle: `${status.files.length} uncommitted file${status.files.length === 1 ? '' : 's'} must be reviewed before syncing.`,
			badge: 'Review',
			body: 'Diamond blocks pull and push while the vault worktree is dirty so git does not mix external edits with sync operations. Commit or stash these changes outside the app, then refresh sync status.'
		};
	}

	if (kind === 'conflicts') {
		return {
			kind,
			title: 'Merge conflicts',
			subtitle: 'Resolve conflicted files before editing vault files.',
			badge: 'Blocked',
			body: ''
		};
	}

	return {
		kind,
		title: 'Diverged history',
		subtitle: `Manual merge required between ${status.sha ?? 'local'} and ${status.remoteSha ?? status.remoteBranch ?? 'remote'}.`,
		badge: 'Blocked',
		body: 'Diamond will not auto-merge vault files. Resolve the git history outside the app, then refresh sync status.'
	};
}
