import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURE_PATHS } from './setup-fixture';
import type { NoteDoc } from '../src/lib/types';
import { replaceEmbeds, type ParsedEmbed } from '../src/lib/server/wikilink';
import { splitAssetReference } from '../src/lib/server/embed';

function collectEmbeds(markdown: string): ParsedEmbed[] {
	const embeds: ParsedEmbed[] = [];
	replaceEmbeds(markdown, (embed) => {
		embeds.push(embed);
		return '';
	});
	return embeds;
}

test.describe('Obsidian image embed variants', () => {
	test('parses image-size pipe metadata separately from alt text', () => {
		expect(collectEmbeds('![[roof.png|300]] ![[panel.png|320x180]] ![[bill.png|Utility bill]] ![[main.png|Main panel|300x200]] ![[bad.png|0]]')).toEqual([
			{ raw: '![[roof.png|300]]', target: 'roof.png', alt: null, width: 300, height: null },
			{ raw: '![[panel.png|320x180]]', target: 'panel.png', alt: null, width: 320, height: 180 },
			{ raw: '![[bill.png|Utility bill]]', target: 'bill.png', alt: 'Utility bill', width: null, height: null },
			{ raw: '![[main.png|Main panel|300x200]]', target: 'main.png', alt: 'Main panel', width: 300, height: 200 },
			{ raw: '![[bad.png|0]]', target: 'bad.png', alt: '0', width: null, height: null }
		]);
		expect(splitAssetReference('Files/packet.pdf#page=3')).toEqual({
			path: 'Files/packet.pdf',
			suffix: '#page=3'
		});
		expect(splitAssetReference('Files/clip.mp4?start=10#t=10')).toEqual({
			path: 'Files/clip.mp4',
			suffix: '?start=10#t=10'
		});
	});

	test('renders sized image embeds in read mode and static publish output', async ({ request }) => {
		const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'sized-embed-vault');
		fs.rmSync(vaultDir, { recursive: true, force: true });
		fs.mkdirSync(vaultDir, { recursive: true });
		fs.writeFileSync(path.join(vaultDir, 'roof.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');
		fs.writeFileSync(
			path.join(vaultDir, 'Sized.md'),
			'---\ntitle: Sized\npublic: true\n---\n# Sized\n\n![[roof.svg|320x180]]\n\n![[roof.svg|Utility bill]]\n\n![[roof.svg#diagram|Roof diagram]]\n'
		);

		const created = await request.post('/api/vaults', {
			data: { name: 'Sized Embed Vault', path: vaultDir }
		});
		expect(created.ok()).toBe(true);
		const { vault } = await created.json() as { vault: { id: string } };

		const loaded = await request.get(`/api/vaults/${vault.id}/note?path=${encodeURIComponent('Sized.md')}`);
		expect(loaded.ok()).toBe(true);
		const note = await loaded.json() as NoteDoc;
		expect(note.html).toContain('width="320"');
		expect(note.html).toContain('height="180"');
		expect(note.html).toContain('alt="roof.svg"');
		expect(note.html).toContain('alt="Utility bill"');
		expect(note.html).toContain(`/api/vaults/${vault.id}/raw/roof.svg#diagram`);
		expect(note.html).toContain('alt="Roof diagram"');

		const published = await request.post(`/api/vaults/${vault.id}/publish`);
		expect(published.ok()).toBe(true);
		const report = await published.json() as { outDir: string; imagesCopied: number; publicNotes: number };
		expect(report.publicNotes).toBe(1);
		expect(report.imagesCopied).toBe(1);

		const html = fs.readFileSync(path.join(report.outDir, 'sized.html'), 'utf-8');
		expect(html).toContain('width="320"');
		expect(html).toContain('height="180"');
		expect(html).toContain('alt="roof.svg"');
		expect(html).toContain('alt="Utility bill"');
		expect(html).toContain('src="images/roof.svg#diagram"');
		expect(html).toContain('alt="Roof diagram"');
	});

	test('renders non-image attachment embeds in read mode and static publish output', async ({ request }) => {
		const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'attachment-embed-vault');
		fs.rmSync(vaultDir, { recursive: true, force: true });
		fs.mkdirSync(path.join(vaultDir, 'Files'), { recursive: true });
		fs.writeFileSync(path.join(vaultDir, 'Files', 'voice.mp3'), 'audio');
		fs.writeFileSync(path.join(vaultDir, 'Files', 'clip.mp4'), 'video');
		fs.writeFileSync(path.join(vaultDir, 'Files', 'packet.pdf'), '%PDF-1.4');
		fs.writeFileSync(path.join(vaultDir, 'Files', 'bundle.zip'), 'zip');
		fs.writeFileSync(
			path.join(vaultDir, 'Attachments.md'),
			[
				'---',
				'title: Attachments',
				'public: true',
				'---',
				'# Attachments',
				'',
				'![[Files/voice.mp3|Voice memo]]',
				'',
				'![[Files/clip.mp4|320x180]]',
				'',
				'![[Files/packet.pdf#page=3|Site packet]]',
				'',
				'![[Files/bundle.zip|Download bundle]]'
			].join('\n')
		);

		const created = await request.post('/api/vaults', {
			data: { name: 'Attachment Embed Vault', path: vaultDir }
		});
		expect(created.ok()).toBe(true);
		const { vault } = await created.json() as { vault: { id: string } };

		const loaded = await request.get(`/api/vaults/${vault.id}/note?path=${encodeURIComponent('Attachments.md')}`);
		expect(loaded.ok()).toBe(true);
		const note = await loaded.json() as NoteDoc;
		expect(note.html).toContain('embed-audio');
		expect(note.html).toContain(`/api/vaults/${vault.id}/raw/Files/voice.mp3`);
		expect(note.html).toContain('Voice memo');
		expect(note.html).toContain('embed-video');
		expect(note.html).toContain('width="320"');
		expect(note.html).toContain('height="180"');
		expect(note.html).toContain('embed-pdf');
		expect(note.html).toContain(`/api/vaults/${vault.id}/raw/Files/packet.pdf#page=3`);
		expect(note.html).toContain('embed-file');
		expect(note.html).toContain('Download bundle');

		const published = await request.post(`/api/vaults/${vault.id}/publish`);
		expect(published.ok()).toBe(true);
		const report = await published.json() as { outDir: string; attachmentsCopied: number; publicNotes: number };
		expect(report.publicNotes).toBe(1);
		expect(report.attachmentsCopied).toBe(4);

		const html = fs.readFileSync(path.join(report.outDir, 'attachments.html'), 'utf-8');
		expect(html).toContain('assets/voice.mp3');
		expect(html).toContain('assets/clip.mp4');
		expect(html).toContain('assets/packet.pdf#page=3');
		expect(html).toContain('assets/bundle.zip');
		expect(fs.existsSync(path.join(report.outDir, 'assets', 'voice.mp3'))).toBe(true);
		expect(fs.existsSync(path.join(report.outDir, 'assets', 'clip.mp4'))).toBe(true);
		expect(fs.existsSync(path.join(report.outDir, 'assets', 'packet.pdf'))).toBe(true);
		expect(fs.existsSync(path.join(report.outDir, 'assets', 'bundle.zip'))).toBe(true);
	});

	test('renders source-relative Markdown image links in read mode and static publish output', async ({ request }) => {
		const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'markdown-image-vault');
		fs.rmSync(vaultDir, { recursive: true, force: true });
		fs.mkdirSync(path.join(vaultDir, 'Notes'), { recursive: true });
		fs.mkdirSync(path.join(vaultDir, 'Attachments'), { recursive: true });
		fs.writeFileSync(path.join(vaultDir, 'Attachments', 'panel.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');
		fs.writeFileSync(
			path.join(vaultDir, 'Notes', 'Markdown Images.md'),
			'---\ntitle: Markdown Images\npublic: true\n---\n# Markdown Images\n\n![Main panel|240x120](../Attachments/panel.svg "Panel photo")\n\n![180](https://example.com/remote.png)\n'
		);

		const created = await request.post('/api/vaults', {
			data: { name: 'Markdown Image Vault', path: vaultDir }
		});
		expect(created.ok()).toBe(true);
		const { vault } = await created.json() as { vault: { id: string } };

		const loaded = await request.get(`/api/vaults/${vault.id}/note?path=${encodeURIComponent('Notes/Markdown Images.md')}`);
		expect(loaded.ok()).toBe(true);
		const note = await loaded.json() as NoteDoc;
		expect(note.html).toContain(`/api/vaults/${vault.id}/raw/Attachments/panel.svg`);
		expect(note.html).toContain('alt="Main panel"');
		expect(note.html).toContain('width="240"');
		expect(note.html).toContain('height="120"');
		expect(note.html).toContain('title="Panel photo"');
		expect(note.html).toContain('src="https://example.com/remote.png"');
		expect(note.html).toContain('width="180"');

		const published = await request.post(`/api/vaults/${vault.id}/publish`);
		expect(published.ok()).toBe(true);
		const report = await published.json() as { outDir: string; imagesCopied: number; publicNotes: number };
		expect(report.publicNotes).toBe(1);
		expect(report.imagesCopied).toBe(1);

		const html = fs.readFileSync(path.join(report.outDir, 'notes-markdown-images.html'), 'utf-8');
		expect(html).toContain('src="images/panel.svg"');
		expect(html).toContain('alt="Main panel"');
		expect(html).toContain('width="240"');
		expect(html).toContain('height="120"');
		expect(html).toContain('title="Panel photo"');
		expect(html).toContain('src="https://example.com/remote.png"');
		expect(html).toContain('width="180"');
	});

});
