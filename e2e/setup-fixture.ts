/**
 * Pre-build the test fixture before Playwright spins up the webServer.
 * Copies the bundled sample-vault into e2e/.fixture-root/vault and
 * writes a config.json that registers it. This sidesteps relying on
 * the app's first-run bootstrap during test runs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const FIXTURE_ROOT = path.join(HERE, '.fixture-root');
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

export function buildFixture(): void {
	if (fs.existsSync(FIXTURE_ROOT)) fs.rmSync(FIXTURE_ROOT, { recursive: true, force: true });
	fs.mkdirSync(CONFIG_DIR, { recursive: true });
	copyTree(SAMPLE, VAULT_DIR);
	const config = {
		vaults: [{ id: 'default', name: 'Test Vault', path: VAULT_DIR, excludedFolders: [] }],
		activeVaultId: 'default'
	};
	fs.writeFileSync(path.join(CONFIG_DIR, 'config.json'), JSON.stringify(config, null, 2));
}

export const FIXTURE_PATHS = { FIXTURE_ROOT, CONFIG_DIR, VAULT_DIR };

// Run when invoked directly: `node --import tsx e2e/setup-fixture.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
	buildFixture();
	console.log(`Fixture ready at ${FIXTURE_ROOT}`);
}
