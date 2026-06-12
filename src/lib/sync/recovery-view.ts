import type { GitSyncStatus } from '$lib/types';

export interface GitSyncFileListItem {
	path: string;
	title: string;
	statusCode?: string;
}

export interface GitSyncChangeSection {
	id: 'local' | 'remote' | 'overlap';
	title: string;
	items: GitSyncFileListItem[];
	empty: string;
	tone: 'local' | 'remote' | 'overlap';
	hot: boolean;
}

export function gitFileStatusCode(file: GitSyncStatus['files'][number]): string {
	return `${file.index}${file.workingDir}`;
}

export function buildGitSyncLocalChangeItems(
	files: GitSyncStatus['files']
): GitSyncFileListItem[] {
	return files.map((file) => {
		const statusCode = gitFileStatusCode(file);
		return {
			path: file.path,
			statusCode,
			title: `${statusCode} ${file.path}`
		};
	});
}

export function buildGitSyncPathItems(files: string[]): GitSyncFileListItem[] {
	return files.map((path) => ({
		path,
		title: path
	}));
}

export function buildGitSyncDivergedSections(status: GitSyncStatus): GitSyncChangeSection[] {
	return [
		{
			id: 'local',
			title: 'Local only',
			items: buildGitSyncPathItems(status.localChanges),
			empty: 'No local file changes reported.',
			tone: 'local',
			hot: false
		},
		{
			id: 'remote',
			title: 'Remote only',
			items: buildGitSyncPathItems(status.remoteChanges),
			empty: 'No remote file changes reported.',
			tone: 'remote',
			hot: false
		},
		{
			id: 'overlap',
			title: 'Overlapping files',
			items: buildGitSyncPathItems(status.conflictCandidates),
			empty: 'No same-path overlap detected.',
			tone: 'overlap',
			hot: status.conflictCandidates.length > 0
		}
	];
}
