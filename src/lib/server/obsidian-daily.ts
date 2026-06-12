import fs from 'node:fs';
import path from 'node:path';
import { safeVaultFolder } from './obsidian-config';
import { formatDate } from './templates';
import { normalizeVaultPath } from './paths';

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

function readDailyNotesJson(root: string): Record<string, unknown> | null {
	const abs = path.join(root, '.obsidian', 'daily-notes.json');
	if (!fs.existsSync(abs)) return null;
	try {
		return record(JSON.parse(fs.readFileSync(abs, 'utf-8')) as unknown);
	} catch {
		return null;
	}
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

export function dailyNotePlan(root: string, now = new Date()): DailyNotePlan {
	const dailyJson = readDailyNotesJson(root);
	const date = dateAtNoon(now);
	const source = dailyJson ? 'obsidian-daily-notes' : 'diamond-default';
	const folder = dailyJson ? dailyFolder(dailyJson.folder) : undefined;
	const safeFolder = folder !== undefined ? folder : DEFAULT_DAILY_FOLDER;
	const configuredFormat = stringValue(dailyJson?.format);
	const dateRel = configuredFormat ? dailyDateRel(date, configuredFormat) : null;
	const safeDateRel = dateRel ?? dailyDateRel(date, DEFAULT_DAILY_FORMAT)!;
	const rel = safeFolder
		? normalizeVaultPath(`${safeFolder}/${safeDateRel}`)
		: safeDateRel;
	const title = path.posix.basename(rel).replace(/\.md$/i, '');
	const configuredTemplate = obsidianDailyTemplatePath(dailyJson?.template);
	return {
		path: rel,
		title,
		date,
		templateRel: configuredTemplate ?? DEFAULT_DAILY_TEMPLATE,
		source
	};
}
