import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'node:fs';
import path from 'node:path';
import { getVault } from '$lib/server/vault';
import { resolveInVault } from '$lib/server/paths';

const MIME: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.svg': 'image/svg+xml',
	'.avif': 'image/avif',
	'.bmp': 'image/bmp',
	'.ico': 'image/x-icon',
	'.pdf': 'application/pdf',
	'.mp4': 'video/mp4',
	'.webm': 'video/webm',
	'.ogv': 'video/ogg',
	'.mov': 'video/quicktime',
	'.m4v': 'video/x-m4v',
	'.mp3': 'audio/mpeg',
	'.wav': 'audio/wav',
	'.ogg': 'audio/ogg',
	'.oga': 'audio/ogg',
	'.m4a': 'audio/mp4',
	'.flac': 'audio/flac',
	'.aac': 'audio/aac',
	'.opus': 'audio/opus',
	'.txt': 'text/plain; charset=utf-8',
	'.csv': 'text/csv; charset=utf-8',
	'.json': 'application/json',
	'.zip': 'application/zip'
};

export const GET: RequestHandler = async ({ params }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	const rel = params.path;
	if (!rel) throw error(400, 'path required');

	let abs: string;
	try {
		abs = resolveInVault(vault, rel);
	} catch (e) {
		throw error(400, (e as Error).message);
	}

	let stat: fs.Stats;
	try {
		stat = fs.statSync(abs);
	} catch {
		throw error(404, 'file not found');
	}
	if (!stat.isFile()) throw error(404, 'not a file');

	const ext = path.extname(abs).toLowerCase();
	const mime = MIME[ext] ?? 'application/octet-stream';

	const stream = fs.createReadStream(abs);
	return new Response(stream as unknown as ReadableStream, {
		status: 200,
		headers: {
			'content-type': mime,
			'content-length': String(stat.size),
			'cache-control': 'private, max-age=60',
			'x-content-type-options': 'nosniff',
			'content-security-policy': "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox"
		}
	});
};
