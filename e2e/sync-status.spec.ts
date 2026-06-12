import { test, expect } from '@playwright/test';
import type { GitSyncStatus } from '../src/lib/types';
import {
	buildGitSyncUiState,
	classifyGitSyncRecovery,
	gitSyncIndicator
} from '../src/lib/sync/status';
import { buildGitSyncRecoveryCopy } from '../src/lib/sync/recovery';
import { buildGitSyncResolutionCommands, buildGitSyncSetupCommands } from '../src/lib/sync/commands';

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
	test('classifies setup, local changes, remote changes, conflicts, and divergence', () => {
		expect(classifyGitSyncRecovery(status({ needsRemote: true, remoteUrl: null, remoteDisplayUrl: null }))).toBe('setup');
		expect(classifyGitSyncRecovery(status({ clean: false, files: [{ path: 'Draft.md', index: ' ', workingDir: 'M' }] }))).toBe('local-changes');
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

		const dirty = buildGitSyncUiState(status({ clean: false, files: [{ path: 'Draft.md', index: ' ', workingDir: 'M' }] }), 'https://github.com/owner/repo.git', null);
		expect(dirty).toMatchObject({
			indicator: 'warn',
			recovery: 'local-changes'
		});
	});

	test('builds setup and recovery copy with matching operator commands', () => {
		const setup = status({ needsRemote: true, remoteUrl: null, remoteDisplayUrl: null });
		expect(buildGitSyncRecoveryCopy(setup)).toMatchObject({
			kind: 'setup',
			title: 'Connect a GitHub repository',
			badge: 'Setup'
		});
		expect(buildGitSyncSetupCommands(setup, "/Users/me/My Vault", "https://github.com/owner/vault.git")).toBe(
			"cd '/Users/me/My Vault'\n" +
			"git remote add origin 'https://github.com/owner/vault.git'\n" +
			"git push -u origin 'main'"
		);

		const behind = status({ behind: 2, canPull: true, canPush: false });
		expect(buildGitSyncRecoveryCopy(behind)).toMatchObject({
			kind: 'remote-changes',
			subtitle: '2 commits must be pulled before vault writes continue.',
			badge: 'Writes paused'
		});
		expect(buildGitSyncResolutionCommands(behind, '/vault')).toBe("cd '/vault'\ngit pull --ff-only origin 'main'");

		const dirty = status({ clean: false, files: [{ path: 'Draft.md', index: ' ', workingDir: 'M' }] });
		expect(buildGitSyncRecoveryCopy(dirty)).toMatchObject({
			kind: 'local-changes',
			title: 'Local vault changes',
			badge: 'Review'
		});
		expect(buildGitSyncResolutionCommands(dirty, '/vault')).toContain("git commit -m 'sync: save local vault changes'");

		const conflicted = status({ conflicted: ['Shared.md'], clean: false });
		expect(buildGitSyncRecoveryCopy(conflicted)).toMatchObject({
			kind: 'conflicts',
			title: 'Merge conflicts',
			badge: 'Blocked'
		});
		expect(buildGitSyncResolutionCommands(conflicted, '/vault')).toContain('# resolve conflicted files');

		const diverged = status({ diverged: true, ahead: 1, behind: 1, canPull: false, canPush: false });
		expect(buildGitSyncRecoveryCopy(diverged)).toMatchObject({
			kind: 'diverged',
			title: 'Diverged history',
			subtitle: 'Manual merge required between abc1234 and def5678.',
			badge: 'Blocked'
		});
		expect(buildGitSyncResolutionCommands(diverged, '/vault')).toContain("git merge 'origin/main'");
	});
});
