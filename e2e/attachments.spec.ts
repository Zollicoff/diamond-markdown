import { test, expect, type APIRequestContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURE_PATHS } from './setup-fixture';
import { attachmentEmbedMarkdown, filterAttachments, formatAttachmentSize } from '../src/lib/note/attachments';
import { preferredAttachmentFolder, sanitizeAttachmentFilename } from '../src/lib/server/attachment-service';
import type { AttachmentRef } from '../src/lib/types';

function git(cwd: string, args: string[]): string {
	return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

function rawPath(relPath: string): string {
	return relPath.split('/').map((part) => encodeURIComponent(part)).join('/');
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function testOrigin(): string {
	return `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? '4173'}`;
}

async function createRegisteredVault(
	request: APIRequestContext,
	slug: string,
	files: Record<string, string | Buffer>
): Promise<{ id: string; dir: string }> {
	const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, `${slug}-${suffix}`);
	fs.rmSync(vaultDir, { recursive: true, force: true });
	for (const [relPath, content] of Object.entries(files)) {
		const absPath = path.join(vaultDir, relPath);
		fs.mkdirSync(path.dirname(absPath), { recursive: true });
		fs.writeFileSync(absPath, content);
	}

	const created = await request.post('/api/vaults', {
		data: { name: `${slug}-${suffix}`, path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };
	return { id: vault.id, dir: vaultDir };
}

async function uploadAttachment(
	request: APIRequestContext,
	vaultId: string,
	name: string,
	mimeType: string,
	buffer: Buffer
): Promise<{ path: string }> {
	const uploaded = await request.post(`/api/vaults/${vaultId}/attachment`, {
		headers: { origin: testOrigin() },
		multipart: {
			file: { name, mimeType, buffer }
		}
	});
	expect(uploaded.ok()).toBe(true);
	return await uploaded.json() as { path: string };
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
		fs.mkdirSync(path.join(vaultDir, '.obsidian'), { recursive: true });
		fs.writeFileSync(path.join(vaultDir, '.obsidian', 'workspace.json'), '{}\n');
		fs.writeFileSync(path.join(vaultDir, 'Board.canvas'), '{"nodes":[],"edges":[]}\n');
		const listed = await request.get(`/api/vaults/${vault.id}/attachment`);
		expect(listed.ok()).toBe(true);
		const listBody = await listed.json() as { attachments: AttachmentRef[] };
		expect(listBody.attachments.map((attachment) => attachment.path)).toEqual(
			expect.arrayContaining(['Attachments/roof plan.png', 'Attachments/roof plan 2.png'])
		);
		expect(listBody.attachments.some((attachment) => attachment.path === 'Home.md')).toBe(false);
		expect(listBody.attachments.some((attachment) => attachment.path === 'Board.canvas')).toBe(false);
		expect(listBody.attachments.some((attachment) => attachment.path.includes('.obsidian'))).toBe(false);
		expect(listBody.attachments.find((attachment) => attachment.path === 'Attachments/roof plan.png')).toMatchObject({
			filename: 'roof plan.png',
			kind: 'image',
			size: 4
		});
		const deniedDelete = await request.delete(`/api/vaults/${vault.id}/attachment?path=${encodeURIComponent('Home.md')}`);
		expect(deniedDelete.status()).toBe(400);
		expect(await deniedDelete.text()).toContain('path is not an attachment');
		const removed = await request.delete(`/api/vaults/${vault.id}/attachment?path=${encodeURIComponent(secondBody.path)}`);
		expect(removed.ok()).toBe(true);
		const removeBody = await removed.json() as { path: string; sha: string | null };
		expect(removeBody.path).toBe(secondBody.path);
		expect(removeBody.sha).toMatch(/^[a-f0-9]{7,}$/);
		expect(fs.existsSync(path.join(vaultDir, secondBody.path))).toBe(false);
		const afterDelete = await request.get(`/api/vaults/${vault.id}/attachment`);
		const afterDeleteBody = await afterDelete.json() as { attachments: AttachmentRef[] };
		expect(afterDeleteBody.attachments.some((attachment) => attachment.path === secondBody.path)).toBe(false);
		expect(git(vaultDir, ['log', '--oneline', '--', 'Attachments'])).toContain('create: Attachments/roof plan.png');
	});

	test('keeps filename and embed helpers aligned with editor insertion', () => {
		expect(sanitizeAttachmentFilename('..\\.env')).toBe('env');
		expect(sanitizeAttachmentFilename('')).toBe('attachment');
		expect(sanitizeAttachmentFilename('Meeting: roof/photo.png')).toBe('photo.png');
		expect(attachmentEmbedMarkdown(['Attachments/roof.png', 'Attachments/site.pdf'])).toBe(
			'![[Attachments/roof.png]]\n![[Attachments/site.pdf]]'
		);
		expect(formatAttachmentSize(512)).toBe('512 B');
		expect(formatAttachmentSize(1536)).toBe('1.5 KB');
		const attachments = [
			{ path: 'Attachments/roof.png', filename: 'roof.png', size: 4, mtime: 1, kind: 'image' },
			{ path: 'Docs/site.pdf', filename: 'site.pdf', size: 10, mtime: 2, kind: 'pdf' }
		] satisfies AttachmentRef[];
		expect(filterAttachments(attachments, 'pdf').map((attachment) => attachment.path)).toEqual(['Docs/site.pdf']);
		expect(filterAttachments(attachments, 'roof').map((attachment) => attachment.path)).toEqual(['Attachments/roof.png']);
	});

	test('uses safe Obsidian attachment folder config for new uploads', async ({ request }) => {
		const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'obsidian-attachment-folder-vault');
		fs.rmSync(vaultDir, { recursive: true, force: true });
		fs.mkdirSync(path.join(vaultDir, '.obsidian'), { recursive: true });
		fs.writeFileSync(
			path.join(vaultDir, '.obsidian', 'app.json'),
			JSON.stringify({ attachmentFolderPath: 'Media/Uploads' }, null, 2)
		);
		fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n');
		expect(preferredAttachmentFolder({ id: 'test', name: 'Test', path: vaultDir })).toBe('Media/Uploads');

		const created = await request.post('/api/vaults', {
			data: { name: 'Obsidian Attachment Folder Vault', path: vaultDir }
		});
		expect(created.ok()).toBe(true);
		const { vault } = await created.json() as { vault: { id: string } };

		const uploaded = await request.post(`/api/vaults/${vault.id}/attachment`, {
			headers: { origin: testOrigin() },
			multipart: {
				file: {
					name: 'roof.png',
					mimeType: 'image/png',
					buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47])
				}
			}
		});
		expect(uploaded.ok()).toBe(true);
		const body = await uploaded.json() as { path: string; filename: string; sha: string | null };
		expect(body).toMatchObject({ path: 'Media/Uploads/roof.png', filename: 'roof.png' });
		expect(body.sha).toMatch(/^[a-f0-9]{7,}$/);
		expect(fs.existsSync(path.join(vaultDir, 'Media', 'Uploads', 'roof.png'))).toBe(true);

		fs.writeFileSync(
			path.join(vaultDir, '.obsidian', 'app.json'),
			JSON.stringify({ attachmentFolderPath: '../outside' }, null, 2)
		);
		expect(preferredAttachmentFolder({ id: 'test', name: 'Test', path: vaultDir })).toBe('Attachments');
	});

	test('renames attachments and rewrites markdown references in one commit', async ({ request }) => {
		const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'attachment-rename-api-vault');
		fs.rmSync(vaultDir, { recursive: true, force: true });
		fs.mkdirSync(path.join(vaultDir, 'Files'), { recursive: true });
		fs.mkdirSync(path.join(vaultDir, 'Notes'), { recursive: true });
		fs.writeFileSync(path.join(vaultDir, 'Files', 'packet.pdf'), '%PDF-1.4\n');
		fs.writeFileSync(
			path.join(vaultDir, 'Notes', 'Refs.md'),
			[
				'# Refs',
				'',
				'![[Files/packet.pdf#page=3|Site packet]]',
				'',
				'![Packet preview](../Files/packet.pdf#page=3 "Packet")'
			].join('\n')
		);

		const created = await request.post('/api/vaults', {
			data: { name: 'Attachment Rename API Vault', path: vaultDir }
		});
		expect(created.ok()).toBe(true);
		const { vault } = await created.json() as { vault: { id: string } };

		const renamed = await request.patch(`/api/vaults/${vault.id}/attachment`, {
			data: { from: 'Files/packet.pdf', to: 'Files/renamed packet.pdf' }
		});
		expect(renamed.ok()).toBe(true);
		const body = await renamed.json() as { from: string; to: string; linksUpdated: number; touched: string[]; sha: string | null };
		expect(body).toMatchObject({
			from: 'Files/packet.pdf',
			to: 'Files/renamed packet.pdf',
			linksUpdated: 2,
			touched: ['Notes/Refs.md']
		});
		expect(body.sha).toMatch(/^[a-f0-9]{7,}$/);
		expect(fs.existsSync(path.join(vaultDir, 'Files', 'packet.pdf'))).toBe(false);
		expect(fs.existsSync(path.join(vaultDir, 'Files', 'renamed packet.pdf'))).toBe(true);
		const note = fs.readFileSync(path.join(vaultDir, 'Notes', 'Refs.md'), 'utf-8');
		expect(note).toContain('![[Files/renamed packet.pdf#page=3|Site packet]]');
		expect(note).toContain('![Packet preview](<../Files/renamed packet.pdf#page=3> "Packet")');
		expect(git(vaultDir, ['status', '--short'])).toBe('');
		expect(git(vaultDir, ['log', '--oneline', '-1'])).toContain('rename: Files/packet.pdf → Files/renamed packet.pdf (+2 references updated)');
	});

	test('moves attachments into a folder and rewrites markdown references in one commit', async ({ request }) => {
		const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'attachment-move-api-vault');
		fs.rmSync(vaultDir, { recursive: true, force: true });
		fs.mkdirSync(path.join(vaultDir, 'Files', 'Site'), { recursive: true });
		fs.mkdirSync(path.join(vaultDir, 'Notes'), { recursive: true });
		fs.mkdirSync(path.join(vaultDir, 'Organized Assets'), { recursive: true });
		fs.writeFileSync(path.join(vaultDir, 'Files', 'Site', 'roof.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
		fs.writeFileSync(path.join(vaultDir, 'Files', 'Site', 'site spec.pdf'), '%PDF-1.4\n');
		fs.writeFileSync(path.join(vaultDir, 'Organized Assets', 'roof.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x99]));
		fs.writeFileSync(
			path.join(vaultDir, 'Notes', 'Refs.md'),
			[
				'# Refs',
				'',
				'![[Files/Site/roof.png|Roof]]',
				'',
				'![Spec](<../Files/Site/site spec.pdf#page=2> "Spec")'
			].join('\n')
		);

		const created = await request.post('/api/vaults', {
			data: { name: 'Attachment Move API Vault', path: vaultDir }
		});
		expect(created.ok()).toBe(true);
		const { vault } = await created.json() as { vault: { id: string } };

		const moved = await request.patch(`/api/vaults/${vault.id}/attachment`, {
			data: {
				paths: ['Files/Site/roof.png', 'Files/Site/site spec.pdf'],
				folder: 'Organized Assets'
			}
		});
		expect(moved.ok()).toBe(true);
		const body = await moved.json() as {
			folder: string;
			moved: { from: string; to: string }[];
			linksUpdated: number;
			touched: string[];
			sha: string | null;
		};
		expect(body).toMatchObject({
			folder: 'Organized Assets',
			moved: [
				{ from: 'Files/Site/roof.png', to: 'Organized Assets/roof 2.png' },
				{ from: 'Files/Site/site spec.pdf', to: 'Organized Assets/site spec.pdf' }
			],
			linksUpdated: 2,
			touched: ['Notes/Refs.md']
		});
		expect(body.sha).toMatch(/^[a-f0-9]{7,}$/);
		expect(fs.existsSync(path.join(vaultDir, 'Files', 'Site', 'roof.png'))).toBe(false);
		expect(fs.existsSync(path.join(vaultDir, 'Files', 'Site', 'site spec.pdf'))).toBe(false);
		expect(fs.existsSync(path.join(vaultDir, 'Organized Assets', 'roof.png'))).toBe(true);
		expect(fs.existsSync(path.join(vaultDir, 'Organized Assets', 'roof 2.png'))).toBe(true);
		expect(fs.existsSync(path.join(vaultDir, 'Organized Assets', 'site spec.pdf'))).toBe(true);
		const note = fs.readFileSync(path.join(vaultDir, 'Notes', 'Refs.md'), 'utf-8');
		expect(note).toContain('![[Organized Assets/roof 2.png|Roof]]');
		expect(note).toContain('![Spec](<../Organized Assets/site spec.pdf#page=2> "Spec")');
		expect(git(vaultDir, ['status', '--short'])).toBe('');
		expect(git(vaultDir, ['log', '--oneline', '-1'])).toContain('move: 2 attachments to Organized Assets (+2 references updated)');
	});

	test('picks an existing vault attachment from the editor toolbar and inserts an embed', async ({ page, request }) => {
		const notePath = 'Attachment Picker Test.md';
		const vault = await createRegisteredVault(request, 'attachment-picker-vault', {
			[notePath]: '# Attachment Picker Test\n\n'
		});
		await uploadAttachment(request, vault.id, 'picker packet.pdf', 'application/pdf', Buffer.from('%PDF-1.4\n'));
		const listed = await request.get(`/api/vaults/${vault.id}/attachment`);
		const listBody = await listed.json() as { attachments: AttachmentRef[] };
		expect(listBody.attachments.map((attachment) => attachment.path)).toContain('Attachments/picker packet.pdf');

		await page.goto(`/vault/${vault.id}/note/${encodeURIComponent(notePath)}`);
		await expect(page.locator('.cm-editor').first()).toBeVisible({ timeout: 10_000 });
		await page.getByRole('button', { name: 'Insert attachment' }).click();
		const dialog = page.getByRole('dialog', { name: 'Insert attachment' });
		await expect(dialog).toBeVisible();
		await dialog.getByLabel('Filter attachments').fill('picker packet');
		await dialog.getByRole('option', { name: /picker packet\.pdf/ }).click();
		await dialog.getByRole('button', { name: 'Insert embed' }).click();
		await expect(dialog).toBeHidden();
		await expect(page.locator('.cm-content').first()).toContainText('![[Attachments/picker packet.pdf]]');

		await page.keyboard.press('Meta+S');
		await expect.poll(async () => {
			const loaded = await request.get(`/api/vaults/${vault.id}/note?path=${encodeURIComponent(notePath)}`);
			const note = await loaded.json() as { content: string };
			return note.content;
		}).toContain('![[Attachments/picker packet.pdf]]');
		await expect.poll(() => git(vault.dir, ['status', '--short'])).toBe('');
	});

	test('selects multiple existing vault attachments and inserts embeds together', async ({ page, request }) => {
		const notePath = 'Attachment Bulk Picker Test.md';
		const vault = await createRegisteredVault(request, 'attachment-bulk-picker-vault', {
			[notePath]: '# Attachment Bulk Picker Test\n\n'
		});
		await uploadAttachment(request, vault.id, 'bulk sample roof.png', 'image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
		await uploadAttachment(request, vault.id, 'bulk sample spec.pdf', 'application/pdf', Buffer.from('%PDF-1.4\n'));
		const listed = await request.get(`/api/vaults/${vault.id}/attachment`);
		const listBody = await listed.json() as { attachments: AttachmentRef[] };
		expect(listBody.attachments.map((attachment) => attachment.path)).toEqual(
			expect.arrayContaining(['Attachments/bulk sample roof.png', 'Attachments/bulk sample spec.pdf'])
		);

		await page.goto(`/vault/${vault.id}/note/${encodeURIComponent(notePath)}`);
		await expect(page.locator('.cm-editor').first()).toBeVisible({ timeout: 10_000 });
		await page.getByRole('button', { name: 'Insert attachment' }).click();
		const dialog = page.getByRole('dialog', { name: 'Insert attachment' });
		await dialog.getByLabel('Filter attachments').fill('bulk sample');
		await expect(dialog.getByRole('option', { name: /bulk sample roof\.png/ })).toBeVisible();
		await expect(dialog.getByRole('option', { name: /bulk sample spec\.pdf/ })).toBeVisible();
		await expect(dialog.getByText('0 selected')).toBeVisible();
		await dialog.getByRole('button', { name: 'Select visible' }).click();
		await expect(dialog.getByText('2 selected')).toBeVisible();
		await dialog.getByRole('button', { name: 'Insert 2 embeds' }).click();
		await expect(dialog).toBeHidden();
		await expect(page.locator('.cm-content').first()).toContainText('bulk sample roof.png');
		await expect(page.locator('.cm-content').first()).toContainText('bulk sample spec.pdf');

		await page.keyboard.press('Meta+S');
		await expect.poll(async () => {
			const loaded = await request.get(`/api/vaults/${vault.id}/note?path=${encodeURIComponent(notePath)}`);
			const note = await loaded.json() as { content: string };
			return note.content;
		}).toContain('![[Attachments/bulk sample roof.png]]');
		await expect.poll(async () => {
			const loaded = await request.get(`/api/vaults/${vault.id}/note?path=${encodeURIComponent(notePath)}`);
			const note = await loaded.json() as { content: string };
			return note.content;
		}).toContain('![[Attachments/bulk sample spec.pdf]]');
		await expect.poll(() => git(vault.dir, ['status', '--short'])).toBe('');
	});

	test('deletes selected vault attachments from the picker with confirmation', async ({ page, request }) => {
		const notePath = 'Getting Started.md';
		const uploaded = await request.post('/api/vaults/default/attachment', {
			headers: { origin: testOrigin() },
			multipart: {
				file: {
					name: 'delete sample.pdf',
					mimeType: 'application/pdf',
					buffer: Buffer.from('%PDF-1.4\n')
				}
			}
		});
		expect(uploaded.ok()).toBe(true);
		const uploadedBody = await uploaded.json() as { path: string };

		await page.goto(`/vault/default/note/${encodeURIComponent(notePath)}`);
		await expect(page.locator('.cm-editor').first()).toBeVisible({ timeout: 10_000 });
		await page.getByRole('button', { name: 'Insert attachment' }).click();
		const dialog = page.getByRole('dialog', { name: 'Insert attachment' });
		await dialog.getByLabel('Filter attachments').fill('delete sample');
		await dialog.getByRole('option', { name: /delete sample\.pdf/ }).click();
		await expect(dialog.getByText('1 selected')).toBeVisible();
		await dialog.getByRole('button', { name: 'Delete selected' }).click();
		const confirm = page.getByRole('alertdialog', { name: 'Delete attachment' });
		await expect(confirm).toContainText('Existing notes that embed it will keep the now-missing reference.');
		await confirm.getByRole('button', { name: 'Delete attachment' }).click();

		await expect(dialog.getByRole('option', { name: /delete sample\.pdf/ })).toHaveCount(0);
		await expect(dialog.getByText('0 selected')).toBeVisible();
		await expect(page.getByText('Attachment deleted')).toBeVisible();
		await expect.poll(() => fs.existsSync(path.join(FIXTURE_PATHS.VAULT_DIR, uploadedBody.path))).toBe(false);
		await expect.poll(() => git(FIXTURE_PATHS.VAULT_DIR, ['status', '--short'])).toBe('');
	});

	test('renames a selected vault attachment from the picker', async ({ page, request }) => {
		const uploaded = await request.post('/api/vaults/default/attachment', {
			headers: { origin: testOrigin() },
			multipart: {
				file: {
					name: 'rename sample.pdf',
					mimeType: 'application/pdf',
					buffer: Buffer.from('%PDF-1.4\n')
				}
			}
		});
		expect(uploaded.ok()).toBe(true);
		const uploadedBody = await uploaded.json() as { path: string };

		await page.goto(`/vault/default/note/${encodeURIComponent('Getting Started.md')}`);
		await expect(page.locator('.cm-editor').first()).toBeVisible({ timeout: 10_000 });
		await page.getByRole('button', { name: 'Insert attachment' }).click();
		const dialog = page.getByRole('dialog', { name: 'Insert attachment' });
		await dialog.getByLabel('Filter attachments').fill('rename sample');
		await dialog.getByRole('option', { name: /rename sample\.pdf/ }).click();
		await dialog.getByRole('button', { name: 'Rename' }).click();
		const prompt = page.getByRole('dialog', { name: 'Rename attachment' });
		await prompt.getByLabel('Vault path').fill('Attachments/renamed sample.pdf');
		await prompt.getByRole('button', { name: 'Rename' }).click();

		await expect(dialog.getByRole('option', { name: /rename sample\.pdf/ })).toHaveCount(0);
		await dialog.getByLabel('Filter attachments').fill('renamed sample');
		await expect(dialog.getByRole('option', { name: /renamed sample\.pdf/ })).toBeVisible();
		await expect(page.getByText('Attachment renamed')).toBeVisible();
		await expect.poll(() => fs.existsSync(path.join(FIXTURE_PATHS.VAULT_DIR, uploadedBody.path))).toBe(false);
		await expect.poll(() => fs.existsSync(path.join(FIXTURE_PATHS.VAULT_DIR, 'Attachments', 'renamed sample.pdf'))).toBe(true);
		await expect.poll(() => git(FIXTURE_PATHS.VAULT_DIR, ['status', '--short'])).toBe('');
	});

	test('moves selected vault attachments from the picker', async ({ page, request }, testInfo) => {
		const slug = `organize-move-${testInfo.workerIndex}-${Date.now()}`;
		const folder = `Organized Move ${testInfo.workerIndex} ${Date.now()}`;
		const roofName = `${slug}-roof.png`;
		const specName = `${slug}-spec.pdf`;
		const roof = await request.post('/api/vaults/default/attachment', {
			headers: { origin: testOrigin() },
			multipart: {
				file: {
					name: roofName,
					mimeType: 'image/png',
					buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47])
				}
			}
		});
		expect(roof.ok()).toBe(true);
		const roofBody = await roof.json() as { path: string };
		const spec = await request.post('/api/vaults/default/attachment', {
			headers: { origin: testOrigin() },
			multipart: {
				file: {
					name: specName,
					mimeType: 'application/pdf',
					buffer: Buffer.from('%PDF-1.4\n')
				}
			}
		});
		expect(spec.ok()).toBe(true);
		const specBody = await spec.json() as { path: string };

		await page.goto(`/vault/default/note/${encodeURIComponent('Getting Started.md')}`);
		await expect(page.locator('.cm-editor').first()).toBeVisible({ timeout: 10_000 });
		await page.getByRole('button', { name: 'Insert attachment' }).click();
		const dialog = page.getByRole('dialog', { name: 'Insert attachment' });
		await dialog.getByLabel('Filter attachments').fill(slug);
		await expect(dialog.getByRole('option', { name: new RegExp(escapeRegExp(roofName)) })).toBeVisible();
		await expect(dialog.getByRole('option', { name: new RegExp(escapeRegExp(specName)) })).toBeVisible();
		await dialog.getByRole('button', { name: 'Select visible' }).click();
		await expect(dialog.getByText('2 selected')).toBeVisible();
		await dialog.getByRole('button', { name: 'Move' }).click();
		const prompt = page.getByRole('dialog', { name: 'Move 2 attachments' });
		await prompt.getByLabel('Destination folder').fill(folder);
		await prompt.getByRole('button', { name: 'Move' }).click();

		await expect(page.getByText('2 attachments moved')).toBeVisible();
		await expect(dialog.getByText(`${folder}/${roofName}`)).toBeVisible();
		await expect(dialog.getByText(`${folder}/${specName}`)).toBeVisible();
		await expect(dialog.getByText('2 selected')).toBeVisible();
		await expect.poll(() => fs.existsSync(path.join(FIXTURE_PATHS.VAULT_DIR, roofBody.path))).toBe(false);
		await expect.poll(() => fs.existsSync(path.join(FIXTURE_PATHS.VAULT_DIR, specBody.path))).toBe(false);
		await expect.poll(() => fs.existsSync(path.join(FIXTURE_PATHS.VAULT_DIR, folder, roofName))).toBe(true);
		await expect.poll(() => fs.existsSync(path.join(FIXTURE_PATHS.VAULT_DIR, folder, specName))).toBe(true);
		await expect.poll(() => git(FIXTURE_PATHS.VAULT_DIR, ['status', '--short'])).toBe('');
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
