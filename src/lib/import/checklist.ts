import type {
	ObsidianAppConfigInfo,
	ObsidianPluginInfo,
	ObsidianPluginJsonStatus,
	VaultImportAnalysis,
	VaultImportCheckItem,
	VaultImportCheckLevel
} from '$lib/types';

export interface ImportReadiness {
	level: VaultImportCheckLevel;
	label: string;
}

export interface ObsidianPluginMigrationNote {
	id: string;
	name: string;
	folder: string;
	level: VaultImportCheckLevel;
	enabledLabel: string;
	manifestLabel: string;
	settingsLabel: string;
	detail: string;
	action: string;
	keySummary?: string;
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
	if (!plugin.settingsKeys?.length) return 'settings';
	const visible = plugin.settingsKeys.slice(0, 3).join(', ');
	const overflow = plugin.settingsKeys.length > 3 ? ` +${plugin.settingsKeys.length - 3}` : '';
	return `settings: ${visible}${overflow}`;
}

export function obsidianPluginSummary(plugins: ObsidianPluginInfo[], max = 4): string {
	const visible = plugins.slice(0, max).map((plugin) => (
		`${obsidianPluginName(plugin)}: ${obsidianManifestLabel(plugin)}, ${obsidianSettingsLabel(plugin)}`
	));
	if (plugins.length > max) visible.push(`+${plugins.length - max} more`);
	return visible.join('; ');
}

export function obsidianAppConfigSummary(config: ObsidianAppConfigInfo): string {
	if (config.status === 'missing') return 'No .obsidian/app.json file was found.';
	if (config.status === 'invalid') return '.obsidian/app.json is present but invalid.';
	if (config.settings.length === 0) return '.obsidian/app.json found; no supported app settings were recognized.';
	return `${config.settings.length} supported app setting${config.settings.length === 1 ? '' : 's'} found.`;
}

function formatBytes(bytes: number | undefined): string {
	if (bytes === undefined) return '';
	if (bytes < 1024) return `${bytes} B`;
	return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
}

function titleStatus(status: ObsidianPluginJsonStatus, noun: string): string {
	if (status === 'present') return `${noun} present`;
	if (status === 'invalid') return `Invalid ${noun.toLowerCase()}`;
	return `Missing ${noun.toLowerCase()}`;
}

function settingsLabel(plugin: ObsidianPluginInfo): string {
	if (plugin.settingsStatus === 'invalid') return 'Invalid settings JSON';
	if (plugin.settingsStatus === 'missing') return 'No settings file';
	if (!plugin.settingsKeys?.length) return 'Settings file present';
	return `${plugin.settingsKeys.length} setting key${plugin.settingsKeys.length === 1 ? '' : 's'}`;
}

function settingsKeySummary(plugin: ObsidianPluginInfo, maxKeys: number): string | undefined {
	if (plugin.settingsStatus !== 'present' || !plugin.settingsKeys?.length) return undefined;
	const visible = plugin.settingsKeys.slice(0, maxKeys).join(', ');
	const overflow = plugin.settingsKeys.length > maxKeys ? ` +${plugin.settingsKeys.length - maxKeys} more` : '';
	return `Top-level keys: ${visible}${overflow}`;
}

function migrationLevel(plugin: ObsidianPluginInfo): VaultImportCheckLevel {
	if (plugin.manifestStatus === 'invalid' || plugin.manifestStatus === 'missing') return 'warn';
	if (plugin.settingsStatus === 'invalid') return 'warn';
	return 'info';
}

function migrationAction(plugin: ObsidianPluginInfo): string {
	if (plugin.manifestStatus !== 'present') {
		return 'Review the preserved plugin folder before recreating this workflow in Diamond.';
	}
	if (plugin.settingsStatus === 'invalid') {
		return 'Settings were preserved but not parsed; inspect data.json manually before migrating.';
	}
	if (plugin.enabled) {
		return 'Preserved for manual migration; Diamond will not execute this Obsidian plugin.';
	}
	return 'Preserved but inactive in Obsidian; keep it only if you need its settings history.';
}

function migrationDetail(plugin: ObsidianPluginInfo): string {
	const parts = [plugin.folder];
	if (plugin.version) parts.push(`v${plugin.version}`);
	if (plugin.author) parts.push(`by ${plugin.author}`);
	if (plugin.settingsStatus === 'present') {
		const size = formatBytes(plugin.settingsBytes);
		parts.push(size ? `${plugin.settingsPath ?? 'data.json'} preserved (${size})` : `${plugin.settingsPath ?? 'data.json'} preserved`);
	} else if (plugin.settingsStatus === 'invalid') {
		parts.push(`${plugin.settingsPath ?? 'data.json'} preserved but invalid`);
	}
	return parts.join(' · ');
}

export function obsidianPluginMigrationNotes(
	plugins: ObsidianPluginInfo[],
	maxKeys = 5
): ObsidianPluginMigrationNote[] {
	return plugins.map((plugin) => ({
		id: plugin.id,
		name: obsidianPluginName(plugin),
		folder: plugin.folder,
		level: migrationLevel(plugin),
		enabledLabel: plugin.enabled ? 'Enabled in Obsidian' : 'Disabled in Obsidian',
		manifestLabel: titleStatus(plugin.manifestStatus, 'Manifest'),
		settingsLabel: settingsLabel(plugin),
		detail: migrationDetail(plugin),
		action: migrationAction(plugin),
		keySummary: settingsKeySummary(plugin, maxKeys)
	}));
}
