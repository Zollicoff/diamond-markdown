import fs from 'node:fs';
import path from 'node:path';
import type { CanvasNotePreview } from '$lib/types';
import { splitFrontmatter } from './frontmatter';
import { normalizeVaultPath, resolveInVault } from './paths';
import type { Vault } from './vault';

const MAX_CANVAS_NOTE_PREVIEW_PATHS = 80;
const MAX_CANVAS_NOTE_PREVIEW_CHARS = 2_000;
const MAX_CANVAS_NOTE_PREVIEW_LINES = 80;

function basenameTitle(rel: string): string {
	return path.basename(rel).replace(/\.(md|markdown)$/i, '') || rel;
}

export function canvasNotePreviewBody(body: string): { body: string; truncated: boolean } {
	const normalized = body.replace(/\r\n?/g, '\n').trim();
	const lines = normalized.split('\n');
	let truncated = lines.length > MAX_CANVAS_NOTE_PREVIEW_LINES || normalized.length > MAX_CANVAS_NOTE_PREVIEW_CHARS;
	let preview = lines.slice(0, MAX_CANVAS_NOTE_PREVIEW_LINES).join('\n').slice(0, MAX_CANVAS_NOTE_PREVIEW_CHARS).trim();
	if (truncated) preview = `${preview.replace(/\s+$/, '')}\n...`;
	return { body: preview, truncated };
}

function invalidPreview(inputPath: string, detail: string): CanvasNotePreview {
	return {
		path: inputPath,
		title: inputPath || 'Invalid note',
		body: '',
		status: 'invalid',
		detail,
		truncated: false
	};
}

function missingPreview(rel: string): CanvasNotePreview {
	return {
		path: rel,
		title: basenameTitle(rel),
		body: '',
		status: 'missing',
		detail: 'note file not found',
		truncated: false
	};
}

function unsupportedPreview(rel: string): CanvasNotePreview {
	return {
		path: rel,
		title: basenameTitle(rel),
		body: '',
		status: 'unsupported',
		detail: 'canvas note previews require a markdown file path',
		truncated: false
	};
}

export function loadCanvasNotePreview(vault: Vault, inputPath: string): CanvasNotePreview {
	let rel: string;
	try {
		rel = normalizeVaultPath(inputPath);
	} catch (e) {
		return invalidPreview(inputPath, (e as Error).message);
	}

	if (!/\.(md|markdown)$/i.test(rel)) return unsupportedPreview(rel);

	let abs: string;
	try {
		abs = resolveInVault(vault, rel);
	} catch (e) {
		return invalidPreview(rel, (e as Error).message);
	}

	if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return missingPreview(rel);

	const raw = fs.readFileSync(abs, 'utf-8');
	const { frontmatter, body } = splitFrontmatter(raw);
	const preview = canvasNotePreviewBody(body);
	return {
		path: rel,
		title: typeof frontmatter.title === 'string' && frontmatter.title.trim() ? frontmatter.title.trim() : basenameTitle(rel),
		body: preview.body,
		status: 'ok',
		truncated: preview.truncated
	};
}

export function loadCanvasNotePreviews(vault: Vault, inputPaths: string[]): CanvasNotePreview[] {
	const paths = [...new Set(inputPaths.filter((entry): entry is string => typeof entry === 'string'))]
		.slice(0, MAX_CANVAS_NOTE_PREVIEW_PATHS);
	return paths.map((inputPath) => loadCanvasNotePreview(vault, inputPath));
}
