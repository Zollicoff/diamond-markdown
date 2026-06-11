import { test, expect } from '@playwright/test';
import type { GitSyncStatus } from '../src/lib/types';
import {
	buildGitSyncUiState,
	classifyGitSyncRecovery,
	gitSyncIndicator
} from '../src/lib/sync/status';

function status(overrides: Partial<GitSyncStatus> = {}): GitSyncStatus {
	return {
		initialized: true,
		branch: 'main',
		sha: 'abc1234',
		remoteUrl: 'https://github.com/owner/repo.git',
		remoteDisplayUrl: 'https://github.com/owner/repo.git',
		upstream: 'origin/main',
		remoteBranch: 'origin/main',
		remoteSha: 'def5678',
		clean: true,
		conflicted: [],
		files: [],
		ahead: 0,
		behind: 0,
		diverged: false,
		mergeBase: null,
		localChanges: [],
		remoteChanges: [],
		conflictCandidates: [],
		canPull: false,
		canPush: true,
		needsRemote: false,
		message: 'Vault is clean and up to date.',
		...overrides
	};
}

test.describe('git sync UI state', () => {
	test('classifies setup, remote changes, conflicts, and divergence', () => {
		expect(classifyGitSyncRecovery(status({ needsRemote: true, remoteUrl: null, remoteDisplayUrl: null }))).toBe('setup');
		expect(classifyGitSyncRecovery(status({ behind: 2, canPull: true, canPush: false }))).toBe('remote-changes');
		expect(classifyGitSyncRecovery(status({ conflicted: ['Shared.md'], clean: false, files: [{ path: 'Shared.md', index: 'U', workingDir: 'U' }] }))).toBe('conflicts');
		expect(classifyGitSyncRecovery(status({ diverged: true, ahead: 1, behind: 1, canPull: false, canPush: false }))).toBe('diverged');
		expect(classifyGitSyncRecovery(status())).toBeNull();
	});

	test('uses danger only for states that require manual resolution', () => {
		expect(gitSyncIndicator(null)).toBe('loading');
		expect(gitSyncIndicator(status())).toBe('ok');
		expect(gitSyncIndicator(status({ needsRemote: true, remoteUrl: null, remoteDisplayUrl: null }))).toBe('warn');
		expect(gitSyncIndicator(status({ clean: false, files: [{ path: 'Draft.md', index: ' ', workingDir: 'M' }] }))).toBe('warn');
		expect(gitSyncIndicator(status({ behind: 1, canPull: true, canPush: false }))).toBe('warn');
		expect(gitSyncIndicator(status({ conflicted: ['Shared.md'], clean: false }))).toBe('danger');
		expect(gitSyncIndicator(status({ diverged: true, ahead: 1, behind: 1, canPull: false, canPush: false }))).toBe('danger');
	});

	test('keeps action gating dependent on both git status and busy state', () => {
		const ready = buildGitSyncUiState(status({ canPull: false, canPush: true }), 'https://github.com/owner/repo.git', null);
		expect(ready).toMatchObject({
			isBusy: false,
			canSaveRemote: true,
			canCheck: true,
			canFetch: true,
			canPull: false,
			canPush: true,
			indicator: 'ok',
			recovery: null
		});

		const busy = buildGitSyncUiState(status({ canPull: true, canPush: false, behind: 1 }), 'https://github.com/owner/repo.git', 'pull');
		expect(busy).toMatchObject({
			isBusy: true,
			canSaveRemote: false,
			canCheck: false,
			canFetch: false,
			canPull: false,
			canPush: false,
			indicator: 'warn',
			recovery: 'remote-changes'
		});
	});
});
