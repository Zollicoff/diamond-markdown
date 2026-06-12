import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURE_PATHS } from './setup-fixture';
import { attachmentEmbedMarkdown } from '../src/lib/note/attachments';
import { sanitizeAttachmentFilename } from '../src/lib/server/attachment-service';

function git(cwd: string, args: string[]): string {
	return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

function rawPath(relPath: string): string {
	return relPath.split('/').map((part) => encodeURIComponent(part)).join('/');
}

function testOrigin(): string {
	return `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? '4173'}`;
}

test.describe('attachment uploads', () => {
	test('writes safe unique vault attachments and serves the raw files', async ({ request }) => {
		const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'attachment-api-vault');
		fs.rmSync(vaultDir, { recursive: true, force: true });
		fs.mkdirSync(vaultDir, { recursive: true });
		fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n');

		const created = await request.post('/api/vaults', {
			data: { name: 'Attachment API Vault', path: vaultDir }
		});
		expect(created.ok()).toBe(true);
		const { vault } = await created.json() as { vault: { id: string } };

		const first = await request.post(`/api/vaults/${vault.id}/attachment`, {
			headers: { origin: testOrigin() },
			multipart: {
				file: {
					name: '../roof plan.png',
					mimeType: 'image/png',
					buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47])
				}
			}
		});
		expect(first.ok()).toBe(true);
		const firstBody = await first.json() as { path: string; filename: string; size: number; sha: string | null };
		expect(firstBody).toMatchObject({
			path: 'Attachments/roof plan.png',
			filename: 'roof plan.png',
			size: 4
		});
		expect(firstBody.sha).toMatch(/^[a-f0-9]{7,}$/);
		expect(fs.readFileSync(path.join(vaultDir, firstBody.path))).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));

		const second = await request.post(`/api/vaults/${vault.id}/attachment`, {
			headers: { origin: testOrigin() },
			multipart: {
				file: {
					name: 'roof plan.png',
					mimeType: 'image/png',
					buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x02])
				}
			}
		});
		expect(second.ok()).toBe(true);
		const secondBody = await second.json() as { path: string; filename: string; size: number; sha: string | null };
		expect(secondBody.path).toBe('Attachments/roof plan 2.png');
		expect(secondBody.size).toBe(5);

		const raw = await request.get(`/api/vaults/${vault.id}/raw/${rawPath(firstBody.path)}`);
		expect(raw.ok()).toBe(true);
		expect(raw.headers()['content-type']).toContain('image/png');
		expect(git(vaultDir, ['log', '--oneline', '--', 'Attachments'])).toContain('create: Attachments/roof plan.png');
	});

	test('keeps filename and embed helpers aligned with editor insertion', () => {
		expect(sanitizeAttachmentFilename('..\\.env')).toBe('env');
		expect(sanitizeAttachmentFilename('')).toBe('attachment');
		expect(sanitizeAttachmentFilename('Meeting: roof/photo.png')).toBe('photo.png');
		expect(attachmentEmbedMarkdown(['Attachments/roof.png', 'Attachments/site.pdf'])).toBe(
			'![[Attachments/roof.png]]\n![[Attachments/site.pdf]]'
		);
	});

	test('drops a local file into the editor and inserts an Obsidian embed', async ({ page, request }) => {
		const notePath = 'Attachment Drop Test.md';
		const attachmentPath = path.join(FIXTURE_PATHS.VAULT_DIR, 'Attachments', 'dropped diagram.svg');
		if (fs.existsSync(attachmentPath)) fs.rmSync(attachmentPath, { force: true });
		await request.post('/api/vaults/default/note', {
			data: { path: notePath, content: '# Attachment Drop Test\n\n', commitNow: false }
		});

		await page.goto(`/vault/default/note/${encodeURIComponent(notePath)}`);
		const editor = page.locator('.cm-editor').first();
		await expect(editor).toBeVisible({ timeout: 10_000 });

		await page.locator('.cm-content').first().evaluate((el) => {
			const dt = new DataTransfer();
			dt.items.add(new File(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], 'dropped diagram.svg', {
				type: 'image/svg+xml'
			}));
			el.dispatchEvent(new DragEvent('dragenter', {
				bubbles: true,
				cancelable: true,
				dataTransfer: dt
			}));
		});
		await expect(page.locator('.editor-drop-overlay')).toBeVisible();
		await page.locator('.cm-content').first().evaluate((el) => {
			const dt = new DataTransfer();
			dt.items.add(new File(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], 'dropped diagram.svg', {
				type: 'image/svg+xml'
			}));
			el.dispatchEvent(new DragEvent('drop', {
				bubbles: true,
				cancelable: true,
				dataTransfer: dt
			}));
		});
		await expect(page.locator('.editor-drop-overlay')).toBeHidden();

		await expect(page.locator('.cm-content').first()).toContainText('![[Attachments/dropped diagram.svg]]', { timeout: 10_000 });
		await expect.poll(() => fs.existsSync(attachmentPath)).toBe(true);
		await page.keyboard.press('Meta+S');
		await expect.poll(async () => {
			const loaded = await request.get(`/api/vaults/default/note?path=${encodeURIComponent(notePath)}`);
			const note = await loaded.json() as { content: string };
			return note.content;
		}).toContain('![[Attachments/dropped diagram.svg]]');
	});
});
