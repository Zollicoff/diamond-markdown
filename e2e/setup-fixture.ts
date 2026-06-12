/**
 * Pre-build the test fixture before Playwright spins up the webServer.
 * Copies the bundled sample-vault into DIAMOND_E2E_FIXTURE_ROOT or
 * e2e/.fixture-root/vault and
 * writes a config.json that registers it. This sidesteps relying on
 * the app's first-run bootstrap during test runs.
 */

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

function copyTree(src: string, dest: string): void {
	fs.mkdirSync(dest, { recursive: true });
	for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
		if (entry.name === '.git' || entry.name === '.diamond-publish') continue;
		const s = path.join(src, entry.name);
		const d = path.join(dest, entry.name);
		if (entry.isDirectory()) copyTree(s, d);
		else if (entry.isFile()) fs.copyFileSync(s, d);
	}
}

function initGitRepo(cwd: string): void {
	execFileSync('git', ['init'], { cwd, stdio: 'ignore' });
	execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd, stdio: 'ignore' });
	execFileSync('git', ['config', 'user.name', 'Diamond Test'], { cwd, stdio: 'ignore' });
	execFileSync('git', ['add', '.'], { cwd, stdio: 'ignore' });
	execFileSync('git', ['commit', '-m', 'init fixture'], { cwd, stdio: 'ignore' });
}

function sleep(ms: number): void {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function removeFixtureRoot(): void {
	if (!fs.existsSync(FIXTURE_ROOT)) return;
	let lastError: unknown;
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

export function buildFixture(): void {
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

export const FIXTURE_PATHS = { FIXTURE_ROOT, CONFIG_DIR, VAULT_DIR };

// The Playwright webServer uses setup-fixture.mjs so fixture cleanup happens
// exactly once before the preview server starts, not during worker retries.
if (import.meta.url === `file://${process.argv[1]}`) {
	buildFixture();
	console.log(`Fixture ready at ${FIXTURE_ROOT}`);
}
