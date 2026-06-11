import type { VaultImportAnalysis, VaultImportCheckItem, VaultImportCheckLevel } from '$lib/types';

export interface ImportReadiness {
	level: VaultImportCheckLevel;
	label: string;
}

export function importSummary(analysis: VaultImportAnalysis): string {
	const notes = `${analysis.markdownFiles} note${analysis.markdownFiles === 1 ? '' : 's'}`;
	const assets = `${analysis.assetFiles} asset${analysis.assetFiles === 1 ? '' : 's'}`;
	return `${notes} · ${assets}`;
}

export function importReadiness(analysis: VaultImportAnalysis): ImportReadiness {
	if (analysis.checklist.some((check) => check.level === 'warn')) {
		return { level: 'warn', label: 'Needs review' };
	}
	if (analysis.obsidianConfig || analysis.likelyAttachmentFolders.length > 0) {
		return { level: 'info', label: 'Ready with notes' };
	}
	return { level: 'ok', label: 'Ready' };
}

export function checkLevelLabel(level: VaultImportCheckLevel): string {
	if (level === 'warn') return 'Warn';
	if (level === 'info') return 'Info';
	return 'OK';
}

export function checkLevelClass(check: VaultImportCheckItem): string {
	return `check ${check.level}`;
}

export function compactPathList(paths: string[], max = 4): string {
	if (paths.length <= max) return paths.join(', ');
	return `${paths.slice(0, max).join(', ')} +${paths.length - max} more`;
}
