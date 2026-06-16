import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const FIXTURE_ROOT = path.resolve(process.env.DIAMOND_E2E_FIXTURE_ROOT ?? path.join(HERE, '.fixture-root'));
const CONFIG_DIR = path.join(FIXTURE_ROOT, 'config');
const VAULT_DIR = path.join(FIXTURE_ROOT, 'vault');
const SAMPLE = path.join(REPO, 'sample-vault');

function copyTree(src, dest) {
	fs.mkdirSync(dest, { recursive: true });
	for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
		if (entry.name === '.git' || entry.name === '.diamond-publish') continue;
		const s = path.join(src, entry.name);
		const d = path.join(dest, entry.name);
		if (entry.isDirectory()) copyTree(s, d);
		else if (entry.isFile()) fs.copyFileSync(s, d);
	}
}

function initGitRepo(cwd) {
	execFileSync('git', ['init'], { cwd, stdio: 'ignore' });
	execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd, stdio: 'ignore' });
	execFileSync('git', ['config', 'user.name', 'Diamond Test'], { cwd, stdio: 'ignore' });
	execFileSync('git', ['add', '.'], { cwd, stdio: 'ignore' });
	execFileSync('git', ['commit', '-m', 'init fixture'], { cwd, stdio: 'ignore' });
}

function sleep(ms) {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function removeFixtureRoot() {
	if (!fs.existsSync(FIXTURE_ROOT)) return;
	let lastError;
	for (let attempt = 1; attempt <= 5; attempt += 1) {
		try {
			fs.rmSync(FIXTURE_ROOT, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
			return;
		} catch (error) {
			lastError = error;
			sleep(attempt * 100);
		}
	}
	throw lastError;
}

function buildFixture() {
	removeFixtureRoot();
	fs.mkdirSync(CONFIG_DIR, { recursive: true });
	copyTree(SAMPLE, VAULT_DIR);
	initGitRepo(VAULT_DIR);
	const config = {
		vaults: [{ id: 'default', name: 'Test Vault', path: VAULT_DIR, excludedFolders: [] }],
		activeVaultId: 'default'
	};
	fs.writeFileSync(path.join(CONFIG_DIR, 'config.json'), JSON.stringify(config, null, 2));
}

buildFixture();
console.log(`Fixture ready at ${FIXTURE_ROOT}`);
