import fs from 'node:fs';
import path from 'node:path';
import type {
	JsonFileStatus,
	ObsidianAppearanceInfo,
	ObsidianAppearanceSetting,
	VaultAppearancePreference,
	VaultImportCheckLevel
} from '$lib/types';

function record(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? value as Record<string, unknown>
		: null;
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

function setting(
	id: string,
	label: string,
	value: string,
	detail: string,
	level: VaultImportCheckLevel = 'info'
): ObsidianAppearanceSetting {
	return { id, label, value, detail, level };
}

function stringValue(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function safeAppliedBaseFontSize(value: unknown): number | null {
	const size = numberValue(value);
	if (size === null || !Number.isInteger(size)) return null;
	return size >= 12 && size <= 24 ? size : null;
}

function safeDisplayString(value: unknown, maxLength = 120): string | null {
	const text = stringValue(value);
	if (!text || text.includes('\0') || text.length > maxLength) return null;
	return text;
}

function normalizedHexColor(value: unknown): string | null {
	const text = safeDisplayString(value, 16);
	if (!text) return null;
	const match = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
	if (!match) return null;
	const hex = match[1].toLowerCase();
	if (hex.length === 6) return `#${hex}`;
	return `#${hex.split('').map((char) => char + char).join('')}`;
}

function safeSnippetName(value: unknown): string | null {
	const text = safeDisplayString(value);
	if (!text) return null;
	const name = text.replace(/\.css$/i, '');
	if (!name || name.startsWith('.') || name.includes('/') || name.includes('\\') || name.includes('..')) return null;
	return name;
}

function snippetIdFromFilename(filename: string): string | null {
	if (!filename.toLowerCase().endsWith('.css')) return null;
	return safeSnippetName(filename);
}

function compactList(values: string[], max = 4): string {
	if (values.length <= max) return values.join(', ');
	return `${values.slice(0, max).join(', ')} +${values.length - max} more`;
}

function listSnippetFiles(root: string, warnings: string[]): string[] {
	const snippetsRoot = path.join(root, '.obsidian', 'snippets');
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(snippetsRoot, { withFileTypes: true });
	} catch (e) {
		if (fs.existsSync(snippetsRoot)) {
			warnings.push('.obsidian/snippets exists but could not be read.');
		}
		return [];
	}
	return entries
		.filter((entry) => entry.isFile())
		.map((entry) => snippetIdFromFilename(entry.name))
		.filter((name): name is string => Boolean(name))
		.sort((a, b) => a.localeCompare(b));
}

export function readObsidianAppearanceConfig(root: string): ObsidianAppearanceInfo {
	const relPath = '.obsidian/appearance.json';
	const appearanceFile = readJsonFile(path.join(root, relPath));
	const warnings: string[] = [];
	const snippetFiles = listSnippetFiles(root, warnings);
	const base: ObsidianAppearanceInfo = {
		path: appearanceFile.status === 'missing' ? undefined : relPath,
		status: appearanceFile.status,
		bytes: appearanceFile.bytes,
		enabledCssSnippets: [],
		snippetFiles,
		missingEnabledSnippets: [],
		settings: [],
		warnings
	};

	if (snippetFiles.length > 0) {
		base.settings.push(setting(
			'cssSnippetFiles',
			'CSS snippet files',
			compactList(snippetFiles.map((name) => `${name}.css`)),
			'Preserved in .obsidian/snippets. Diamond reports these files but does not load Obsidian CSS snippets.'
		));
	}

	if (appearanceFile.status === 'missing') return base;
	if (appearanceFile.status === 'invalid') {
		base.warnings.push('.obsidian/appearance.json is present but is not valid JSON.');
		return base;
	}

	const body = record(appearanceFile.value);
	if (!body) {
		base.status = 'invalid';
		base.warnings.push('.obsidian/appearance.json is present but does not contain a JSON object.');
		return base;
	}

	const theme = safeDisplayString(body.theme);
	if (theme) {
		base.theme = theme;
		base.settings.push(setting(
			'theme',
			'Base theme',
			theme,
			'Reported for migration planning. Diamond theme selection is separate and does not rewrite Obsidian appearance settings.'
		));
	}

	const cssTheme = safeDisplayString(body.cssTheme);
	if (cssTheme) {
		base.cssTheme = cssTheme;
		base.settings.push(setting(
			'cssTheme',
			'Community theme',
			cssTheme,
			'Preserved in Obsidian settings but not loaded as a Diamond theme.'
		));
	}

	const baseFontSize = numberValue(body.baseFontSize);
	if (baseFontSize !== null) {
		base.baseFontSize = baseFontSize;
		base.settings.push(setting(
			'baseFontSize',
			'Base font size',
			`${baseFontSize}px`,
			safeAppliedBaseFontSize(baseFontSize) === null
				? 'Reported for migration planning. Diamond only applies safe integer base font sizes from 12px to 24px.'
				: 'Diamond applies this safe Obsidian base font size while this vault is open.'
		));
	}

	const accentColor = safeDisplayString(body.accentColor ?? body.customAccentColor);
	if (accentColor) {
		base.accentColor = accentColor;
		base.settings.push(setting(
			'accentColor',
			'Accent color',
			accentColor,
			normalizedHexColor(accentColor)
				? 'Diamond applies this safe Obsidian accent color while this vault is open.'
				: 'Reported for visual comparison only; Diamond applies only hex Obsidian accent colors.'
		));
	}

	if (Array.isArray(body.enabledCssSnippets)) {
		const enabled: string[] = [];
		let unsafeNames = 0;
		for (const value of body.enabledCssSnippets) {
			const name = safeSnippetName(value);
			if (name) enabled.push(name);
			else unsafeNames += 1;
		}
		base.enabledCssSnippets = [...new Set(enabled)].sort((a, b) => a.localeCompare(b));
		const snippetSet = new Set(snippetFiles);
		base.missingEnabledSnippets = base.enabledCssSnippets
			.filter((name) => !snippetSet.has(name))
			.sort((a, b) => a.localeCompare(b));

		if (base.enabledCssSnippets.length > 0) {
			base.settings.push(setting(
				'enabledCssSnippets',
				'Enabled CSS snippets',
				compactList(base.enabledCssSnippets),
				'Reported read-only. Diamond preserves these snippets but does not execute Obsidian custom CSS.',
				base.missingEnabledSnippets.length > 0 ? 'warn' : 'info'
			));
		}
		if (base.missingEnabledSnippets.length > 0) {
			base.settings.push(setting(
				'missingEnabledCssSnippets',
				'Missing enabled snippets',
				compactList(base.missingEnabledSnippets),
				'appearance.json enables snippets that were not found in .obsidian/snippets.',
				'warn'
			));
			base.warnings.push('Obsidian appearance enables CSS snippets that were not found in .obsidian/snippets.');
		}
		if (unsafeNames > 0) {
			base.warnings.push(`${unsafeNames} Obsidian CSS snippet name${unsafeNames === 1 ? '' : 's'} ignored because it was unsafe.`);
		}
	}

	return base;
}

export function vaultAppearancePreference(root: string): VaultAppearancePreference {
	const config = readObsidianAppearanceConfig(root);
	const baseFontSize = safeAppliedBaseFontSize(config.baseFontSize);
	const accentColor = normalizedHexColor(config.accentColor);
	return {
		baseFontSize,
		accentColor,
		source: baseFontSize !== null || accentColor !== null ? 'obsidian-appearance' : 'diamond-default'
	};
}
