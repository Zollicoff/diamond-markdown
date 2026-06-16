import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURE_PATHS } from './setup-fixture';
import type { NoteDoc } from '../src/lib/types';
import { aliasesOf, collectTags, splitFrontmatter } from '../src/lib/server/frontmatter';

test.describe('Obsidian frontmatter compatibility', () => {
	test('parses block-list tags and aliases without a full YAML dependency', () => {
		const { frontmatter } = splitFrontmatter([
			'---',
			'title: Block Lists',
			'tags:',
			'  - project/foo',
			'  - review',
			'aliases:',
			'  - Research Home',
			'  - "Field Note"',
			'public: true',
			'---',
			'# Block Lists'
		].join('\n'));

		expect(frontmatter).toMatchObject({
			title: 'Block Lists',
			tags: ['project/foo', 'review'],
			aliases: ['Research Home', 'Field Note'],
			public: true
		});
		expect(aliasesOf(frontmatter)).toEqual(['Research Home', 'Field Note']);
		expect(collectTags(frontmatter, ['inline'])).toEqual(['inline', 'project/foo', 'review']);
	});

	test('indexes Obsidian block-list tags and resolves wikilinks through block-list aliases', async ({ request }) => {
		const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'frontmatter-block-list-vault');
		fs.rmSync(vaultDir, { recursive: true, force: true });
		fs.mkdirSync(vaultDir, { recursive: true });
		fs.writeFileSync(
			path.join(vaultDir, 'Home.md'),
			[
				'---',
				'title: Project Home',
				'tags:',
				'  - project/foo',
				'  - review',
				'aliases:',
				'  - Research Home',
				'  - "Field Note"',
				'public: true',
				'---',
				'# Project Home',
				'',
				'Body tag #inline.'
			].join('\n')
		);
		fs.writeFileSync(path.join(vaultDir, 'Linker.md'), '# Linker\n\nSee [[Research Home]] and [[Field Note]].\n');

		const created = await request.post('/api/vaults', {
			data: { name: 'Frontmatter Block List Vault', path: vaultDir }
		});
		expect(created.ok()).toBe(true);
		const { vault } = await created.json() as { vault: { id: string } };

		const loaded = await request.get(`/api/vaults/${vault.id}/note?path=${encodeURIComponent('Home.md')}`);
		expect(loaded.ok()).toBe(true);
		const home = await loaded.json() as NoteDoc;
		expect(home.frontmatter.tags).toEqual(['project/foo', 'review']);
		expect(home.frontmatter.aliases).toEqual(['Research Home', 'Field Note']);
		expect(home.tags).toEqual(['inline', 'project/foo', 'review']);

		const tags = await request.get(`/api/vaults/${vault.id}/tags`);
		expect(tags.ok()).toBe(true);
		const tagBody = await tags.json() as { tags: { tag: string; count: number }[] };
		expect(tagBody.tags).toEqual(expect.arrayContaining([
			{ tag: 'project/foo', count: 1 },
			{ tag: 'review', count: 1 },
			{ tag: 'inline', count: 1 }
		]));

		const linker = await request.get(`/api/vaults/${vault.id}/note?path=${encodeURIComponent('Linker.md')}`);
		expect(linker.ok()).toBe(true);
		const linked = await linker.json() as NoteDoc;
		expect(linked.outgoingLinks).toEqual([
			{ target: 'Research Home', resolved: 'Home.md' },
			{ target: 'Field Note', resolved: 'Home.md' }
		]);
		expect(linked.html).toContain(`/vault/${vault.id}/note/Home.md`);
	});
});
