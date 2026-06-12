import fs from 'node:fs';
import path from 'node:path';
import { normalizeVaultPath } from './paths';
import type {
	EditorLinkPreference,
	JsonFileStatus,
	ObsidianAppConfigInfo,
	ObsidianAppConfigSetting,
	VaultImportCheckLevel
} from '$lib/types';

const EXCLUDED_DIRS = new Set(['.git', '.diamondmd', '.obsidian', '.diamond-publish', 'node_modules']);

function record(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? value as Record<string, unknown>
		: null;
}

function stringValue(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function booleanValue(value: unknown): boolean | null {
	return typeof value === 'boolean' ? value : null;
}

function readJsonFile(abs: string): { status: JsonFileStatus; value?: unknown; bytes?: number } {
	if (!fs.existsSync(abs)) return { status: 'missing' };
	let content = '';
	try {
		content = fs.readFileSync(abs, 'utf-8');
		return { status: 'present', value: JSON.parse(content) as unknown, bytes: Buffer.byteLength(content, 'utf-8') };
	} catch {
		return { status: 'invalid', bytes: content ? Buffer.byteLength(content, 'utf-8') : undefined };
	}
}

export function safeVaultFolder(input: unknown): string | null {
	const raw = stringValue(input);
	if (!raw) return null;
	const trimmed = raw.replace(/^\.\/+/, '');
	if (!trimmed || trimmed === '.' || trimmed === '/') return null;

	let rel: string;
	try {
		rel = normalizeVaultPath(trimmed);
	} catch {
		return null;
	}
	rel = rel.replace(/\/+$/g, '');
	if (!rel || rel === '.') return null;

	const segments = rel.split('/');
	if (segments.some((segment) => segment.startsWith('.') || EXCLUDED_DIRS.has(segment))) return null;
	return rel;
}

function setting(
	id: string,
	label: string,
	value: string,
	detail: string,
	level: VaultImportCheckLevel = 'info'
): ObsidianAppConfigSetting {
	return { id, label, value, detail, level };
}

function linkFormatDetail(value: string): string {
	if (value === 'relative') return 'Obsidian prefers relative links. Diamond preserves existing Markdown links and wikilinks.';
	if (value === 'absolute') return 'Obsidian prefers vault-absolute links. Diamond preserves existing Markdown links and wikilinks.';
	if (value === 'shortest') return 'Obsidian prefers the shortest valid link. Diamond resolves imported wikilinks without rewriting them.';
	return 'Diamond preserves imported links and does not rewrite link format during import.';
}

function newFileLocationLabel(value: string): string {
	if (value === 'current') return 'Same folder as active file';
	if (value === 'folder') return 'Configured folder';
	if (value === 'root') return 'Vault root';
	return value;
}

export function readObsidianAppConfig(root: string): ObsidianAppConfigInfo {
	const relPath = '.obsidian/app.json';
	const appConfig = path.join(root, relPath);
	const appJson = readJsonFile(appConfig);
	const base: ObsidianAppConfigInfo = {
		path: appJson.status === 'missing' ? undefined : relPath,
		status: appJson.status,
		bytes: appJson.bytes,
		attachmentFolderStatus: 'missing',
		newFileFolderStatus: 'not-configured',
		settings: [],
		warnings: []
	};

	if (appJson.status === 'missing') return base;
	if (appJson.status === 'invalid') {
		base.warnings.push('.obsidian/app.json is present but is not valid JSON.');
		return base;
	}

	const body = record(appJson.value);
	if (!body) {
		base.warnings.push('.obsidian/app.json is present but does not contain a JSON object.');
		return base;
	}

	if ('attachmentFolderPath' in body) {
		const safe = safeVaultFolder(body.attachmentFolderPath);
		if (safe) {
			base.attachmentFolderPath = safe;
			base.attachmentFolderStatus = 'safe';
			base.settings.push(setting(
				'attachmentFolderPath',
				'Attachment folder',
				safe,
				'Diamond uses this safe Obsidian folder for dropped, pasted, and uploaded attachments.'
			));
		} else {
			base.attachmentFolderStatus = 'unsafe';
			base.settings.push(setting(
				'attachmentFolderPath',
				'Attachment folder',
				String(body.attachmentFolderPath ?? ''),
				'Ignored because it is empty, absolute, hidden, or escapes the vault.',
				'warn'
			));
			base.warnings.push('Obsidian attachmentFolderPath is unsafe and will be ignored.');
		}
	}

	const newFileLocation = stringValue(body.newFileLocation);
	if (newFileLocation) {
		base.newFileLocation = newFileLocation;
		base.settings.push(setting(
			'newFileLocation',
			'New note location',
			newFileLocationLabel(newFileLocation),
			newFileLocation === 'folder'
				? 'Diamond uses the configured safe folder for generic new-note commands; New note here still uses the selected folder.'
				: 'Diamond reports this setting during import; new-note commands still use the current command context.'
		));
	}

	if (newFileLocation === 'folder' || 'newFileFolderPath' in body) {
		const safe = safeVaultFolder(body.newFileFolderPath);
		if (safe) {
			base.newFileFolderPath = safe;
			base.newFileFolderStatus = 'safe';
			base.settings.push(setting(
				'newFileFolderPath',
				'Configured new-note folder',
				safe,
				'Used for generic new-note commands when Obsidian is configured to create notes in a folder; import never moves existing notes.'
			));
		} else {
			base.newFileFolderStatus = 'unsafe';
			base.settings.push(setting(
				'newFileFolderPath',
				'Configured new-note folder',
				String(body.newFileFolderPath ?? ''),
				'Reported as unsafe because it is empty, absolute, hidden, or escapes the vault.',
				'warn'
			));
			base.warnings.push('Obsidian newFileFolderPath is unsafe and will not be used.');
		}
	}

	const useMarkdownLinks = booleanValue(body.useMarkdownLinks);
	if (useMarkdownLinks !== null) {
		base.useMarkdownLinks = useMarkdownLinks;
		base.settings.push(setting(
			'useMarkdownLinks',
			'Link style',
			useMarkdownLinks ? 'Markdown links' : 'Wikilinks',
			useMarkdownLinks
				? 'Diamond renders imported Markdown links and wikilinks; the editor link button inserts Markdown link syntax.'
				: 'Diamond preserves and creates Obsidian-style wikilinks.'
		));
	}

	const alwaysUpdateLinks = booleanValue(body.alwaysUpdateLinks);
	if (alwaysUpdateLinks !== null) {
		base.alwaysUpdateLinks = alwaysUpdateLinks;
		base.settings.push(setting(
			'alwaysUpdateLinks',
			'Update links on rename',
			alwaysUpdateLinks ? 'Enabled' : 'Disabled in Obsidian',
			alwaysUpdateLinks
				? 'Diamond also rewrites known references during explicit rename and move operations.'
				: 'Diamond honors this setting and leaves existing note/folder references unchanged during explicit rename and move operations.',
			alwaysUpdateLinks ? 'info' : 'warn'
		));
		if (!alwaysUpdateLinks) {
			base.warnings.push('Obsidian disables automatic link updates, so note/folder rename and move operations will leave existing references unchanged.');
		}
	}

	const newLinkFormat = stringValue(body.newLinkFormat);
	if (newLinkFormat) {
		base.newLinkFormat = newLinkFormat;
		base.settings.push(setting(
			'newLinkFormat',
			'New link format',
			newLinkFormat,
			linkFormatDetail(newLinkFormat)
		));
	}

	const trashOption = stringValue(body.trashOption);
	if (trashOption) {
		base.settings.push(setting(
			'trashOption',
			'Delete behavior',
			trashOption,
			'Diamond delete actions are recoverable through git history rather than Obsidian trash settings.'
		));
	}

	return base;
}

export function preferredObsidianNewNoteFolder(root: string): string | null {
	const config = readObsidianAppConfig(root);
	if (config.newFileLocation !== 'folder') return null;
	return config.newFileFolderStatus === 'safe' ? config.newFileFolderPath ?? null : null;
}

export function shouldUpdateLinksOnRename(root: string): boolean {
	const config = readObsidianAppConfig(root);
	return config.alwaysUpdateLinks !== false;
}

export function editorLinkPreference(root: string): EditorLinkPreference {
	const config = readObsidianAppConfig(root);
	const style = config.useMarkdownLinks ? 'markdown' : 'wikilink';
	return {
		style,
		newLinkFormat: config.newLinkFormat ?? null,
		source: config.useMarkdownLinks === undefined ? 'diamond-default' : 'obsidian-app-config'
	};
}
