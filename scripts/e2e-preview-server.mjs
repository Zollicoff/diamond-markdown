import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { handler } from '../build/handler.js';

const host = process.env.HOST || '127.0.0.1';
const configuredPort = Number.parseInt(process.env.PORT || '4173', 10);
const port = Number.isFinite(configuredPort) ? configuredPort : 4173;
const clientRoot = path.resolve('build/client');

const ROOT_STATIC_FILES = new Set([
	'apple-touch-icon.png',
	'favicon.svg',
	'icon-192.png',
	'icon-512.png',
	'manifest.webmanifest',
	'robots.txt',
	'service-worker.js'
]);

const MIME = {
	'.css': 'text/css; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.webmanifest': 'application/manifest+json',
	'.txt': 'text/plain; charset=utf-8',
	'.json': 'application/json',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf'
};

function safeRelativePath(reqUrl) {
	try {
		const pathname = new URL(reqUrl, `http://${host}:${port}`).pathname;
		const decoded = decodeURIComponent(pathname).replace(/^\/+/, '');
		if (!decoded || decoded.includes('\0')) return null;
		const normalized = path.posix.normalize(decoded);
		if (normalized === '..' || normalized.startsWith('../')) return null;
		return normalized;
	} catch {
		return null;
	}
}

function sendStatic(req, res, rel) {
	if (!rel.startsWith('_app/') && !ROOT_STATIC_FILES.has(rel)) return false;

	const abs = path.resolve(clientRoot, rel);
	if (abs !== clientRoot && !abs.startsWith(clientRoot + path.sep)) {
		res.writeHead(400).end('bad static path');
		return true;
	}
	if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
		res.writeHead(404).end('static asset not found');
		return true;
	}

	const type = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
	const stat = fs.statSync(abs);
	res.writeHead(200, {
		'content-type': type,
		'content-length': String(stat.size),
		'cache-control': rel.startsWith('_app/immutable/')
			? 'public, max-age=31536000, immutable'
			: 'no-cache',
		'x-content-type-options': 'nosniff'
	});
	if (req.method === 'HEAD') {
		res.end();
		return true;
	}

	const stream = fs.createReadStream(abs);
	stream.on('error', () => {
		if (!res.headersSent) res.writeHead(404);
		res.end();
	});
	stream.pipe(res);
	return true;
}

const server = http.createServer((req, res) => {
	const rel = safeRelativePath(req.url || '/');
	if (rel && sendStatic(req, res, rel)) return;
	handler(req, res);
});

server.listen(port, host, () => {
	console.log(`Listening on http://${host}:${port}`);
});
