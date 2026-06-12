import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURE_PATHS } from './setup-fixture';
import type { NoteDoc } from '../src/lib/types';
import { replaceEmbeds, type ParsedEmbed } from '../src/lib/server/wikilink';

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
		expect(collectEmbeds('![[roof.png|300]] ![[panel.png|320x180]] ![[bill.png|Utility bill]] ![[bad.png|0]]')).toEqual([
			{ raw: '![[roof.png|300]]', target: 'roof.png', alt: null, width: 300, height: null },
			{ raw: '![[panel.png|320x180]]', target: 'panel.png', alt: null, width: 320, height: 180 },
			{ raw: '![[bill.png|Utility bill]]', target: 'bill.png', alt: 'Utility bill', width: null, height: null },
			{ raw: '![[bad.png|0]]', target: 'bad.png', alt: '0', width: null, height: null }
		]);
	});

	test('renders sized image embeds in read mode and static publish output', async ({ request }) => {
		const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'sized-embed-vault');
		fs.rmSync(vaultDir, { recursive: true, force: true });
		fs.mkdirSync(vaultDir, { recursive: true });
		fs.writeFileSync(path.join(vaultDir, 'roof.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');
		fs.writeFileSync(
			path.join(vaultDir, 'Sized.md'),
			'---\ntitle: Sized\npublic: true\n---\n# Sized\n\n![[roof.svg|320x180]]\n\n![[roof.svg|Utility bill]]\n'
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
	});
});
