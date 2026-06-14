import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
	ObsidianTemplatesInfo,
	ObsidianPluginInfo,
	ObsidianPluginJsonStatus,
	VaultImportAnalysis,
	VaultImportCheckItem
} from '$lib/types';
import { readObsidianAppearanceConfig } from './obsidian-appearance';
import { readObsidianAppConfig } from './obsidian-config';
import { readObsidianBookmarks } from './obsidian-bookmarks';
import { readObsidianCorePlugins, readObsidianHotkeys } from './obsidian-core';
import { readObsidianDailyNotesConfig } from './obsidian-daily';
import { readObsidianGraphConfig } from './obsidian-graph';
import { readObsidianTemplatesConfig } from './obsidian-templates';

const CONFIG_FOLDERS = new Set(['.obsidian', '.diamondmd']);
const IGNORED_FOLDERS = new Set(['.git', '.diamond-publish', 'node_modules']);
const ATTACHMENT_FOLDER_NAMES = new Set([
	'attachments',
	'attachment',
	'assets',
	'asset',
	'files',
	'images',
	'img',
	'media',
	'resources',
	'uploads'
]);
const ASSET_EXTENSIONS = new Set([
	'.avif',
	'.bmp',
	'.gif',
	'.heic',
	'.jpeg',
	'.jpg',
	'.m4a',
	'.mov',
	'.mp3',
	'.mp4',
	'.ogg',
	'.pdf',
	'.png',
	'.svg',
	'.wav',
	'.webm',
	'.webp'
]);
const MAX_EXAMPLES = 8;

function expandHome(input: string): string {
	const trimmed = input.trim();
	return path.resolve(trimmed.replace(/^~(?=$|\/)/, os.homedir()));
}

function toVaultPath(root: string, abs: string): string {
	return path.relative(root, abs).split(path.sep).join('/');
}

function sorted(values: Iterable<string>): string[] {
	return [...new Set(values)].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function item(id: string, label: string, detail: string, level: VaultImportCheckItem['level']): VaultImportCheckItem {
	return { id, label, detail, level };
}

function obsidianTemplatesDetail(config: ObsidianTemplatesInfo): string {
	if (config.status === 'present' && config.settings.length === 0) {
		return '.obsidian/templates.json found; no supported Templates settings were recognized.';
	}
	if (config.status === 'present') {
		return `${config.settings.length} Templates setting${config.settings.length === 1 ? '' : 's'} found; templates load from ${config.folderPath ?? 'Templates'}.`;
	}
	if (config.status === 'invalid') {
		return '.obsidian/templates.json is invalid; Diamond will use default template picker behavior.';
	}
	return 'No Obsidian Templates settings were found.';
}

function obsidianBookmarksDetail(config: ReturnType<typeof readObsidianBookmarks>): string {
	if (config.status === 'invalid') {
		return `${config.path ?? '.obsidian/bookmarks.json'} is invalid; Diamond will preserve it but cannot import bookmarks.`;
	}
	if (config.status === 'missing') {
		return 'No Obsidian bookmarks or legacy starred file was found.';
	}
	if (config.importableBookmarks > 0) {
		const source = config.source === 'starred' ? 'legacy starred' : 'bookmark';
		return `${config.importableBookmarks} ${source} item${config.importableBookmarks === 1 ? '' : 's'} can seed Diamond bookmarks on registration.`;
	}
	return `${config.path ?? '.obsidian/bookmarks.json'} found, but no visible Markdown note bookmarks were recognized.`;
}

function obsidianAppearanceDetail(config: ReturnType<typeof readObsidianAppearanceConfig>): string {
	if (config.status === 'invalid') {
		return '.obsidian/appearance.json is invalid; Diamond will preserve it but cannot summarize appearance settings.';
	}
	if (config.status === 'present') {
		const snippetText = config.snippetFiles.length > 0
			? ` ${config.snippetFiles.length} CSS snippet file${config.snippetFiles.length === 1 ? '' : 's'} preserved.`
			: '';
		if (config.settings.length === 0) return `.obsidian/appearance.json found; no supported Appearance settings were recognized.${snippetText}`;
		return `${config.settings.length} Appearance setting${config.settings.length === 1 ? '' : 's'} found.${snippetText}`;
	}
	if (config.snippetFiles.length > 0) {
		return `${config.snippetFiles.length} CSS snippet file${config.snippetFiles.length === 1 ? '' : 's'} preserved; no .obsidian/appearance.json file was found.`;
	}
	return 'No Obsidian Appearance settings were found.';
}

function obsidianCorePluginsDetail(config: ReturnType<typeof readObsidianCorePlugins>): string {
	if (config.status === 'invalid') {
		return '.obsidian/core-plugins.json is invalid; Diamond will preserve it but cannot summarize enabled core plugins.';
	}
	if (config.status === 'missing') return 'No Obsidian core plugin list was found.';
	if (config.enabledPlugins.length === 0) return '.obsidian/core-plugins.json found, but no enabled core plugins were recognized.';
	return `${config.enabledPlugins.length} enabled core plugin${config.enabledPlugins.length === 1 ? '' : 's'} found: ${config.supportedCount} supported, ${config.partialCount} partial, ${config.manualCount + config.unknownCount} manual review.`;
}

function obsidianHotkeysDetail(config: ReturnType<typeof readObsidianHotkeys>): string {
	if (config.status === 'invalid') {
		return '.obsidian/hotkeys.json is invalid; Diamond will preserve it but cannot summarize custom hotkeys.';
	}
	if (config.status === 'missing') return 'No Obsidian custom hotkeys file was found.';
	if (config.commandCount === 0) return '.obsidian/hotkeys.json found, but no custom hotkey bindings were recognized.';
	return `${config.bindingCount} custom hotkey binding${config.bindingCount === 1 ? '' : 's'} across ${config.commandCount} command${config.commandCount === 1 ? '' : 's'} found for manual shortcut recreation.`;
}

function obsidianGraphDetail(config: ReturnType<typeof readObsidianGraphConfig>): string {
	if (config.status === 'invalid') {
		return '.obsidian/graph.json is invalid; Diamond will preserve it but cannot summarize graph settings.';
	}
	if (config.status === 'missing') return 'No Obsidian graph settings were found.';
	if (config.settings.length === 0) return '.obsidian/graph.json found; no supported graph settings were recognized.';
	const warningCount = config.settings.filter((setting) => setting.level === 'warn').length;
	const warningText = warningCount > 0 ? ` ${warningCount} setting${warningCount === 1 ? '' : 's'} need manual review.` : '';
	return `${config.settings.length} Graph setting${config.settings.length === 1 ? '' : 's'} found.${warningText}`;
}

export function analyzeVaultImport(inputPath: string): VaultImportAnalysis {
	if (!inputPath?.trim()) throw new Error('path required');
	const root = expandHome(inputPath);
	if (!fs.existsSync(root)) throw new Error('path does not exist');
	if (!fs.statSync(root).isDirectory()) throw new Error('path is not a directory');

	let markdownFiles = 0;
	let assetFiles = 0;
	let canvasFiles = 0;
	let totalFiles = 0;
	let unreadableEntries = 0;
	let skippedSymlinks = 0;
	let hiddenMarkdownRisk = false;

	const markdownExamples: string[] = [];
	const canvasExamples: string[] = [];
	const ignoredFolders = new Set<string>();
	const recommendedExcludedFolders = new Set<string>();
	const hiddenFolders = new Set<string>();
	const namedAttachmentFolders = new Set<string>();
	const assetFolders = new Set<string>();
	const gitRepository = fs.existsSync(path.join(root, '.git'));
	let obsidianConfig = fs.existsSync(path.join(root, '.obsidian'));
	let diamondConfig = fs.existsSync(path.join(root, '.diamondmd'));
	const obsidianAppConfig = readObsidianAppConfig(root);
	const obsidianDailyNotes = readObsidianDailyNotesConfig(root);
	const obsidianTemplates = readObsidianTemplatesConfig(root);
	const obsidianAppearance = readObsidianAppearanceConfig(root);
	const obsidianCorePlugins = readObsidianCorePlugins(root);
	const obsidianHotkeys = readObsidianHotkeys(root);
	const obsidianBookmarks = readObsidianBookmarks(root);
	const obsidianGraph = readObsidianGraphConfig(root);
	const obsidianPlugins = obsidianConfig ? listObsidianPlugins(root) : [];
	const obsidianPluginFolders = obsidianPlugins.map((plugin) => plugin.folder);

	function noteMarkdown(rel: string): void {
		markdownFiles += 1;
		if (markdownExamples.length < MAX_EXAMPLES) markdownExamples.push(rel);
	}

	function noteAsset(rel: string): void {
		assetFiles += 1;
		const folder = path.dirname(rel).split(path.sep).join('/');
		if (folder && folder !== '.') assetFolders.add(folder);
	}

	function noteCanvas(rel: string): void {
		canvasFiles += 1;
		if (canvasExamples.length < MAX_EXAMPLES) canvasExamples.push(rel);
	}

	function walk(dir: string): void {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			unreadableEntries += 1;
			return;
		}

		for (const entry of entries) {
			const abs = path.join(dir, entry.name);
			const rel = toVaultPath(root, abs);
			if (entry.isSymbolicLink()) {
				skippedSymlinks += 1;
				continue;
			}

			if (entry.isDirectory()) {
				const lower = entry.name.toLowerCase();
				if (CONFIG_FOLDERS.has(entry.name)) {
					if (entry.name === '.obsidian') obsidianConfig = true;
					if (entry.name === '.diamondmd') diamondConfig = true;
					ignoredFolders.add(rel);
					recommendedExcludedFolders.add(rel);
					continue;
				}
				if (IGNORED_FOLDERS.has(entry.name)) {
					ignoredFolders.add(rel);
					if (entry.name !== '.git') recommendedExcludedFolders.add(rel);
					continue;
				}
				if (entry.name.startsWith('.')) {
					hiddenFolders.add(rel);
					ignoredFolders.add(rel);
					recommendedExcludedFolders.add(rel);
					continue;
				}
				if (ATTACHMENT_FOLDER_NAMES.has(lower)) namedAttachmentFolders.add(rel);
				walk(abs);
				continue;
			}

			if (!entry.isFile()) continue;
			totalFiles += 1;
			const ext = path.extname(entry.name).toLowerCase();
			if (ext === '.md' || ext === '.markdown') noteMarkdown(rel);
			else if (ext === '.canvas') noteCanvas(rel);
			else if (ASSET_EXTENSIONS.has(ext)) noteAsset(rel);
		}
	}

	function scanHiddenMarkdown(dir: string): void {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const abs = path.join(dir, entry.name);
			if (entry.isSymbolicLink()) continue;
			if (entry.isDirectory()) scanHiddenMarkdown(abs);
			else if (entry.isFile() && ['.md', '.markdown'].includes(path.extname(entry.name).toLowerCase())) {
				hiddenMarkdownRisk = true;
				return;
			}
		}
	}

	walk(root);
	for (const folder of hiddenFolders) scanHiddenMarkdown(path.join(root, ...folder.split('/')));

	const warnings: string[] = [];
	if (hiddenMarkdownRisk) warnings.push('Hidden folders contain markdown files; Diamond skips hidden folders by default.');
	if (unreadableEntries > 0) warnings.push(`${unreadableEntries} folder${unreadableEntries === 1 ? '' : 's'} could not be read.`);
	if (skippedSymlinks > 0) warnings.push(`${skippedSymlinks} symlink${skippedSymlinks === 1 ? '' : 's'} skipped during inspection.`);
	warnings.push(...obsidianAppConfig.warnings);
	warnings.push(...obsidianDailyNotes.warnings);
	warnings.push(...obsidianTemplates.warnings);
	warnings.push(...obsidianAppearance.warnings);
	warnings.push(...obsidianCorePlugins.warnings);
	warnings.push(...obsidianHotkeys.warnings);
	warnings.push(...obsidianBookmarks.warnings);
	warnings.push(...obsidianGraph.warnings);

	const likelyAttachmentFolders = sorted([...namedAttachmentFolders, ...assetFolders]);
	const attachmentDetail = likelyAttachmentFolders.length > 0
		? `Likely attachment folders: ${likelyAttachmentFolders.slice(0, 5).join(', ')}.`
		: assetFiles > 0
			? `${assetFiles} asset file${assetFiles === 1 ? '' : 's'} found outside named attachment folders; verify embed paths after import.`
			: 'No likely attachment folder was detected.';
	const checklist: VaultImportCheckItem[] = [
		item(
			'markdown',
			'Markdown notes',
			markdownFiles > 0
				? `${markdownFiles} markdown file${markdownFiles === 1 ? '' : 's'} found.`
				: 'No markdown files were found in visible vault folders.',
			markdownFiles > 0 ? 'ok' : 'warn'
		),
		item(
			'obsidian-config',
			'Obsidian config',
			obsidianConfig
				? obsidianAppConfig.status === 'present'
					? `.obsidian was found; ${obsidianAppConfig.settings.length} app setting${obsidianAppConfig.settings.length === 1 ? '' : 's'} surfaced read-only for migration.`
					: obsidianAppConfig.status === 'invalid'
						? '.obsidian/app.json is invalid; .obsidian will still be preserved and skipped from note indexing.'
						: '.obsidian was found and will be preserved but skipped from note indexing.'
				: 'No .obsidian folder was found.',
			obsidianAppConfig.status === 'invalid' || obsidianAppConfig.settings.some((setting) => setting.level === 'warn')
				? 'warn'
				: obsidianConfig ? 'info' : 'ok'
		),
		item(
			'obsidian-plugins',
			'Obsidian plugins',
			obsidianPluginFolders.length > 0
				? `${obsidianPluginFolders.length} Obsidian plugin folder${obsidianPluginFolders.length === 1 ? '' : 's'} found; Diamond surfaces manifests/settings read-only but does not run Obsidian plugins.`
				: 'No Obsidian plugin folders were found.',
			obsidianPluginFolders.length > 0 ? 'info' : 'ok'
		),
		item(
			'obsidian-daily-notes',
			'Daily Notes settings',
			obsidianDailyNotes.status === 'present'
				? `${obsidianDailyNotes.settings.length} Daily Notes setting${obsidianDailyNotes.settings.length === 1 ? '' : 's'} found; today's note resolves to ${obsidianDailyNotes.plannedPath}.`
				: obsidianDailyNotes.status === 'invalid'
					? '.obsidian/daily-notes.json is invalid; Diamond will use default Daily Notes behavior.'
					: 'No Obsidian Daily Notes settings were found.',
			obsidianDailyNotes.status === 'invalid' || obsidianDailyNotes.settings.some((setting) => setting.level === 'warn')
				? 'warn'
				: obsidianDailyNotes.status === 'present' ? 'info' : 'ok'
		),
		item(
			'obsidian-templates',
			'Templates settings',
			obsidianTemplatesDetail(obsidianTemplates),
			obsidianTemplates.status === 'invalid' || obsidianTemplates.settings.some((setting) => setting.level === 'warn')
				? 'warn'
				: obsidianTemplates.status === 'present' ? 'info' : 'ok'
		),
		item(
			'obsidian-appearance',
			'Appearance settings',
			obsidianAppearanceDetail(obsidianAppearance),
			obsidianAppearance.status === 'invalid'
				|| obsidianAppearance.settings.some((setting) => setting.level === 'warn')
				? 'warn'
				: obsidianAppearance.status === 'present' || obsidianAppearance.snippetFiles.length > 0 ? 'info' : 'ok'
		),
		item(
			'obsidian-core-plugins',
			'Core plugins',
			obsidianCorePluginsDetail(obsidianCorePlugins),
			obsidianCorePlugins.status === 'invalid'
				? 'warn'
				: obsidianCorePlugins.status === 'present' && obsidianCorePlugins.enabledPlugins.length > 0 ? 'info' : 'ok'
		),
		item(
			'obsidian-hotkeys',
			'Custom hotkeys',
			obsidianHotkeysDetail(obsidianHotkeys),
			obsidianHotkeys.status === 'invalid'
				? 'warn'
				: obsidianHotkeys.status === 'present' && obsidianHotkeys.commandCount > 0 ? 'info' : 'ok'
		),
		item(
			'obsidian-bookmarks',
			'Obsidian bookmarks',
			obsidianBookmarksDetail(obsidianBookmarks),
			obsidianBookmarks.status === 'invalid'
				? 'warn'
				: obsidianBookmarks.importableBookmarks > 0 ? 'info' : 'ok'
		),
		item(
			'obsidian-graph',
			'Graph settings',
			obsidianGraphDetail(obsidianGraph),
			obsidianGraph.status === 'invalid'
				|| obsidianGraph.settings.some((setting) => setting.level === 'warn')
				? 'warn'
				: obsidianGraph.status === 'present' ? 'info' : 'ok'
		),
		item(
			'canvas',
			'Canvas files',
			canvasFiles > 0
				? `${canvasFiles} Canvas file${canvasFiles === 1 ? '' : 's'} found; Diamond preserves them and opens visual boards with git-backed node and edge editing.`
				: 'No Obsidian Canvas files were found.',
			canvasFiles > 0 ? 'info' : 'ok'
		),
		item(
			'attachments',
			'Attachments',
			attachmentDetail,
			likelyAttachmentFolders.length > 0 || assetFiles > 0 ? 'info' : 'ok'
		),
		item(
			'git',
			'Git sync readiness',
			gitRepository
				? 'Existing Git repository found.'
				: 'No .git folder found; initialize Git before first GitHub sync.',
			gitRepository ? 'ok' : 'warn'
		),
		item(
			'preserve',
			'Preserve files',
			'Import inspection and vault registration do not rewrite markdown content.',
			'ok'
		)
	];

	return {
		path: root,
		markdownFiles,
		assetFiles,
		canvasFiles,
		totalFiles,
		obsidianConfig,
		diamondConfig,
		gitRepository,
		likelyAttachmentFolders,
		obsidianAppConfig,
		obsidianDailyNotes,
		obsidianTemplates,
		obsidianAppearance,
		obsidianCorePlugins,
		obsidianHotkeys,
		obsidianBookmarks,
		obsidianGraph,
		obsidianPluginFolders,
		obsidianPlugins,
		recommendedExcludedFolders: sorted(recommendedExcludedFolders),
		ignoredFolders: sorted(ignoredFolders),
		warnings,
		checklist,
		markdownExamples,
		canvasExamples
	};
}

function readJsonFile(abs: string): { status: ObsidianPluginJsonStatus; value?: unknown; bytes?: number } {
	if (!fs.existsSync(abs)) return { status: 'missing' };
	let content = '';
	try {
		content = fs.readFileSync(abs, 'utf-8');
		return { status: 'present', value: JSON.parse(content) as unknown, bytes: Buffer.byteLength(content, 'utf-8') };
	} catch {
		return { status: 'invalid', bytes: content ? Buffer.byteLength(content, 'utf-8') : undefined };
	}
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? value as Record<string, unknown>
		: null;
}

function jsonString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value : undefined;
}

function jsonSettingKeys(value: unknown): string[] {
	const body = jsonRecord(value);
	if (!body) return [];
	return Object.keys(body)
		.filter((key) => key.trim().length > 0)
		.sort((a, b) => a.localeCompare(b));
}

function readEnabledObsidianPluginIds(root: string): Set<string> {
	const plugins = readJsonFile(path.join(root, '.obsidian', 'community-plugins.json'));
	if (plugins.status !== 'present' || !Array.isArray(plugins.value)) return new Set();
	return new Set(plugins.value.filter((value): value is string => typeof value === 'string'));
}

function listObsidianPlugins(root: string): ObsidianPluginInfo[] {
	const pluginsRoot = path.join(root, '.obsidian', 'plugins');
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(pluginsRoot, { withFileTypes: true });
	} catch {
		return [];
	}
	const enabledIds = readEnabledObsidianPluginIds(root);
	return entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => {
			const folder = `.obsidian/plugins/${entry.name}`;
			const manifestPath = `${folder}/manifest.json`;
			const settingsPath = `${folder}/data.json`;
			const manifest = readJsonFile(path.join(pluginsRoot, entry.name, 'manifest.json'));
			const settings = readJsonFile(path.join(pluginsRoot, entry.name, 'data.json'));
			const manifestBody = manifest.status === 'present' ? jsonRecord(manifest.value) : null;
			const id = jsonString(manifestBody?.id) ?? entry.name;
			const plugin: ObsidianPluginInfo = {
				folder,
				id,
				name: jsonString(manifestBody?.name) ?? id,
				enabled: enabledIds.has(entry.name) || enabledIds.has(id),
				manifestStatus: manifest.status,
				settingsStatus: settings.status
			};
			if (manifest.status !== 'missing') plugin.manifestPath = manifestPath;
			const version = jsonString(manifestBody?.version);
			if (version) plugin.version = version;
			const author = jsonString(manifestBody?.author);
			if (author) plugin.author = author;
			if (settings.status !== 'missing') plugin.settingsPath = settingsPath;
			if (settings.bytes !== undefined) plugin.settingsBytes = settings.bytes;
			const settingsKeys = settings.status === 'present' ? jsonSettingKeys(settings.value) : [];
			if (settingsKeys.length > 0) plugin.settingsKeys = settingsKeys;
			return plugin;
		})
		.sort((a, b) => a.folder.localeCompare(b.folder));
}
