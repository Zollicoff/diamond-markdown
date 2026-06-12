import fs from 'node:fs';
import path from 'node:path';
import { safeVaultFolder } from './obsidian-config';
import type {
	JsonFileStatus,
	ObsidianTemplatesInfo,
	ObsidianTemplatesSetting,
	VaultImportCheckLevel
} from '$lib/types';

export const DEFAULT_TEMPLATES_FOLDER = 'Templates';
export const DEFAULT_TEMPLATE_DATE_FORMAT = 'YYYY-MM-DD';
export const DEFAULT_TEMPLATE_TIME_FORMAT = 'HH:mm';

export interface TemplateRuntimeSettings {
	folder: string;
	dateFormat: string;
	timeFormat: string;
	source: 'obsidian-templates' | 'diamond-default';
}

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
): ObsidianTemplatesSetting {
	return { id, label, value, detail, level };
}

function safeTemplateFormat(value: unknown): string | null | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	if (!trimmed || trimmed.includes('\0') || trimmed.length > 120) return null;
	return trimmed;
}

export function readObsidianTemplatesConfig(root: string): ObsidianTemplatesInfo {
	const relPath = '.obsidian/templates.json';
	const templatesFile = readJsonFile(path.join(root, relPath));
	const base: ObsidianTemplatesInfo = {
		path: templatesFile.status === 'missing' ? undefined : relPath,
		status: templatesFile.status,
		bytes: templatesFile.bytes,
		folderStatus: 'missing',
		dateFormatStatus: 'missing',
		timeFormatStatus: 'missing',
		settings: [],
		warnings: []
	};

	if (templatesFile.status === 'missing') return base;
	if (templatesFile.status === 'invalid') {
		base.warnings.push('.obsidian/templates.json is present but is not valid JSON.');
		return base;
	}

	const body = record(templatesFile.value);
	if (!body) {
		base.status = 'invalid';
		base.warnings.push('.obsidian/templates.json is present but does not contain a JSON object.');
		return base;
	}

	if ('folder' in body) {
		const folder = safeVaultFolder(body.folder);
		if (folder) {
			base.folderPath = folder;
			base.folderStatus = 'safe';
			base.settings.push(setting(
				'folder',
				'Template folder',
				folder,
				'Diamond uses this safe Obsidian Templates folder for the insert-template picker.'
			));
		} else {
			base.folderStatus = 'unsafe';
			base.settings.push(setting(
				'folder',
				'Template folder',
				String(body.folder ?? ''),
				'Ignored because it is empty, absolute, hidden, escapes the vault, or targets an excluded folder.',
				'warn'
			));
			base.warnings.push('Obsidian Templates folder is unsafe and will fall back to Diamond defaults.');
		}
	}

	if ('dateFormat' in body) {
		const dateFormat = safeTemplateFormat(body.dateFormat);
		if (dateFormat) {
			base.dateFormat = dateFormat;
			base.dateFormatStatus = 'safe';
			base.settings.push(setting(
				'dateFormat',
				'Template date format',
				dateFormat,
				'Diamond uses this as the default format for {{date}} template tokens.'
			));
		} else {
			base.dateFormatStatus = 'unsafe';
			base.settings.push(setting(
				'dateFormat',
				'Template date format',
				String(body.dateFormat ?? ''),
				'Ignored because it is empty, too long, or contains an invalid character.',
				'warn'
			));
			base.warnings.push('Obsidian Templates dateFormat is unsafe and will fall back to Diamond defaults.');
		}
	}

	if ('timeFormat' in body) {
		const timeFormat = safeTemplateFormat(body.timeFormat);
		if (timeFormat) {
			base.timeFormat = timeFormat;
			base.timeFormatStatus = 'safe';
			base.settings.push(setting(
				'timeFormat',
				'Template time format',
				timeFormat,
				'Diamond uses this as the default format for {{time}} template tokens.'
			));
		} else {
			base.timeFormatStatus = 'unsafe';
			base.settings.push(setting(
				'timeFormat',
				'Template time format',
				String(body.timeFormat ?? ''),
				'Ignored because it is empty, too long, or contains an invalid character.',
				'warn'
			));
			base.warnings.push('Obsidian Templates timeFormat is unsafe and will fall back to Diamond defaults.');
		}
	}

	return base;
}

export function templateRuntimeSettings(root: string): TemplateRuntimeSettings {
	const config = readObsidianTemplatesConfig(root);
	return {
		folder: config.folderStatus === 'safe' ? config.folderPath ?? DEFAULT_TEMPLATES_FOLDER : DEFAULT_TEMPLATES_FOLDER,
		dateFormat: config.dateFormatStatus === 'safe' ? config.dateFormat ?? DEFAULT_TEMPLATE_DATE_FORMAT : DEFAULT_TEMPLATE_DATE_FORMAT,
		timeFormat: config.timeFormatStatus === 'safe' ? config.timeFormat ?? DEFAULT_TEMPLATE_TIME_FORMAT : DEFAULT_TEMPLATE_TIME_FORMAT,
		source: config.status === 'missing' ? 'diamond-default' : 'obsidian-templates'
	};
}
