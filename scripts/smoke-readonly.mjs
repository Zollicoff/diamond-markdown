import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = '127.0.0.1';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bannerText = 'Read-only mode: browsing is enabled; changes are disabled.';

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickPort() {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.once('error', reject);
		server.listen(0, HOST, () => {
			const address = server.address();
			if (!address || typeof address === 'string') {
				server.close(() => reject(new Error('could not reserve a read-only smoke port')));
				return;
			}
			const port = address.port;
			server.close(() => resolve(port));
		});
	});
}

async function waitForHealth(baseUrl, deadlineMs = 15_000) {
	const deadline = Date.now() + deadlineMs;
	let lastError = null;

	while (Date.now() < deadline) {
		try {
			const response = await fetch(`${baseUrl}/api/health`);
			if (response.ok) return response;
		} catch (error) {
			lastError = error;
		}
		await sleep(150);
	}

	throw new Error(`read-only smoke server did not become healthy${lastError ? `: ${lastError.message}` : ''}`);
}

async function expectJson(url, predicate, label) {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
	const body = await response.json();
	if (!predicate(body)) {
		throw new Error(`${label} returned unexpected JSON: ${JSON.stringify(body)}`);
	}
	return body;
}

async function expectHtmlContains(url, text, label) {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
	const body = await response.text();
	if (!body.includes(text)) {
		throw new Error(`${label} did not include expected text: ${text}`);
	}
}

async function expectWriteBlocked(baseUrl) {
	const response = await fetch(`${baseUrl}/api/vaults/default/note`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ path: 'Blocked.md', content: 'nope' })
	});
	const body = await response.text();
	if (response.status !== 403) {
		throw new Error(`write request returned HTTP ${response.status}, expected 403: ${body}`);
	}
	if (!body.includes('read-only mode')) {
		throw new Error(`write block response did not mention read-only mode: ${body}`);
	}
}

function stopServer(child) {
	if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			child.kill('SIGKILL');
			resolve();
		}, 3_000);
		child.once('exit', () => {
			clearTimeout(timer);
			resolve();
		});
		child.kill('SIGTERM');
	});
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diamond-readonly-smoke-'));
const port = process.env.DIAMOND_READ_ONLY_SMOKE_PORT ?? String(await pickPort());
const baseUrl = `http://${HOST}:${port}`;
const serverOutput = [];
const server = spawn(process.execPath, ['build'], {
	cwd: repoRoot,
	env: {
		...process.env,
		DIAMOND_CONFIG_DIR: path.join(tmpDir, 'config'),
		DIAMOND_DEFAULT_VAULT_DIR: path.join(tmpDir, 'vault'),
		DIAMOND_BASIC_AUTH: '',
		DIAMOND_READ_ONLY: 'true',
		HOST,
		PORT: port
	},
	stdio: ['ignore', 'pipe', 'pipe']
});

for (const stream of [server.stdout, server.stderr]) {
	stream.setEncoding('utf8');
	stream.on('data', (chunk) => {
		serverOutput.push(chunk);
	});
}

try {
	await waitForHealth(baseUrl);
	await expectJson(
		`${baseUrl}/api/health`,
		(body) => body?.ok === true && body?.service === 'diamondmarkdown' && body?.readOnly === true,
		'health check'
	);
	await expectJson(
		`${baseUrl}/api/vaults`,
		(body) => Array.isArray(body?.vaults) && body?.activeVaultId === 'default' && body?.readOnly === true,
		'vault listing'
	);
	await expectWriteBlocked(baseUrl);
	await expectHtmlContains(`${baseUrl}/`, bannerText, 'home page');
	await expectHtmlContains(`${baseUrl}/vault/default`, bannerText, 'vault page');
	console.log('Read-only smoke passed.');
} catch (error) {
	console.error(serverOutput.join('').trim());
	throw error;
} finally {
	await stopServer(server);
	fs.rmSync(tmpDir, { recursive: true, force: true });
}
