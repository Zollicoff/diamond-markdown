import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = '127.0.0.1';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const username = 'demo';
const password = 'secret';

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
				server.close(() => reject(new Error('could not reserve a basic-auth smoke port')));
				return;
			}
			const port = address.port;
			server.close(() => resolve(port));
		});
	});
}

function authHeader(user = username, pass = password) {
	return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
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

	throw new Error(`basic-auth smoke server did not become healthy${lastError ? `: ${lastError.message}` : ''}`);
}

async function expectStatus(url, expected, label, init = {}) {
	const response = await fetch(url, init);
	if (response.status !== expected) {
		const body = await response.text().catch(() => '');
		throw new Error(`${label} returned HTTP ${response.status}, expected ${expected}: ${body}`);
	}
	return response;
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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diamond-basic-auth-smoke-'));
const port = process.env.DIAMOND_BASIC_AUTH_SMOKE_PORT ?? String(await pickPort());
const baseUrl = `http://${HOST}:${port}`;
const serverOutput = [];
const server = spawn(process.execPath, ['build'], {
	cwd: repoRoot,
	env: {
		...process.env,
		DIAMOND_CONFIG_DIR: path.join(tmpDir, 'config'),
		DIAMOND_DEFAULT_VAULT_DIR: path.join(tmpDir, 'vault'),
		DIAMOND_BASIC_AUTH: `${username}:${password}`,
		DIAMOND_BASIC_AUTH_REALM: 'Diamond Smoke',
		DIAMOND_READ_ONLY: '',
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
	await expectStatus(`${baseUrl}/api/health`, 200, 'health without auth');
	const unauthenticated = await expectStatus(`${baseUrl}/`, 401, 'home without auth');
	const challenge = unauthenticated.headers.get('www-authenticate') ?? '';
	if (!challenge.includes('Basic realm="Diamond Smoke"')) {
		throw new Error(`unexpected auth challenge: ${challenge}`);
	}
	await expectStatus(`${baseUrl}/api/vaults`, 401, 'vaults without auth');
	await expectStatus(`${baseUrl}/api/vaults`, 401, 'vaults with wrong auth', {
		headers: { authorization: authHeader(username, 'wrong') }
	});
	await expectStatus(`${baseUrl}/`, 200, 'home with auth', {
		headers: { authorization: authHeader() }
	});
	await expectStatus(`${baseUrl}/api/vaults`, 200, 'vaults with auth', {
		headers: { authorization: authHeader() }
	});
	console.log('Basic Auth smoke passed.');
} catch (error) {
	console.error(serverOutput.join('').trim());
	throw error;
} finally {
	await stopServer(server);
	fs.rmSync(tmpDir, { recursive: true, force: true });
}
