export type GitSyncCommandCopyState = 'idle' | 'copied' | 'failed';

export function gitSyncCommandCopyLabel(state: GitSyncCommandCopyState): string {
	if (state === 'copied') return 'Copied';
	if (state === 'failed') return 'Copy failed';
	return 'Copy commands';
}

export function gitSyncCommandCopyTone(state: GitSyncCommandCopyState): 'default' | 'success' | 'danger' {
	if (state === 'copied') return 'success';
	if (state === 'failed') return 'danger';
	return 'default';
}
