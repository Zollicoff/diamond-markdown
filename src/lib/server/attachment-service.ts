import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { commitChange } from './git';
import { normalizeVaultPath, resolveInVault } from './paths';
import type { Vault } from './vault';
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

const DEFAULT_ATTACHMENT_FOLDER = 'Attachments';
const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;
const MAX_LISTED_ATTACHMENTS = 1_000;
const IMAGE_EXT_RE = /\.(?:png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i;
const AUDIO_EXT_RE = /\.(?:mp3|wav|ogg|oga|m4a|flac|aac|opus)$/i;
const VIDEO_EXT_RE = /\.(?:mp4|webm|ogv|mov|m4v)$/i;
const PDF_EXT_RE = /\.pdf$/i;
const EXCLUDED_DIRS = new Set(['.git', '.diamondmd', '.obsidian', '.diamond-publish', 'node_modules']);

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

function nextAvailableAttachmentPath(vault: Vault, filename: string): { rel: string; abs: string } {
	for (let index = 1; index <= 999; index += 1) {
		const rel = normalizeVaultPath(`${DEFAULT_ATTACHMENT_FOLDER}/${candidateFilename(filename, index)}`);
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
	const rel = normalizeVaultPath(inputPath);
	if (!attachmentKind(rel)) throw new Error('path is not an attachment');
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
