import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { commitChange } from './git';
import { normalizeVaultPath, resolveInVault } from './paths';
import type { Vault } from './vault';

export interface AttachmentUploadResult {
	ok: true;
	path: string;
	filename: string;
	size: number;
	sha: string | null;
}

const DEFAULT_ATTACHMENT_FOLDER = 'Attachments';
const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

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
