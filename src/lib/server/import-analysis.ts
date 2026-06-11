import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { VaultImportAnalysis, VaultImportCheckItem } from '$lib/types';

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
	const obsidianPluginFolders = sorted(obsidianConfig ? listObsidianPluginFolders(root) : []);

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
				? '.obsidian was found and will be preserved but skipped from note indexing.'
				: 'No .obsidian folder was found.',
			obsidianConfig ? 'info' : 'ok'
		),
		item(
			'obsidian-plugins',
			'Obsidian plugins',
			obsidianPluginFolders.length > 0
				? `${obsidianPluginFolders.length} Obsidian plugin folder${obsidianPluginFolders.length === 1 ? '' : 's'} found; Diamond preserves settings but does not run Obsidian plugins.`
				: 'No Obsidian plugin folders were found.',
			obsidianPluginFolders.length > 0 ? 'info' : 'ok'
		),
		item(
			'canvas',
			'Canvas files',
			canvasFiles > 0
				? `${canvasFiles} Canvas file${canvasFiles === 1 ? '' : 's'} found; Diamond preserves them but does not render Canvas boards yet.`
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
		obsidianPluginFolders,
		recommendedExcludedFolders: sorted(recommendedExcludedFolders),
		ignoredFolders: sorted(ignoredFolders),
		warnings,
		checklist,
		markdownExamples,
		canvasExamples
	};
}

function listObsidianPluginFolders(root: string): string[] {
	const pluginsRoot = path.join(root, '.obsidian', 'plugins');
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(pluginsRoot, { withFileTypes: true });
	} catch {
		return [];
	}
	return entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => `.obsidian/plugins/${entry.name}`);
}
