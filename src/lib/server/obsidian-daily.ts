import fs from 'node:fs';
import path from 'node:path';
import { safeVaultFolder } from './obsidian-config';
import { formatDate } from './templates';
import { normalizeVaultPath } from './paths';
import type { JsonFileStatus, ObsidianDailyNotesInfo, ObsidianDailyNotesSetting, VaultImportCheckLevel } from '$lib/types';

export const DEFAULT_DAILY_FOLDER = 'Daily Notes';
export const DEFAULT_DAILY_FORMAT = 'YYYY-MM-DD';
export const DEFAULT_DAILY_TEMPLATE = 'Daily Notes/Template.md';

const EXCLUDED_DIRS = new Set(['.git', '.diamondmd', '.obsidian', '.diamond-publish', 'node_modules']);

export interface DailyNotePlan {
	path: string;
	title: string;
	date: Date;
	templateRel: string;
	source: 'obsidian-daily-notes' | 'diamond-default';
}

function record(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? value as Record<string, unknown>
		: null;
}

function stringValue(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function setting(
	id: string,
	label: string,
	value: string,
	detail: string,
	level: VaultImportCheckLevel = 'info'
): ObsidianDailyNotesSetting {
	return { id, label, value, detail, level };
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

function hasUnsafeSegment(rel: string): boolean {
	return rel.split('/').some((segment) => segment.startsWith('.') || EXCLUDED_DIRS.has(segment));
}

function normalizeSafeFile(input: unknown, extension: string): string | null {
	const raw = stringValue(input);
	if (!raw) return null;
	const trimmed = raw.replace(/^\.\/+/, '');
	let rel: string;
	try {
		rel = normalizeVaultPath(trimmed);
	} catch {
		return null;
	}
	if (hasUnsafeSegment(rel)) return null;
	if (!rel.toLowerCase().endsWith(extension)) rel += extension;
	try {
		rel = normalizeVaultPath(rel);
	} catch {
		return null;
	}
	if (hasUnsafeSegment(rel)) return null;
	return rel;
}

function dateAtNoon(now: Date): Date {
	return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
}

function dailyDateRel(date: Date, format: string): string | null {
	const rendered = formatDate(date, format).trim();
	if (!rendered) return null;
	const candidate = rendered.toLowerCase().endsWith('.md') ? rendered : `${rendered}.md`;
	let rel: string;
	try {
		rel = normalizeVaultPath(candidate);
	} catch {
		return null;
	}
	if (hasUnsafeSegment(rel)) return null;
	return rel;
}

function dailyFolder(value: unknown): string | null | undefined {
	if (typeof value !== 'string') return undefined;
	if (value.trim() === '') return null;
	return safeVaultFolder(value) ?? undefined;
}

export function obsidianDailyTemplatePath(value: unknown): string | null {
	return normalizeSafeFile(value, '.md');
}

export function readObsidianDailyNotesConfig(root: string, now = new Date()): ObsidianDailyNotesInfo {
	const relPath = '.obsidian/daily-notes.json';
	const dailyFile = readJsonFile(path.join(root, relPath));
	const date = dateAtNoon(now);
	const defaultDateRel = dailyDateRel(date, DEFAULT_DAILY_FORMAT)!;
	const base: ObsidianDailyNotesInfo = {
		path: dailyFile.status === 'missing' ? undefined : relPath,
		status: dailyFile.status,
		bytes: dailyFile.bytes,
		folderStatus: 'missing',
		templateStatus: 'missing',
		formatStatus: 'missing',
		plannedPath: `${DEFAULT_DAILY_FOLDER}/${defaultDateRel}`,
		settings: [],
		warnings: []
	};

	if (dailyFile.status === 'missing') return base;
	if (dailyFile.status === 'invalid') {
		base.warnings.push('.obsidian/daily-notes.json is present but is not valid JSON.');
		return base;
	}

	const dailyJson = record(dailyFile.value);
	if (!dailyJson) {
		base.status = 'invalid';
		base.warnings.push('.obsidian/daily-notes.json is present but does not contain a JSON object.');
		return base;
	}

	const folder = dailyFolder(dailyJson.folder);
	const safeFolder = folder !== undefined ? folder : DEFAULT_DAILY_FOLDER;
	const configuredFormat = stringValue(dailyJson?.format);
	const dateRel = configuredFormat ? dailyDateRel(date, configuredFormat) : null;
	const safeDateRel = dateRel ?? dailyDateRel(date, DEFAULT_DAILY_FORMAT)!;
	const plannedPath = safeFolder
		? normalizeVaultPath(`${safeFolder}/${safeDateRel}`)
		: safeDateRel;
	const configuredTemplate = obsidianDailyTemplatePath(dailyJson?.template);

	if ('folder' in dailyJson) {
		if (folder === null) {
			base.folderPath = null;
			base.folderStatus = 'vault-root';
			base.settings.push(setting(
				'folder',
				'Daily note folder',
				'Vault root',
				'Diamond will create daily notes at the vault root because Obsidian folder is blank.'
			));
		} else if (folder) {
			base.folderPath = folder;
			base.folderStatus = 'safe';
			base.settings.push(setting(
				'folder',
				'Daily note folder',
				folder,
				'Diamond reuses this safe Obsidian Daily Notes folder.'
			));
		} else {
			base.folderStatus = 'unsafe';
			base.settings.push(setting(
				'folder',
				'Daily note folder',
				String(dailyJson.folder ?? ''),
				'Ignored because it is absolute, hidden, escapes the vault, or targets an excluded folder.',
				'warn'
			));
			base.warnings.push('Obsidian Daily Notes folder is unsafe and will fall back to Diamond defaults.');
		}
	}

	if ('template' in dailyJson) {
		if (configuredTemplate) {
			base.templatePath = configuredTemplate;
			base.templateStatus = 'safe';
			base.settings.push(setting(
				'template',
				'Daily note template',
				configuredTemplate,
				'Diamond reuses this safe Obsidian Daily Notes template path.'
			));
		} else {
			base.templateStatus = 'unsafe';
			base.settings.push(setting(
				'template',
				'Daily note template',
				String(dailyJson.template ?? ''),
				'Ignored because it is empty, absolute, hidden, escapes the vault, or targets an excluded folder.',
				'warn'
			));
			base.warnings.push('Obsidian Daily Notes template is unsafe and will fall back to Diamond defaults.');
		}
	}

	if (configuredFormat) {
		base.format = configuredFormat;
		if (dateRel) {
			base.formatStatus = 'safe';
			base.settings.push(setting(
				'format',
				'Daily note date format',
				configuredFormat,
				`Diamond resolves this format to ${safeDateRel.replace(/\.md$/i, '')} for today's note.`
			));
		} else {
			base.formatStatus = 'unsafe';
			base.settings.push(setting(
				'format',
				'Daily note date format',
				configuredFormat,
				'Ignored because it resolves outside the vault, into hidden/excluded folders, or to an empty path.',
				'warn'
			));
			base.warnings.push('Obsidian Daily Notes format is unsafe and will fall back to Diamond defaults.');
		}
	}

	base.plannedPath = plannedPath;
	return base;
}

export function dailyNotePlan(root: string, now = new Date()): DailyNotePlan {
	const config = readObsidianDailyNotesConfig(root, now);
	const date = dateAtNoon(now);
	const rel = config.plannedPath;
	const title = path.posix.basename(rel).replace(/\.md$/i, '');
	return {
		path: rel,
		title,
		date,
		templateRel: config.templatePath ?? DEFAULT_DAILY_TEMPLATE,
		source: config.status === 'missing' ? 'diamond-default' : 'obsidian-daily-notes'
	};
}
