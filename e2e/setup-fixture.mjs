import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const FIXTURE_ROOT = path.join(HERE, '.fixture-root');
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

function buildFixture() {
	if (fs.existsSync(FIXTURE_ROOT)) fs.rmSync(FIXTURE_ROOT, { recursive: true, force: true });
	fs.mkdirSync(CONFIG_DIR, { recursive: true });
	copyTree(SAMPLE, VAULT_DIR);
	const config = {
		vaults: [{ id: 'default', name: 'Test Vault', path: VAULT_DIR, excludedFolders: [] }],
		activeVaultId: 'default'
	};
	fs.writeFileSync(path.join(CONFIG_DIR, 'config.json'), JSON.stringify(config, null, 2));
}

buildFixture();
console.log(`Fixture ready at ${FIXTURE_ROOT}`);
