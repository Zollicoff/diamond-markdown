/**
 * Vault GitHub sync operations.
 *
 * This layer deliberately stays conservative: status is explicit, pulls are
 * fast-forward only, pushes require a clean worktree, and diverged histories
 * are surfaced instead of merged behind the user's back.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';
import type { SimpleGit } from 'simple-git';
import type { GitSyncResult, GitSyncStatus } from '$lib/types';
import type { Vault } from './vault';
import { getVaultGit, hasRef, parseAheadBehind, rawOrNull } from './git';

const GITHUB_HTTPS_REMOTE = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/;
const GITHUB_SSH_REMOTE = /^git@github\.com:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/;
const GITHUB_SSH_URL_REMOTE = /^ssh:\/\/git@github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/;
const REMOTE_HEALTH_TIMEOUT_MS = 15_000;
const execFileAsync = promisify(execFile);

function parsePathList(raw: string | null): string[] {
	if (!raw) return [];
	return raw.split('\n').map((line) => line.trim()).filter(Boolean).sort();
}

async function changedSince(g: SimpleGit, from: string | null, to: string): Promise<string[]> {
	if (!from) return [];
	return parsePathList(await rawOrNull(g, ['diff', '--name-only', `${from}..${to}`]));
}

function intersection(a: string[], b: string[]): string[] {
	const set = new Set(a);
	return b.filter((item) => set.has(item)).sort();
}

function difference(a: string[], b: string[]): string[] {
	const set = new Set(b);
	return a.filter((item) => !set.has(item)).sort();
}

export function validateGitHubRemoteUrl(remoteUrl: string): string {
	const cleaned = remoteUrl.trim();
	if (!cleaned) throw new Error('remote URL required');
	if (
		!GITHUB_HTTPS_REMOTE.test(cleaned) &&
		!GITHUB_SSH_REMOTE.test(cleaned) &&
		!GITHUB_SSH_URL_REMOTE.test(cleaned)
	) {
		throw new Error('only GitHub HTTPS or SSH remotes are supported');
	}
	return cleaned;
}

export function redactRemoteUrl(remoteUrl: string | null): string | null {
	if (!remoteUrl) return null;
	try {
		const url = new URL(remoteUrl);
		if (url.username || url.password) {
			url.username = url.username ? '***' : '';
			url.password = url.password ? '***' : '';
			return url.toString();
		}
	} catch {
		// SSH scp-style remotes are not URL-parsable and do not contain a
		// password component in the supported GitHub form.
	}
	return remoteUrl;
}

async function originRemote(g: SimpleGit): Promise<string | null> {
	return rawOrNull(g, ['remote', 'get-url', 'origin']);
}

async function currentBranch(g: SimpleGit): Promise<string | null> {
	const branch = await rawOrNull(g, ['rev-parse', '--abbrev-ref', 'HEAD']);
	if (!branch || branch === 'HEAD') return null;
	return branch;
}

async function shortSha(g: SimpleGit): Promise<string | null> {
	return rawOrNull(g, ['rev-parse', '--short', 'HEAD']);
}

function statusMessage(status: GitSyncStatus): string {
	if (status.needsRemote) return 'Add a GitHub remote to enable sync.';
	if (status.conflicted.length > 0) return 'Resolve merge conflicts before syncing.';
	if (!status.clean) return 'Commit or discard local vault changes before syncing.';
	if (status.diverged && status.conflictCandidates.length > 0) {
		return `Local and remote histories diverged; ${status.conflictCandidates.length} overlapping file${status.conflictCandidates.length === 1 ? '' : 's'} need manual resolution.`;
	}
	if (status.diverged) return 'Local and remote histories diverged; manual merge required.';
	if (status.behind > 0) return `${status.behind} remote commit${status.behind === 1 ? '' : 's'} ready to pull.`;
	if (status.ahead > 0) return `${status.ahead} local commit${status.ahead === 1 ? '' : 's'} ready to push.`;
	return 'Vault is clean and up to date with the last fetched remote state.';
}

function refsFromLsRemote(raw: string | Buffer): string[] {
	return raw.toString().split('\n')
		.map((line) => line.trim().split(/\s+/)[1])
		.filter((ref): ref is string => !!ref)
		.sort();
}

function unavailableGitSyncStatus(message: string): GitSyncStatus {
	return {
		initialized: false,
		branch: null,
		sha: null,
		remoteUrl: null,
		remoteDisplayUrl: null,
		upstream: null,
		remoteBranch: null,
		remoteSha: null,
		clean: false,
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
		canPush: false,
		needsRemote: false,
		message
	};
}

function isVaultDirectory(vaultPath: string): boolean {
	try {
		return fs.statSync(vaultPath).isDirectory();
	} catch {
		return false;
	}
}

function cleanGitFailure(e: unknown, remoteUrl: string): string {
	const err = e as { killed?: boolean; signal?: string; stderr?: string | Buffer; stdout?: string | Buffer; message?: string };
	if (err.killed || err.signal === 'SIGTERM') return `git timed out after ${REMOTE_HEALTH_TIMEOUT_MS / 1000}s`;
	const raw = (err.stderr ?? err.stdout ?? err.message ?? '').toString();
	const redacted = redactRemoteUrl(remoteUrl) ?? 'origin';
	const firstLine = raw
		.replaceAll(remoteUrl, redacted)
		.split('\n')
		.map((line) => line.trim())
		.find(Boolean);
	return firstLine ? firstLine.slice(0, 240) : 'git ls-remote failed';
}

export async function getGitSyncStatus(vault: Vault): Promise<GitSyncStatus> {
	if (!isVaultDirectory(vault.path)) {
		return unavailableGitSyncStatus('Vault directory is unavailable. Reconnect or remove this vault.');
	}
	const g = await getVaultGit(vault);
	const status = await g.status();
	const branch = status.current ?? await currentBranch(g);
	const sha = await shortSha(g);
	const remoteUrl = await originRemote(g);
	const upstream = await rawOrNull(g, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
	let remoteBranch: string | null = null;
	let remoteSha: string | null = null;
	let ahead = status.ahead ?? 0;
	let behind = status.behind ?? 0;
	let mergeBase: string | null = null;
	let localChangedPaths: string[] = [];
	let remoteChangedPaths: string[] = [];

	if (remoteUrl && branch) {
		const candidate = `origin/${branch}`;
		if (await hasRef(g, `refs/remotes/${candidate}`)) {
			remoteBranch = candidate;
			remoteSha = await rawOrNull(g, ['rev-parse', '--short', candidate]);
			({ ahead, behind } = parseAheadBehind(await rawOrNull(g, ['rev-list', '--left-right', '--count', `HEAD...${candidate}`])));
			if (ahead > 0 || behind > 0) {
				mergeBase = await rawOrNull(g, ['merge-base', 'HEAD', candidate]);
				if (ahead > 0) localChangedPaths = await changedSince(g, mergeBase, 'HEAD');
				if (behind > 0) remoteChangedPaths = await changedSince(g, mergeBase, candidate);
			}
		}
	}

	const clean = status.isClean();
	const conflicted = status.conflicted ?? [];
	const needsRemote = !remoteUrl;
	const diverged = ahead > 0 && behind > 0;
	const conflictCandidates = intersection(localChangedPaths, remoteChangedPaths);
	const localChanges = difference(localChangedPaths, conflictCandidates);
	const remoteChanges = difference(remoteChangedPaths, conflictCandidates);
	const blocked = conflicted.length > 0 || !clean || diverged;
	const syncStatus: GitSyncStatus = {
		initialized: true,
		branch,
		sha,
		remoteUrl,
		remoteDisplayUrl: redactRemoteUrl(remoteUrl),
		upstream,
		remoteBranch,
		remoteSha,
		clean,
		conflicted,
		files: status.files.map((file) => ({
			path: file.path,
			index: file.index,
			workingDir: file.working_dir
		})),
		ahead,
		behind,
		diverged,
		mergeBase,
		localChanges,
		remoteChanges,
		conflictCandidates,
		canPull: !!remoteUrl && !!branch && !blocked && behind > 0,
		canPush: !!remoteUrl && !!branch && !blocked && behind === 0,
		needsRemote
	};
	syncStatus.message = statusMessage(syncStatus);
	return syncStatus;
}

export async function setGitHubRemote(vault: Vault, remoteUrl: string): Promise<GitSyncResult> {
	const cleaned = validateGitHubRemoteUrl(remoteUrl);
	const g = await getVaultGit(vault);
	const remotes = await g.getRemotes(true);
	if (remotes.some((r) => r.name === 'origin')) {
		await g.raw(['remote', 'set-url', 'origin', cleaned]);
	} else {
		await g.raw(['remote', 'add', 'origin', cleaned]);
	}
	return {
		ok: true,
		status: await getGitSyncStatus(vault),
		message: 'GitHub remote saved.'
	};
}

export async function checkGitHubRemote(vault: Vault): Promise<GitSyncResult> {
	const g = await getVaultGit(vault);
	const remoteUrl = await originRemote(g);
	if (!remoteUrl) throw new Error('GitHub remote is not configured');
	const branch = await currentBranch(g);
	try {
		const { stdout } = await execFileAsync('git', ['-C', vault.path, 'ls-remote', '--heads', 'origin'], {
			encoding: 'utf8',
			env: {
				...process.env,
				GIT_TERMINAL_PROMPT: '0',
				GCM_INTERACTIVE: 'never'
			},
			timeout: REMOTE_HEALTH_TIMEOUT_MS,
			maxBuffer: 1024 * 1024
		});
		const refs = refsFromLsRemote(stdout);
		const branchRef = branch ? `refs/heads/${branch}` : null;
		let detail = 'remote heads are visible.';
		if (branchRef && refs.includes(branchRef)) {
			detail = `branch ${branch} is available.`;
		} else if (branch && refs.length === 0) {
			detail = `no remote branches found yet; first push will create ${branch}.`;
		} else if (branch) {
			detail = `current branch ${branch} is not on the remote yet.`;
		}
		return {
			ok: true,
			status: await getGitSyncStatus(vault),
			message: `GitHub remote is reachable; ${detail}`
		};
	} catch (e) {
		throw new Error(`GitHub remote check failed: ${cleanGitFailure(e, remoteUrl)}`);
	}
}

export async function fetchGitHubRemote(vault: Vault): Promise<GitSyncResult> {
	const g = await getVaultGit(vault);
	const remoteUrl = await originRemote(g);
	if (!remoteUrl) throw new Error('GitHub remote is not configured');
	await g.fetch('origin');
	return {
		ok: true,
		status: await getGitSyncStatus(vault),
		message: 'Fetched origin.'
	};
}

export async function pullGitHubRemote(vault: Vault): Promise<GitSyncResult> {
	const g = await getVaultGit(vault);
	await fetchGitHubRemote(vault);
	const status = await getGitSyncStatus(vault);
	if (!status.branch) throw new Error('cannot pull while HEAD is detached');
	if (!status.clean) throw new Error('commit or discard local vault changes before pulling');
	if (status.conflicted.length > 0) throw new Error('resolve merge conflicts before pulling');
	if (status.ahead > 0 && status.behind > 0) throw new Error('local and remote histories diverged; manual merge required');
	if (status.behind === 0) {
		return { ok: true, status, message: 'Already up to date.' };
	}
	await g.pull('origin', status.branch, ['--ff-only']);
	return {
		ok: true,
		status: await getGitSyncStatus(vault),
		message: `Pulled ${status.behind} commit${status.behind === 1 ? '' : 's'}.`
	};
}

export async function pushGitHubRemote(vault: Vault): Promise<GitSyncResult> {
	const g = await getVaultGit(vault);
	await fetchGitHubRemote(vault);
	const status = await getGitSyncStatus(vault);
	if (!status.remoteUrl) throw new Error('GitHub remote is not configured');
	if (!status.branch) throw new Error('cannot push while HEAD is detached');
	if (!status.clean) throw new Error('commit or discard local vault changes before pushing');
	if (status.conflicted.length > 0) throw new Error('resolve merge conflicts before pushing');
	if (status.ahead > 0 && status.behind > 0) throw new Error('local and remote histories diverged; manual merge required');
	if (status.behind > 0) throw new Error('pull remote changes before pushing');
	await g.raw(['push', '-u', 'origin', status.branch]);
	return {
		ok: true,
		status: await getGitSyncStatus(vault),
		message: 'Pushed vault to GitHub.'
	};
}

export async function syncGitHubRemote(vault: Vault): Promise<GitSyncResult> {
	await fetchGitHubRemote(vault);
	let status = await getGitSyncStatus(vault);
	if (!status.remoteUrl) throw new Error('GitHub remote is not configured');
	if (!status.branch) throw new Error('cannot sync while HEAD is detached');
	if (!status.clean) throw new Error('commit or discard local vault changes before syncing');
	if (status.conflicted.length > 0) throw new Error('resolve merge conflicts before syncing');
	if (status.ahead > 0 && status.behind > 0) throw new Error('local and remote histories diverged; manual merge required');

	const steps: string[] = ['Fetched origin'];
	if (status.behind > 0) {
		const pulled = await pullGitHubRemote(vault);
		steps.push(pulled.message);
		status = pulled.status;
		if (!status.clean) throw new Error('commit or discard local vault changes before syncing');
		if (status.conflicted.length > 0) throw new Error('resolve merge conflicts before syncing');
		if (status.ahead > 0 && status.behind > 0) throw new Error('local and remote histories diverged; manual merge required');
	}

	if (status.ahead > 0 || !status.remoteBranch || !status.upstream) {
		const pushed = await pushGitHubRemote(vault);
		steps.push(pushed.message);
		status = pushed.status;
	}

	if (steps.length === 1) steps.push('Vault is already up to date.');
	return {
		ok: true,
		status,
		message: steps.join(' ')
	};
}
