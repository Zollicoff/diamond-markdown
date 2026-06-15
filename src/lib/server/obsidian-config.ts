import fs from 'node:fs';
import path from 'node:path';
import { normalizeVaultPath } from './paths';
import type {
	EditorDisplayPreference,
	EditorLinkPreference,
	JsonFileStatus,
	MarkdownRenderPreference,
	DeleteConfirmationPreference,
	NoteViewMode,
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

function safeTabSize(value: unknown): number | null {
	if (typeof value !== 'number' || !Number.isInteger(value)) return null;
	return value >= 1 && value <= 16 ? value : null;
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
	if (value === 'relative') return 'Obsidian prefers relative links. Diamond resolves existing relative Markdown note links and wikilinks without rewriting them.';
	if (value === 'absolute') return 'Obsidian prefers vault-absolute links. Diamond resolves existing vault-path Markdown note links and wikilinks without rewriting them.';
	if (value === 'shortest') return 'Obsidian prefers the shortest valid link. Diamond resolves imported note links without rewriting them.';
	return 'Diamond preserves imported links and does not rewrite link format during import.';
}

function newFileLocationLabel(value: string): string {
	if (value === 'current') return 'Same folder as active file';
	if (value === 'folder') return 'Configured folder';
	if (value === 'root') return 'Vault root';
	return value;
}

function defaultViewModeLabel(value: string): string {
	if (value === 'preview') return 'Reading view';
	if (value === 'source') return 'Editing view';
	if (value === 'live') return 'Live preview';
	if (value === 'read') return 'Read mode';
	return value;
}

function defaultViewModeDetail(mode: NoteViewMode | null, livePreview: boolean | null): string {
	if (mode === 'read') return 'Diamond opens notes in Read mode for this imported vault.';
	if (mode === 'source') return 'Diamond opens notes in Source mode because Obsidian uses editing view with Live Preview disabled.';
	if (mode === 'live') return 'Diamond opens notes in Live mode, matching Obsidian editing view with Live Preview enabled.';
	if (livePreview === false) return 'Diamond could not map this view mode directly, but Live Preview is disabled in Obsidian.';
	return 'Reported for migration review; Diamond uses Live mode when the setting is unsupported.';
}

function noteViewModeForObsidian(defaultViewMode: string | null, livePreview: boolean | null): NoteViewMode | null {
	if (defaultViewMode === 'preview' || defaultViewMode === 'read') return 'read';
	if (defaultViewMode === 'live') return 'live';
	if (defaultViewMode === 'source') return livePreview === false ? 'source' : 'live';
	return null;
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
				? 'Diamond resolves local Markdown note links and wikilinks; the editor link button inserts Markdown link syntax.'
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

	const showUnsupportedFiles = booleanValue(body.showUnsupportedFiles);
	if (showUnsupportedFiles !== null) {
		base.showUnsupportedFiles = showUnsupportedFiles;
		base.settings.push(setting(
			'showUnsupportedFiles',
			'Unsupported files',
			showUnsupportedFiles ? 'Visible' : 'Hidden',
			showUnsupportedFiles
				? 'Diamond shows non-note vault files in the tree and opens them through the raw asset route.'
				: 'Diamond keeps non-note vault files hidden from the active file tree.'
		));
	}

	const showLineNumber = booleanValue(body.showLineNumber);
	if (showLineNumber !== null) {
		base.showLineNumber = showLineNumber;
		base.settings.push(setting(
			'showLineNumber',
			'Line numbers',
			showLineNumber ? 'Visible' : 'Hidden',
			showLineNumber
				? 'Diamond shows editor line numbers for this imported vault.'
				: 'Diamond hides editor line numbers for this imported vault.'
		));
	}

	const showInlineTitle = booleanValue(body.showInlineTitle);
	if (showInlineTitle !== null) {
		base.showInlineTitle = showInlineTitle;
		base.settings.push(setting(
			'showInlineTitle',
			'Inline note title',
			showInlineTitle ? 'Visible' : 'Hidden',
			showInlineTitle
				? 'Diamond shows the note file title above the editor and reading surface for this imported vault.'
				: 'Diamond keeps the note title in the pane chrome instead of repeating it above the note body.'
		));
	}

	const spellcheck = booleanValue(body.spellcheck);
	if (spellcheck !== null) {
		base.spellcheck = spellcheck;
		base.settings.push(setting(
			'spellcheck',
			'Spellcheck',
			spellcheck ? 'Enabled' : 'Disabled',
			spellcheck
				? 'Diamond enables browser spellcheck in the markdown editor for this imported vault.'
				: 'Diamond keeps browser spellcheck disabled in the markdown editor for this imported vault.'
		));
	}

	if ('tabSize' in body) {
		const tabSize = safeTabSize(body.tabSize);
		if (tabSize !== null) {
			base.tabSize = tabSize;
			base.settings.push(setting(
				'tabSize',
				'Tab size',
				`${tabSize} spaces`,
				'Diamond uses this Obsidian tab width in the markdown editor for indentation and tab rendering.'
			));
		} else {
			base.settings.push(setting(
				'tabSize',
				'Tab size',
				String(body.tabSize ?? ''),
				'Ignored because Diamond only accepts integer tab sizes from 1 to 16.',
				'warn'
			));
			base.warnings.push('Obsidian tabSize is outside Diamond\'s supported range and will be ignored.');
		}
	}

	const readableLineLength = booleanValue(body.readableLineLength);
	if (readableLineLength !== null) {
		base.readableLineLength = readableLineLength;
		base.settings.push(setting(
			'readableLineLength',
			'Readable line length',
			readableLineLength ? 'Enabled' : 'Disabled',
			readableLineLength
				? 'Diamond narrows editor and reading surfaces for this imported vault.'
				: 'Diamond leaves editor and reading surfaces at the full pane width for this imported vault.'
		));
	}

	const foldHeading = booleanValue(body.foldHeading);
	if (foldHeading !== null) {
		base.foldHeading = foldHeading;
		base.settings.push(setting(
			'foldHeading',
			'Fold headings',
			foldHeading ? 'Enabled' : 'Disabled',
			foldHeading
				? 'Diamond shows editor fold controls for foldable Markdown sections in this imported vault.'
				: 'Diamond keeps heading fold controls disabled unless another Obsidian folding preference enables editor folding.'
		));
	}

	const foldIndent = booleanValue(body.foldIndent);
	if (foldIndent !== null) {
		base.foldIndent = foldIndent;
		base.settings.push(setting(
			'foldIndent',
			'Fold indented blocks',
			foldIndent ? 'Enabled' : 'Disabled',
			foldIndent
				? 'Diamond shows editor fold controls for foldable Markdown sections in this imported vault.'
				: 'Diamond keeps indented-block fold controls disabled unless another Obsidian folding preference enables editor folding.'
		));
	}

	const strictLineBreaks = booleanValue(body.strictLineBreaks);
	if (strictLineBreaks !== null) {
		base.strictLineBreaks = strictLineBreaks;
		base.settings.push(setting(
			'strictLineBreaks',
			'Strict line breaks',
			strictLineBreaks ? 'Enabled' : 'Disabled',
			strictLineBreaks
				? 'Diamond keeps strict Markdown line-break behavior; single newlines inside paragraphs stay soft unless Markdown hard-break syntax is used.'
				: 'Diamond renders single newlines as hard line breaks in Read mode, hover previews, and static publish for this imported vault.'
		));
	}

	const livePreview = booleanValue(body.livePreview);
	if (livePreview !== null) {
		base.livePreview = livePreview;
		base.settings.push(setting(
			'livePreview',
			'Live Preview',
			livePreview ? 'Enabled' : 'Disabled',
			livePreview
				? 'Diamond uses Live mode for Obsidian editing view unless Read mode is the configured default.'
				: 'Diamond uses Source mode when Obsidian editing view is the configured default.'
		));
	}

	const defaultViewMode = stringValue(body.defaultViewMode);
	if (defaultViewMode) {
		base.defaultViewMode = defaultViewMode;
		const mappedMode = noteViewModeForObsidian(defaultViewMode, livePreview);
		if (mappedMode) base.defaultMode = mappedMode;
		base.settings.push(setting(
			'defaultViewMode',
			'Default view mode',
			defaultViewModeLabel(defaultViewMode),
			defaultViewModeDetail(mappedMode, livePreview),
			mappedMode ? 'info' : 'warn'
		));
		if (!mappedMode) {
			base.warnings.push(`Obsidian defaultViewMode "${defaultViewMode}" is unsupported and will not change Diamond's default Live mode.`);
		}
	}

	const promptDelete = booleanValue(body.promptDelete);
	if (promptDelete !== null) {
		base.promptDelete = promptDelete;
		base.settings.push(setting(
			'promptDelete',
			'Delete confirmation',
			promptDelete ? 'Enabled' : 'Disabled',
			promptDelete
				? 'Diamond asks for confirmation before deleting notes, Canvas files, folders, and attachments in this imported vault.'
				: 'Diamond skips the extra delete confirmation dialog for notes, Canvas files, folders, and attachments in this imported vault.'
		));
	}

	const trashOption = stringValue(body.trashOption);
	if (trashOption) {
		base.trashOption = trashOption;
		base.settings.push(setting(
			'trashOption',
			'Delete behavior',
			trashOption,
			trashOption === 'local'
				? 'Diamond moves deleted notes, Canvas files, folders, and attachments into the vault .trash folder before committing the change.'
				: 'Diamond reports this setting for migration review; only Obsidian local trash is applied portably inside the vault.',
			trashOption === 'local' ? 'info' : 'warn'
		));
		if (trashOption !== 'local') {
			base.warnings.push(`Obsidian trashOption "${trashOption}" is not applied automatically; Diamond still records deletes in git history.`);
		}
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

export function shouldShowUnsupportedFiles(root: string): boolean {
	const config = readObsidianAppConfig(root);
	return config.showUnsupportedFiles === true;
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

export function markdownRenderPreference(root: string): MarkdownRenderPreference {
	const config = readObsidianAppConfig(root);
	const strictLineBreaks = config.strictLineBreaks !== false;
	return {
		strictLineBreaks,
		softLineBreaks: !strictLineBreaks,
		source: config.strictLineBreaks === undefined ? 'diamond-default' : 'obsidian-app-config'
	};
}

export function deleteConfirmationPreference(root: string): DeleteConfirmationPreference {
	const config = readObsidianAppConfig(root);
	return {
		confirmDeletes: config.promptDelete !== false,
		source: config.promptDelete === undefined ? 'diamond-default' : 'obsidian-app-config'
	};
}

export function editorDisplayPreference(root: string): EditorDisplayPreference {
	const config = readObsidianAppConfig(root);
	const defaultMode = config.defaultMode ?? 'live';
	return {
		lineNumbers: config.showLineNumber !== false,
		showInlineTitle: config.showInlineTitle === true,
		spellcheck: config.spellcheck === true,
		tabSize: config.tabSize ?? 4,
		readableLineLength: config.readableLineLength === true,
		folding: config.foldHeading === true || config.foldIndent === true,
		defaultMode,
		source: config.showLineNumber === undefined && config.showInlineTitle === undefined && config.defaultMode === undefined && config.spellcheck === undefined && config.tabSize === undefined && config.readableLineLength === undefined && config.foldHeading === undefined && config.foldIndent === undefined
			? 'diamond-default'
			: 'obsidian-app-config'
	};
}
