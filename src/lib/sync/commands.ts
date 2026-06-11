import type { GitSyncStatus } from '$lib/types';

export function shellQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

export function buildGitSyncSetupCommands(
	status: GitSyncStatus | null,
	vaultPath: string,
	remoteHint: string
): string {
	if (!status?.needsRemote) return '';
	const cd = vaultPath ? `cd ${shellQuote(vaultPath)}` : '# cd /path/to/vault';
	const remote = remoteHint.trim() || 'https://github.com/owner/repo.git';
	const branch = status.branch ?? 'main';
	return [
		cd,
		`git remote add origin ${shellQuote(remote)}`,
		`git push -u origin ${shellQuote(branch)}`
	].join('\n');
}

export function buildGitSyncResolutionCommands(status: GitSyncStatus | null, vaultPath: string): string {
	if (!status) return '';
	const cd = vaultPath ? `cd ${shellQuote(vaultPath)}` : '# cd /path/to/vault';
	const branch = status.branch ? shellQuote(status.branch) : '<branch>';
	const remoteRef = status.branch ? shellQuote(`origin/${status.branch}`) : 'origin/<branch>';

	if (status.conflicted.length > 0) {
		return [cd, 'git status', '# resolve conflicted files', 'git add -A', 'git commit', 'git push'].join('\n');
	}
	if (status.diverged) {
		return [cd, 'git fetch origin', `git merge ${remoteRef}`, '# resolve any conflicts', 'git add -A', 'git commit', 'git push'].join('\n');
	}
	if (status.behind > 0) {
		return [cd, `git pull --ff-only origin ${branch}`].join('\n');
	}
	return '';
}
