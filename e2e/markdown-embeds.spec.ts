import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURE_PATHS } from './setup-fixture';
import type { NoteDoc } from '../src/lib/types';
import { parseWikilinks, replaceEmbeds, wikilinkFragment, type ParsedEmbed } from '../src/lib/server/wikilink';
import { resolveMarkdownImageReference, splitAssetReference } from '../src/lib/server/embed';
import { resolveMarkdownNoteReference } from '../src/lib/server/markdown-links';
import { parseObsidianCallout } from '../src/lib/server/callouts';

function collectEmbeds(markdown: string): ParsedEmbed[] {
	const embeds: ParsedEmbed[] = [];
	replaceEmbeds(markdown, (embed) => {
		embeds.push(embed);
		return '';
	});
	return embeds;
}

test.describe('Obsidian image embed variants', () => {
	test('parses Obsidian callout markers with fold metadata', () => {
		expect(parseObsidianCallout('[!WARNING]- Check this\nHidden details')).toEqual({
			type: 'warning',
			title: 'Check this',
			body: 'Hidden details',
			fold: 'closed'
		});
		expect(parseObsidianCallout('[!TIP]+\nOpen details')).toEqual({
			type: 'tip',
			title: 'Tip',
			body: 'Open details',
			fold: 'open'
		});
		expect(parseObsidianCallout('[!faq] Common question')).toMatchObject({
			type: 'question',
			title: 'Common question',
			fold: null
		});
		expect(parseObsidianCallout('Just a normal blockquote')).toBeNull();
	});

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

	test('renders Obsidian callouts in read mode and static publish output', async ({ request }) => {
		const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'callout-vault');
		fs.rmSync(vaultDir, { recursive: true, force: true });
		fs.mkdirSync(vaultDir, { recursive: true });
		fs.writeFileSync(path.join(vaultDir, 'Target.md'), '---\ntitle: Target\npublic: true\n---\n# Target\n');
		fs.writeFileSync(
			path.join(vaultDir, 'Callouts.md'),
			[
				'---',
				'title: Callouts',
				'public: true',
				'---',
				'# Callouts',
				'',
				'> [!NOTE] Research note',
				'> Body with **bold** text, [[Target]], and #risk.',
				'>',
				'> - First item',
				'',
				'> [!WARNING]- Closed warning',
				'> Hidden by default.',
				'',
				'> [!TIP]+ Open tip',
				'> Visible by default.',
				'',
				'```md',
				'> [!NOTE] Not a callout in code',
				'```'
			].join('\n')
		);

		const created = await request.post('/api/vaults', {
			data: { name: 'Callout Vault', path: vaultDir }
		});
		expect(created.ok()).toBe(true);
		const { vault } = await created.json() as { vault: { id: string } };

		const loaded = await request.get(`/api/vaults/${vault.id}/note?path=${encodeURIComponent('Callouts.md')}`);
		expect(loaded.ok()).toBe(true);
		const note = await loaded.json() as NoteDoc;
		expect(note.html).toContain('class="callout callout-note"');
		expect(note.html).toContain('Research note');
		expect(note.html).toContain('<strong>bold</strong>');
		expect(note.html).toContain(`/vault/${vault.id}/note/Target.md`);
		expect(note.html).toContain(`/vault/${vault.id}/tag/risk`);
		expect(note.html).toContain('<details class="callout callout-warning callout-foldable">');
		expect(note.html).toContain('<details class="callout callout-tip callout-foldable" open="">');
		expect(note.html).toContain('&gt; [!NOTE] Not a callout in code');

		const published = await request.post(`/api/vaults/${vault.id}/publish`);
		expect(published.ok()).toBe(true);
		const report = await published.json() as { outDir: string; publicNotes: number };
		expect(report.publicNotes).toBe(2);

		const html = fs.readFileSync(path.join(report.outDir, 'callouts.html'), 'utf-8');
		expect(html).toContain('class="callout callout-note"');
		expect(html).toContain('Research note');
		expect(html).toContain('<strong>bold</strong>');
		expect(html).toContain('href="target.html"');
		expect(html).toContain('<span class="tag">#risk</span>');
		expect(html).toContain('<details class="callout callout-warning callout-foldable">');
		expect(html).toContain('<details class="callout callout-tip callout-foldable" open="">');
		expect(html).toContain('&gt; [!NOTE] Not a callout in code');
		const styles = fs.readFileSync(path.join(report.outDir, 'styles.css'), 'utf-8');
		expect(styles).toContain('.note .callout');
	});

	test('hides Obsidian comments in read mode and static publish output', async ({ request }) => {
		const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'obsidian-comments-vault');
		fs.rmSync(vaultDir, { recursive: true, force: true });
		fs.mkdirSync(vaultDir, { recursive: true });
		fs.writeFileSync(
			path.join(vaultDir, 'Comments.md'),
			[
				'---',
				'title: Comments',
				'public: true',
				'---',
				'# Comments',
				'',
				'Visible text %%hidden inline [[Hidden]] #private $x$%% after.',
				'',
				'%%',
				'Hidden block [[Hidden]] #private',
				'%%',
				'',
				'Code `%%kept-inline%%` stays visible.',
				'',
				'```text',
				'%% kept fence %%',
				'```'
			].join('\n')
		);
		fs.writeFileSync(path.join(vaultDir, 'Hidden.md'), '# Hidden\n');

		const created = await request.post('/api/vaults', {
			data: { name: 'Obsidian Comments Vault', path: vaultDir }
		});
		expect(created.ok()).toBe(true);
		const { vault } = await created.json() as { vault: { id: string } };

		const loaded = await request.get(`/api/vaults/${vault.id}/note?path=${encodeURIComponent('Comments.md')}`);
		expect(loaded.ok()).toBe(true);
		const note = await loaded.json() as NoteDoc;
		expect(note.html).toContain('Visible text');
		expect(note.html).toContain('after.');
		expect(note.html).toContain('%%kept-inline%%');
		expect(note.html).toContain('%% kept fence %%');
		expect(note.html).not.toContain('hidden inline');
		expect(note.html).not.toContain('Hidden block');
		expect(note.html).not.toContain('private');
		expect(note.outgoingLinks.some((link) => link.target === 'Hidden')).toBe(false);
		expect(note.tags).not.toContain('private');

		const hiddenRes = await request.get(`/api/vaults/${vault.id}/note?path=${encodeURIComponent('Hidden.md')}`);
		expect(hiddenRes.ok()).toBe(true);
		const hidden = await hiddenRes.json() as NoteDoc;
		expect(hidden.backlinks.some((link) => link.path === 'Comments.md')).toBe(false);

		const hiddenSearch = await request.get(`/api/vaults/${vault.id}/search?q=${encodeURIComponent('hidden inline')}&full=1`);
		expect(hiddenSearch.ok()).toBe(true);
		expect((await hiddenSearch.json()) as { total: number }).toMatchObject({ total: 0 });

		const published = await request.post(`/api/vaults/${vault.id}/publish`);
		expect(published.ok()).toBe(true);
		const report = await published.json() as { outDir: string; publicNotes: number };
		expect(report.publicNotes).toBe(1);
		const html = fs.readFileSync(path.join(report.outDir, 'comments.html'), 'utf-8');
		expect(html).toContain('Visible text');
		expect(html).toContain('after.');
		expect(html).toContain('%%kept-inline%%');
		expect(html).toContain('%% kept fence %%');
		expect(html).not.toContain('hidden inline');
		expect(html).not.toContain('Hidden block');
		expect(html).not.toContain('private');
	});

	test('renders Obsidian highlights in read mode and static publish output', async ({ request }) => {
		const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'obsidian-highlight-vault');
		fs.rmSync(vaultDir, { recursive: true, force: true });
		fs.mkdirSync(vaultDir, { recursive: true });
		fs.writeFileSync(path.join(vaultDir, 'Target.md'), '---\ntitle: Target\npublic: true\n---\n# Target\n');
		fs.writeFileSync(
			path.join(vaultDir, 'Highlights.md'),
			[
				'---',
				'title: Highlights',
				'public: true',
				'---',
				'# Highlights',
				'',
				'Inline ==priority **now**== and ~~removed~~.',
				'',
				'Linked ==[[Target|target]] and #urgent== highlight.',
				'',
				'Code `==literal==` stays visible.',
				'',
				'```md',
				'==not highlighted in a fence==',
				'```'
			].join('\n')
		);

		const created = await request.post('/api/vaults', {
			data: { name: 'Obsidian Highlight Vault', path: vaultDir }
		});
		expect(created.ok()).toBe(true);
		const { vault } = await created.json() as { vault: { id: string } };

		const loaded = await request.get(`/api/vaults/${vault.id}/note?path=${encodeURIComponent('Highlights.md')}`);
		expect(loaded.ok()).toBe(true);
		const note = await loaded.json() as NoteDoc;
		expect(note.html).toContain('<mark>priority <strong>now</strong></mark>');
		expect(note.html).toContain('<del>removed</del>');
		expect(note.html).toContain(`<mark><a class="wikilink" href="/vault/${vault.id}/note/Target.md" data-target="Target.md">target</a> and <a class="tag" href="/vault/${vault.id}/tag/urgent">#urgent</a></mark>`);
		expect(note.html).toContain('<code>==literal==</code>');
		expect(note.html).toContain('==not highlighted in a fence==');

		const published = await request.post(`/api/vaults/${vault.id}/publish`);
		expect(published.ok()).toBe(true);
		const report = await published.json() as { outDir: string; publicNotes: number };
		expect(report.publicNotes).toBe(2);

		const html = fs.readFileSync(path.join(report.outDir, 'highlights.html'), 'utf-8');
		expect(html).toContain('<mark>priority <strong>now</strong></mark>');
		expect(html).toContain('<del>removed</del>');
		expect(html).toContain('<mark><a class="wikilink" href="target.html">target</a> and <span class="tag">#urgent</span></mark>');
		expect(html).toContain('<code>==literal==</code>');
		expect(html).toContain('==not highlighted in a fence==');
		const styles = fs.readFileSync(path.join(report.outDir, 'styles.css'), 'utf-8');
		expect(styles).toContain('.note mark');
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

	test('renders Obsidian block references in read mode and static publish output', async ({ request }) => {
		const parsed = parseWikilinks('Jump to [[Target#^install-steps|specific block]] and [[Target#Details]].');
		expect(parsed[0]).toMatchObject({
			target: 'Target',
			heading: null,
			blockId: 'install-steps',
			display: 'specific block'
		});
		expect(wikilinkFragment(parsed[0])).toBe('#^install-steps');
		expect(parsed[1]).toMatchObject({
			target: 'Target',
			heading: 'Details',
			blockId: null,
			display: null
		});
		expect(wikilinkFragment(parsed[1])).toBe('#details');

		const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'block-reference-vault');
		fs.rmSync(vaultDir, { recursive: true, force: true });
		fs.mkdirSync(vaultDir, { recursive: true });
		fs.writeFileSync(
			path.join(vaultDir, 'Target.md'),
			[
				'---',
				'title: Target',
				'public: true',
				'---',
				'# Target',
				'',
				'Important install paragraph ^install-steps',
				'',
				'## Details',
				'',
				'More target text.'
			].join('\n')
		);
		fs.writeFileSync(
			path.join(vaultDir, 'Source.md'),
			[
				'---',
				'title: Source',
				'public: true',
				'---',
				'# Source',
				'',
				'Jump to [[Target#^install-steps|specific block]] and [[Target#Details|details heading]].'
			].join('\n')
		);

		const created = await request.post('/api/vaults', {
			data: { name: 'Block Reference Vault', path: vaultDir }
		});
		expect(created.ok()).toBe(true);
		const { vault } = await created.json() as { vault: { id: string } };

		const sourceRes = await request.get(`/api/vaults/${vault.id}/note?path=${encodeURIComponent('Source.md')}`);
		expect(sourceRes.ok()).toBe(true);
		const source = await sourceRes.json() as NoteDoc;
		expect(source.outgoingLinks).toContainEqual({ target: 'Target', resolved: 'Target.md' });
		expect(source.html).toContain(`/vault/${vault.id}/note/Target.md#^install-steps`);
		expect(source.html).toContain(`/vault/${vault.id}/note/Target.md#details`);

		const targetRes = await request.get(`/api/vaults/${vault.id}/note?path=${encodeURIComponent('Target.md')}`);
		expect(targetRes.ok()).toBe(true);
		const target = await targetRes.json() as NoteDoc;
		expect(target.html).toContain('<p id="^install-steps">Important install paragraph</p>');
		expect(target.html).toContain('<h2 id="details">Details</h2>');

		const published = await request.post(`/api/vaults/${vault.id}/publish`);
		expect(published.ok()).toBe(true);
		const report = await published.json() as { outDir: string; publicNotes: number };
		expect(report.publicNotes).toBe(2);

		const sourceHtml = fs.readFileSync(path.join(report.outDir, 'source.html'), 'utf-8');
		expect(sourceHtml).toContain('href="target.html#^install-steps"');
		expect(sourceHtml).toContain('href="target.html#details"');

		const targetHtml = fs.readFileSync(path.join(report.outDir, 'target.html'), 'utf-8');
		expect(targetHtml).toContain('<p id="^install-steps">Important install paragraph</p>');
		expect(targetHtml).toContain('<h2 id="details">Details</h2>');
	});

	test('resolves Markdown note links for navigation, backlinks, and static publish', async ({ request }) => {
		expect(resolveMarkdownNoteReference('../Target.md#details', 'Notes/Source.md')).toEqual({
			target: 'Target.md',
			suffix: '#details'
		});

		const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'markdown-note-link-vault');
		fs.rmSync(vaultDir, { recursive: true, force: true });
		fs.mkdirSync(path.join(vaultDir, 'Notes'), { recursive: true });
		fs.writeFileSync(
			path.join(vaultDir, 'Target.md'),
			[
				'---',
				'title: Target',
				'public: true',
				'---',
				'# Target',
				'',
				'## Details',
				'',
				'Linked from Markdown syntax.'
			].join('\n')
		);
		fs.writeFileSync(
			path.join(vaultDir, 'Notes', 'Source.md'),
			[
				'---',
				'title: Source',
				'public: true',
				'---',
				'# Source',
				'',
				'Jump to [Target details](../Target.md#details) and keep [external](https://example.com) links external.',
				'',
				'```md',
				'[Target details](../Target.md#details)',
				'```'
			].join('\n')
		);

		const created = await request.post('/api/vaults', {
			data: { name: 'Markdown Note Link Vault', path: vaultDir }
		});
		expect(created.ok()).toBe(true);
		const { vault } = await created.json() as { vault: { id: string } };

		const sourceRes = await request.get(`/api/vaults/${vault.id}/note?path=${encodeURIComponent('Notes/Source.md')}`);
		expect(sourceRes.ok()).toBe(true);
		const source = await sourceRes.json() as NoteDoc;
		expect(source.outgoingLinks).toContainEqual({ target: 'Target.md', resolved: 'Target.md' });
		expect(source.html).toContain(`href="/vault/${vault.id}/note/Target.md#details"`);
		expect(source.html).toContain('href="https://example.com"');

		const targetRes = await request.get(`/api/vaults/${vault.id}/note?path=${encodeURIComponent('Target.md')}`);
		expect(targetRes.ok()).toBe(true);
		const target = await targetRes.json() as NoteDoc;
		expect(target.backlinks).toEqual([{ path: 'Notes/Source.md', title: 'Source' }]);

		const published = await request.post(`/api/vaults/${vault.id}/publish`);
		expect(published.ok()).toBe(true);
		const report = await published.json() as { outDir: string; publicNotes: number };
		expect(report.publicNotes).toBe(2);

		const sourceHtml = fs.readFileSync(path.join(report.outDir, 'notes-source.html'), 'utf-8');
		expect(sourceHtml).toContain('href="target.html#details"');
		expect(sourceHtml).toContain('href="https://example.com"');
	});

	test('renders source-relative Markdown image links in read mode and static publish output', async ({ request }) => {
		expect(resolveMarkdownImageReference('../Attachments/panel.svg?variant=thumb#detail', 'Notes/Markdown Images.md')).toEqual({
			path: 'Attachments/panel.svg',
			suffix: '?variant=thumb#detail'
		});

		const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'markdown-image-vault');
		fs.rmSync(vaultDir, { recursive: true, force: true });
		fs.mkdirSync(path.join(vaultDir, 'Notes'), { recursive: true });
		fs.mkdirSync(path.join(vaultDir, 'Attachments'), { recursive: true });
		fs.writeFileSync(path.join(vaultDir, 'Attachments', 'panel.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');
		fs.writeFileSync(
			path.join(vaultDir, 'Notes', 'Markdown Images.md'),
			'---\ntitle: Markdown Images\npublic: true\n---\n# Markdown Images\n\n![Main panel|240x120](../Attachments/panel.svg "Panel photo")\n\n![Panel detail](../Attachments/panel.svg?variant=thumb#detail)\n\n![180](https://example.com/remote.png)\n'
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
		expect(note.html).toContain(`/api/vaults/${vault.id}/raw/Attachments/panel.svg?variant=thumb#detail`);
		expect(note.html).toContain('alt="Main panel"');
		expect(note.html).toContain('alt="Panel detail"');
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
		expect(html).toContain('src="images/panel.svg?variant=thumb#detail"');
		expect(html).toContain('alt="Main panel"');
		expect(html).toContain('alt="Panel detail"');
		expect(html).toContain('width="240"');
		expect(html).toContain('height="120"');
		expect(html).toContain('title="Panel photo"');
		expect(html).toContain('src="https://example.com/remote.png"');
		expect(html).toContain('width="180"');
	});

});
