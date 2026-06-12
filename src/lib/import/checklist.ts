import type {
	ObsidianPluginInfo,
	VaultImportAnalysis,
	VaultImportCheckItem,
	VaultImportCheckLevel
} from '$lib/types';

export interface ImportReadiness {
	level: VaultImportCheckLevel;
	label: string;
}

export function importSummary(analysis: VaultImportAnalysis): string {
	const notes = `${analysis.markdownFiles} note${analysis.markdownFiles === 1 ? '' : 's'}`;
	const assets = `${analysis.assetFiles} asset${analysis.assetFiles === 1 ? '' : 's'}`;
	const canvas = analysis.canvasFiles > 0
		? ` · ${analysis.canvasFiles} canvas`
		: '';
	return `${notes} · ${assets}${canvas}`;
}

export function importReadiness(analysis: VaultImportAnalysis): ImportReadiness {
	if (analysis.checklist.some((check) => check.level === 'warn')) {
		return { level: 'warn', label: 'Needs review' };
	}
	if (analysis.checklist.some((check) => check.level === 'info')) {
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

function obsidianPluginName(plugin: ObsidianPluginInfo): string {
	return plugin.name === plugin.id ? plugin.id : `${plugin.name} (${plugin.id})`;
}

function obsidianManifestLabel(plugin: ObsidianPluginInfo): string {
	if (plugin.manifestStatus === 'invalid') return 'invalid manifest';
	if (plugin.manifestStatus === 'missing') return 'missing manifest';
	return plugin.enabled ? 'enabled' : 'not enabled';
}

function obsidianSettingsLabel(plugin: ObsidianPluginInfo): string {
	if (plugin.settingsStatus === 'invalid') return 'invalid settings';
	if (plugin.settingsStatus === 'missing') return 'no settings';
	return 'settings';
}

export function obsidianPluginSummary(plugins: ObsidianPluginInfo[], max = 4): string {
	const visible = plugins.slice(0, max).map((plugin) => (
		`${obsidianPluginName(plugin)}: ${obsidianManifestLabel(plugin)}, ${obsidianSettingsLabel(plugin)}`
	));
	if (plugins.length > max) visible.push(`+${plugins.length - max} more`);
	return visible.join('; ');
}
