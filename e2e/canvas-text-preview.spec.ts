import { expect, test } from '@playwright/test';
import {
	canvasTextEmbedHref,
	canvasTextEmbedOpenTarget,
	canvasTextEmbedRouteHref,
	canvasTextInlineTargetHref,
	canvasTextNoteEmbedResolver,
	canvasTextNoteWikilinkResolver,
	canvasTextPreviewBlocks,
	canvasTextPreviewInlines
} from '../src/lib/canvas/text-preview';

const noteTargets = [
	{ path: 'Home.md', title: 'Home', aliases: ['Launch Base'], stem: 'home' },
	{
		path: 'References/Roof Photos.md',
		title: 'Roof Photos',
		aliases: ['Survey Photos'],
		stem: 'roof photos'
	}
];

test.describe('canvas text preview helpers', () => {
	test('parses inline marks, explicit links, and resolved note aliases', () => {
		expect(canvasTextPreviewInlines('Use **bill** with *roof* ~~old plan~~ ==priority== `photo` [[Home|label]] [site](https://example.com)')).toEqual([
			{ kind: 'text', text: 'Use ' },
			{ kind: 'strong', text: 'bill' },
			{ kind: 'text', text: ' with ' },
			{ kind: 'emphasis', text: 'roof' },
			{ kind: 'text', text: ' ' },
			{ kind: 'strikethrough', text: 'old plan' },
			{ kind: 'text', text: ' ' },
			{ kind: 'highlight', text: 'priority' },
			{ kind: 'text', text: ' ' },
			{ kind: 'code', text: 'photo' },
			{ kind: 'text', text: ' ' },
			{ kind: 'wikilink', text: 'label' },
			{ kind: 'text', text: ' ' },
			{ kind: 'link', text: 'site', href: 'https://example.com' }
		]);

		const explicit = canvasTextPreviewInlines('Review [[Home.md#Install Steps|Launch link]] and [[Boards/Map.canvas|Map board]]');
		expect(canvasTextInlineTargetHref('vault id', explicit[1])).toBe('/vault/vault%20id/note/Home.md#install-steps');
		expect(canvasTextInlineTargetHref('vault id', explicit[3])).toBe('/vault/vault%20id/canvas/Boards/Map.canvas');

		const resolved = canvasTextPreviewInlines('Review [[Survey Photos#Meter|site photos]] and [[Launch Base]]', {
			resolveWikilinkTarget: canvasTextNoteWikilinkResolver(noteTargets)
		});
		expect(canvasTextInlineTargetHref('vault id', resolved[1])).toBe('/vault/vault%20id/note/References/Roof%20Photos.md#meter');
		expect(canvasTextInlineTargetHref('vault id', resolved[3])).toBe('/vault/vault%20id/note/Home.md');
	});

	test('parses Canvas text-card blocks without mutating markdown text', () => {
		const blocks = canvasTextPreviewBlocks([
			'# Launch plan',
			'',
			'- [x] Capture **utility bill**',
			'- [ ] Upload [[Roof Photos]]',
			'> Refer questions',
			'> [!WARNING]- Site survey',
			'> Capture ==main panel== photos',
			'| Step | Owner |',
			'| --- | --- |',
			'| Bill | [[Sandy]] |',
			'```txt',
			'main panel',
			'```'
		].join('\n'));

		expect(blocks[0]).toMatchObject({ type: 'heading', level: 1 });
		expect(blocks[1]).toMatchObject({ type: 'unordered-list' });
		expect(blocks[2]).toMatchObject({ type: 'quote' });
		expect(blocks[3]).toMatchObject({ type: 'callout', kind: 'warning', fold: 'closed' });
		expect(blocks[4]).toMatchObject({ type: 'table' });
		expect(blocks[5]).toEqual({ type: 'code', language: 'txt', code: 'main panel' });
	});

	test('parses safe asset, note, and Canvas embeds', () => {
		expect(canvasTextPreviewBlocks('![[Images/roof.svg#diagram|Roof photo|320x180]]')).toEqual([
			{
				type: 'embed',
				embed: {
					path: 'Images/roof.svg',
					suffix: '#diagram',
					kind: 'image',
					title: 'Roof photo',
					alt: 'Roof photo',
					width: 320,
					height: 180
				}
			}
		]);
		expect(canvasTextPreviewBlocks('![Panel packet](Docs/panel.pdf?page=2)')).toEqual([
			{
				type: 'embed',
				embed: {
					path: 'Docs/panel.pdf',
					suffix: '?page=2',
					kind: 'pdf',
					title: 'Panel packet',
					alt: 'Panel packet',
					width: null,
					height: null
				}
			}
		]);
		expect(canvasTextEmbedHref('vault id', { path: 'Images/roof.svg', suffix: '#diagram', kind: 'image' })).toBe('/api/vaults/vault%20id/raw/Images/roof.svg#diagram');

		const noteEmbed = canvasTextPreviewBlocks('![[Home.md#Install Steps|Launch note]]')[0];
		if (!noteEmbed || noteEmbed.type !== 'embed') throw new Error('expected note embed');
		expect(canvasTextEmbedOpenTarget(noteEmbed.embed)).toEqual({
			kind: 'note',
			path: 'Home.md',
			title: 'Launch note',
			subpath: '#Install Steps',
			hash: 'install-steps'
		});
		expect(canvasTextEmbedRouteHref('vault id', noteEmbed.embed)).toBe('/vault/vault%20id/note/Home.md#install-steps');

		const canvasEmbed = canvasTextPreviewBlocks('![[Boards/Map.canvas|Canvas map]]')[0];
		if (!canvasEmbed || canvasEmbed.type !== 'embed') throw new Error('expected Canvas embed');
		expect(canvasTextEmbedRouteHref('vault id', canvasEmbed.embed)).toBe('/vault/vault%20id/canvas/Boards/Map.canvas');
	});

	test('keeps unsafe or unresolved embeds literal', () => {
		expect(canvasTextPreviewBlocks('![[../secret.png]]')).toEqual([
			{ type: 'paragraph', inline: [{ kind: 'text', text: '![[../secret.png]]' }] }
		]);
		expect(canvasTextPreviewBlocks('![[Unknown Alias]]', {
			resolveEmbedTarget: canvasTextNoteEmbedResolver(noteTargets)
		})).toEqual([
			{ type: 'paragraph', inline: [{ kind: 'text', text: '![[Unknown Alias]]' }] }
		]);
		expect(canvasTextPreviewBlocks('![[Survey Photos#Meter|site photos]]', {
			resolveEmbedTarget: canvasTextNoteEmbedResolver(noteTargets)
		})[0]).toMatchObject({
			type: 'embed',
			embed: {
				path: 'References/Roof Photos.md',
				suffix: '#Meter',
				kind: 'note',
				title: 'site photos'
			}
		});
	});
});
