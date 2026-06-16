import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURE_PATHS } from './setup-fixture';

interface ZipEntry {
	name: string;
	data: Buffer;
}

function findEndOfCentralDirectory(zip: Buffer): number {
	const min = Math.max(0, zip.length - 0xffff - 22);
	for (let offset = zip.length - 22; offset >= min; offset -= 1) {
		if (zip.readUInt32LE(offset) === 0x06054b50) return offset;
	}
	throw new Error('ZIP end of central directory not found');
}

function readZipEntries(zip: Buffer): Map<string, ZipEntry> {
	const end = findEndOfCentralDirectory(zip);
	const count = zip.readUInt16LE(end + 10);
	let cursor = zip.readUInt32LE(end + 16);
	const entries = new Map<string, ZipEntry>();

	for (let index = 0; index < count; index += 1) {
		expect(zip.readUInt32LE(cursor)).toBe(0x02014b50);
		const method = zip.readUInt16LE(cursor + 10);
		const compressedSize = zip.readUInt32LE(cursor + 20);
		const uncompressedSize = zip.readUInt32LE(cursor + 24);
		const nameLength = zip.readUInt16LE(cursor + 28);
		const extraLength = zip.readUInt16LE(cursor + 30);
		const commentLength = zip.readUInt16LE(cursor + 32);
		const localOffset = zip.readUInt32LE(cursor + 42);
		const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf-8');

		expect(method).toBe(0);
		expect(compressedSize).toBe(uncompressedSize);
		expect(zip.readUInt32LE(localOffset)).toBe(0x04034b50);
		const localNameLength = zip.readUInt16LE(localOffset + 26);
		const localExtraLength = zip.readUInt16LE(localOffset + 28);
		const dataStart = localOffset + 30 + localNameLength + localExtraLength;
		const data = zip.subarray(dataStart, dataStart + uncompressedSize);
		entries.set(name, { name, data });

		cursor += 46 + nameLength + extraLength + commentLength;
	}

	return entries;
}

test('Obsidian export downloads vault files without Diamond or Git metadata', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'obsidian-export-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(path.join(vaultDir, '.obsidian', 'snippets'), { recursive: true });
	fs.mkdirSync(path.join(vaultDir, '.diamondmd'), { recursive: true });
	fs.mkdirSync(path.join(vaultDir, '.diamond-publish'), { recursive: true });
	fs.mkdirSync(path.join(vaultDir, '.git'), { recursive: true });
	fs.mkdirSync(path.join(vaultDir, 'Folder'), { recursive: true });
	fs.mkdirSync(path.join(vaultDir, 'Assets'), { recursive: true });

	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n\n[[Folder/Note]]\n');
	fs.writeFileSync(path.join(vaultDir, 'Folder', 'Note.md'), '# Note\n\nPortable note.\n');
	fs.writeFileSync(path.join(vaultDir, 'Board.canvas'), JSON.stringify({ nodes: [], edges: [] }, null, 2));
	fs.writeFileSync(path.join(vaultDir, 'Assets', 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'app.json'), JSON.stringify({ useMarkdownLinks: true }, null, 2));
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'snippets', 'theme.css'), 'body { color: red; }\n');
	fs.writeFileSync(path.join(vaultDir, '.diamondmd', 'bookmarks.json'), '[]\n');
	fs.writeFileSync(path.join(vaultDir, '.diamond-publish', 'index.html'), '<!doctype html>\n');
	fs.writeFileSync(path.join(vaultDir, '.git', 'config'), '[core]\n');
	fs.writeFileSync(path.join(vaultDir, '.DS_Store'), 'finder metadata');

	const created = await request.post('/api/vaults', {
		data: { name: 'Portable Obsidian Vault', path: vaultDir }
	});
	expect(created.ok(), created.ok() ? '' : await created.text()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	await page.goto(`/vault/${vault.id}`, { waitUntil: 'networkidle' });
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
	await page.getByLabel('Settings').click();
	await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
	const downloadZipLink = page.getByRole('link', { name: /Download ZIP/ });
	await expect(downloadZipLink).toHaveAttribute(
		'href',
		`/api/vaults/${vault.id}/export/obsidian`
	);

	const exported = await request.get(`/api/vaults/${vault.id}/export/obsidian`);
	expect(exported.ok(), exported.ok() ? '' : await exported.text()).toBe(true);
	expect(exported.headers()['content-type']).toContain('application/zip');
	expect(exported.headers()['content-disposition']).toContain('portable-obsidian-vault-obsidian-export.zip');
	expect(exported.headers()['x-diamond-export-file-count']).toBe('6');

	const entries = readZipEntries(await exported.body());
	expect([...entries.keys()].sort()).toEqual([
		'.obsidian/app.json',
		'.obsidian/snippets/theme.css',
		'Assets/image.png',
		'Board.canvas',
		'Folder/Note.md',
		'Home.md'
	]);
	expect(entries.get('Home.md')?.data.toString('utf-8')).toContain('[[Folder/Note]]');
	expect(entries.get('.obsidian/app.json')?.data.toString('utf-8')).toContain('useMarkdownLinks');
	expect(entries.has('.diamondmd/bookmarks.json')).toBe(false);
	expect(entries.has('.diamond-publish/index.html')).toBe(false);
	expect(entries.has('.git/config')).toBe(false);
	expect(entries.has('.DS_Store')).toBe(false);
});
