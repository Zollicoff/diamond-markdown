import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { commitChange } from './git';
import { getIndex, upsertNote } from './indexer';
import { normalizeVaultPath, resolveInVault } from './paths';
import type { Vault } from './vault';
import { splitAssetReference } from './embed';
import { replaceEmbeds } from './wikilink';
import { resolveMarkdownImagePath } from './embed';
import type { AttachmentKind, AttachmentRef } from '$lib/types';

export interface AttachmentUploadResult {
	ok: true;
	path: string;
	filename: string;
	size: number;
	sha: string | null;
}

export interface AttachmentDeleteResult {
	ok: true;
	path: string;
	sha: string | null;
}

export interface AttachmentRenameResult {
	ok: true;
	from: string;
	to: string;
	linksUpdated: number;
	touched: string[];
	sha: string | null;
}

const DEFAULT_ATTACHMENT_FOLDER = 'Attachments';
const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;
const MAX_LISTED_ATTACHMENTS = 1_000;
const IMAGE_EXT_RE = /\.(?:png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i;
const AUDIO_EXT_RE = /\.(?:mp3|wav|ogg|oga|m4a|flac|aac|opus)$/i;
const VIDEO_EXT_RE = /\.(?:mp4|webm|ogv|mov|m4v)$/i;
const PDF_EXT_RE = /\.pdf$/i;
const EXCLUDED_DIRS = new Set(['.git', '.diamondmd', '.obsidian', '.diamond-publish', 'node_modules']);

function record(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? value as Record<string, unknown>
		: null;
}

export function sanitizeAttachmentFilename(input: string): string {
	const basename = path.basename((input || 'attachment').replace(/\\/g, '/'));
	const cleaned = basename
		.replace(/[\u0000-\u001f\u007f]/g, '')
		.replace(/[/:]/g, '-')
		.trim()
		.replace(/^\.+/, '')
		.trim();
	return cleaned || 'attachment';
}

function candidateFilename(filename: string, index: number): string {
	if (index === 1) return filename;
	const parsed = path.parse(filename);
	const stem = parsed.name || 'attachment';
	return `${stem} ${index}${parsed.ext}`;
}

function safeAttachmentFolder(input: unknown): string | null {
	if (typeof input !== 'string') return null;
	const trimmed = input.trim().replace(/^\.\/+/, '');
	if (!trimmed || trimmed === '.' || trimmed === '/') return null;

	let rel: string;
	try {
		rel = normalizeVaultPath(trimmed);
	} catch {
		return null;
	}

	const segments = rel.split('/');
	if (segments.some((segment) => segment.startsWith('.') || EXCLUDED_DIRS.has(segment))) return null;
	return rel;
}

function obsidianAttachmentFolder(vault: Vault): string | null {
	const appConfig = path.join(vault.path, '.obsidian', 'app.json');
	if (!fs.existsSync(appConfig)) return null;
	try {
		const parsed = record(JSON.parse(fs.readFileSync(appConfig, 'utf-8')) as unknown);
		return safeAttachmentFolder(parsed?.attachmentFolderPath);
	} catch {
		return null;
	}
}

export function preferredAttachmentFolder(vault: Vault): string {
	return obsidianAttachmentFolder(vault) ?? DEFAULT_ATTACHMENT_FOLDER;
}

function nextAvailableAttachmentPath(vault: Vault, filename: string): { rel: string; abs: string } {
	const folder = preferredAttachmentFolder(vault);
	for (let index = 1; index <= 999; index += 1) {
		const rel = normalizeVaultPath(`${folder}/${candidateFilename(filename, index)}`);
		const abs = resolveInVault(vault, rel);
		if (!fs.existsSync(abs)) return { rel, abs };
	}
	throw new Error('could not find an available attachment filename');
}

function attachmentKind(relPath: string): AttachmentKind | null {
	if (/\.(?:md|markdown|canvas)$/i.test(relPath)) return null;
	if (IMAGE_EXT_RE.test(relPath)) return 'image';
	if (AUDIO_EXT_RE.test(relPath)) return 'audio';
	if (VIDEO_EXT_RE.test(relPath)) return 'video';
	if (PDF_EXT_RE.test(relPath)) return 'pdf';
	return path.posix.extname(relPath) ? 'file' : null;
}

function shouldSkipDir(name: string): boolean {
	return name.startsWith('.') || EXCLUDED_DIRS.has(name);
}

function assertAttachmentPath(inputPath: string): string {
	const rel = normalizeVaultPath(inputPath);
	if (!attachmentKind(rel)) throw new Error('path is not an attachment');
	return rel;
}

function sameAttachmentRef(target: string, oldPath: string): boolean {
	return splitAssetReference(target).path.toLowerCase() === oldPath.toLowerCase();
}

function preserveSuffix(target: string, newPath: string): string {
	return `${newPath}${splitAssetReference(target).suffix}`;
}

function relativeMarkdownHref(notePath: string, newPath: string, suffix: string): string {
	const noteDir = path.posix.dirname(notePath);
	const rel = path.posix.relative(noteDir === '.' ? '' : noteDir, newPath) || path.posix.basename(newPath);
	const href = `${rel}${suffix}`;
	return /\s/.test(href) ? `<${href}>` : href;
}

function splitMarkdownImageDestination(body: string): { href: string; rest: string; wrapped: boolean } | null {
	const trimmed = body.trim();
	if (!trimmed) return null;
	if (trimmed.startsWith('<')) {
		const close = trimmed.indexOf('>');
		if (close < 0) return null;
		return {
			href: trimmed.slice(1, close),
			rest: trimmed.slice(close + 1),
			wrapped: true
		};
	}
	const match = trimmed.match(/^(\S+)([\s\S]*)$/);
	if (!match) return null;
	return { href: match[1], rest: match[2], wrapped: false };
}

function rewriteMarkdownImagesInText(
	text: string,
	notePath: string,
	oldPath: string,
	newPath: string
): { text: string; hits: number } {
	let hits = 0;
	const next = text.replace(/!\[([^\]\n]*)\]\(([^)\n]+)\)/g, (whole, alt: string, body: string) => {
		const dest = splitMarkdownImageDestination(body);
		if (!dest) return whole;
		const resolved = resolveMarkdownImagePath(dest.href, notePath);
		if (!resolved || resolved.toLowerCase() !== oldPath.toLowerCase()) return whole;

		hits++;
		const suffix = splitAssetReference(dest.href).suffix;
		const href = relativeMarkdownHref(notePath, newPath, suffix);
		return `![${alt}](${href}${dest.rest})`;
	});
	return { text: next, hits };
}

function rewriteAttachmentReferences(
	vault: Vault,
	oldPath: string,
	newPath: string
): { touched: string[]; linksUpdated: number } {
	const idx = getIndex(vault);
	const touched = new Set<string>();
	let linksUpdated = 0;

	for (const notePath of idx.notes.keys()) {
		let abs: string;
		try {
			abs = resolveInVault(vault, notePath);
		} catch {
			continue;
		}
		if (!fs.existsSync(abs)) continue;
		const content = fs.readFileSync(abs, 'utf-8');
		let embedHits = 0;
		const withEmbeds = replaceEmbeds(content, (embed) => {
			if (!sameAttachmentRef(embed.target, oldPath)) return embed.raw;
			embedHits++;
			const meta = embed.raw.match(/!\[\[[^\[\]|\n]+?(\|[^\[\]\n]+?)?\]\]/)?.[1] ?? '';
			return `![[${preserveSuffix(embed.target, newPath)}${meta}]]`;
		});
		const markdown = rewriteMarkdownImagesInText(withEmbeds, notePath, oldPath, newPath);
		const next = markdown.text;
		const hits = embedHits + markdown.hits;
		if (hits > 0 && next !== content) {
			fs.writeFileSync(abs, next);
			upsertNote(vault, notePath, next);
			touched.add(notePath);
			linksUpdated += hits;
		}
	}

	return { touched: [...touched], linksUpdated };
}

export function listAttachments(vault: Vault): AttachmentRef[] {
	const root = fs.realpathSync.native(path.resolve(vault.path));
	const results: AttachmentRef[] = [];

	function walk(absDir: string, relDir: string): void {
		if (results.length >= MAX_LISTED_ATTACHMENTS) return;
		for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
			if (results.length >= MAX_LISTED_ATTACHMENTS) return;
			if (entry.isDirectory()) {
				if (shouldSkipDir(entry.name)) continue;
				walk(path.join(absDir, entry.name), relDir ? `${relDir}/${entry.name}` : entry.name);
				continue;
			}
			if (!entry.isFile()) continue;
			const rel = normalizeVaultPath(relDir ? `${relDir}/${entry.name}` : entry.name);
			const kind = attachmentKind(rel);
			if (!kind) continue;
			const abs = path.join(absDir, entry.name);
			const stat = fs.statSync(abs);
			results.push({
				path: rel,
				filename: entry.name,
				size: stat.size,
				mtime: stat.mtimeMs,
				kind
			});
		}
	}

	walk(root, '');
	return results.sort((a, b) => b.mtime - a.mtime || a.path.localeCompare(b.path));
}

export async function saveAttachment(vault: Vault, file: File): Promise<AttachmentUploadResult> {
	const filename = sanitizeAttachmentFilename(file.name);
	const { rel, abs } = nextAvailableAttachmentPath(vault, filename);
	const buffer = Buffer.from(await file.arrayBuffer());
	if (buffer.byteLength > MAX_ATTACHMENT_BYTES) {
		throw new Error('attachment is larger than 100 MB');
	}

	fs.mkdirSync(path.dirname(abs), { recursive: true });
	const tmp = `${abs}.${crypto.randomUUID()}.tmp`;
	try {
		fs.writeFileSync(tmp, buffer, { flag: 'wx' });
		fs.renameSync(tmp, abs);
	} finally {
		if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true });
	}

	const res = await commitChange(vault, [rel], 'create', rel);
	return {
		ok: true,
		path: rel,
		filename: path.basename(rel),
		size: buffer.byteLength,
		sha: res?.sha ?? null
	};
}

export async function deleteAttachment(vault: Vault, inputPath: string): Promise<AttachmentDeleteResult> {
	const rel = assertAttachmentPath(inputPath);
	const abs = resolveInVault(vault, rel);
	if (!fs.existsSync(abs)) throw new Error('attachment not found');
	const stat = fs.statSync(abs);
	if (!stat.isFile()) throw new Error('path is not an attachment file');

	fs.rmSync(abs, { force: true });
	const res = await commitChange(vault, [rel], 'delete', rel);
	return {
		ok: true,
		path: rel,
		sha: res?.sha ?? null
	};
}

export async function renameAttachment(vault: Vault, fromInput: string, toInput: string): Promise<AttachmentRenameResult> {
	const from = assertAttachmentPath(fromInput);
	const to = assertAttachmentPath(toInput);
	if (from.toLowerCase() === to.toLowerCase()) throw new Error('destination must be different');
	const fromAbs = resolveInVault(vault, from);
	const toAbs = resolveInVault(vault, to);
	if (!fs.existsSync(fromAbs) || !fs.statSync(fromAbs).isFile()) throw new Error('attachment not found');
	if (fs.existsSync(toAbs)) throw new Error('destination already exists');

	const { touched, linksUpdated } = rewriteAttachmentReferences(vault, from, to);
	fs.mkdirSync(path.dirname(toAbs), { recursive: true });

	fs.renameSync(fromAbs, toAbs);
	const summary = linksUpdated > 0
		? `${from} → ${to} (+${linksUpdated} reference${linksUpdated === 1 ? '' : 's'} updated)`
		: `${from} → ${to}`;
	const res = await commitChange(vault, [from, to, ...touched], 'rename', summary);

	return { ok: true, from, to, touched, linksUpdated, sha: res?.sha ?? null };
}
