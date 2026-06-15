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
import {
	canvasMarkdownInlineSyntaxCandidate,
	canvasMarkdownLinkDestination,
	safeDecodeCanvasMarkdownUri
} from '../src/lib/canvas/markdown-destinations';
import {
	canvasTextInternalTarget,
	canvasTextMarkdownReference,
	canvasTextTargetRouteHref,
	splitCanvasWikilinkTarget
} from '../src/lib/canvas/text-preview-references';

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
	test('scans balanced Canvas Markdown destinations', () => {
		expect(
			canvasMarkdownInlineSyntaxCandidate(
				'Inline ![Roof south|90](../Images/roof (south).svg#diagram) stays',
				true
			)
		).toEqual({
			index: 7,
			raw: '![Roof south|90](../Images/roof (south).svg#diagram)',
			label: 'Roof south|90',
			href: '../Images/roof (south).svg#diagram'
		});

		const link = canvasMarkdownInlineSyntaxCandidate('Skip ![image](roof.svg), use [Note](Home.md#Plan)', false);
		expect(link).toMatchObject({
			raw: '[Note](Home.md#Plan)',
			label: 'Note',
			href: 'Home.md#Plan'
		});
		expect(link?.index).toBeGreaterThan(0);

		expect(canvasMarkdownLinkDestination('<../Images/roof photo.svg#diagram> "Roof"')).toBe(
			'../Images/roof photo.svg#diagram'
		);
		expect(canvasMarkdownLinkDestination('../Images/roof (south).svg#diagram')).toBe(
			'../Images/roof (south).svg#diagram'
		);
		expect(canvasMarkdownLinkDestination('<../Images/roof photo.svg#diagram> unquoted title')).toBeNull();
		expect(safeDecodeCanvasMarkdownUri('References/Roof%20Photos.md#Meter')).toBe('References/Roof Photos.md#Meter');
		expect(safeDecodeCanvasMarkdownUri('References/%E0%A4%A.md')).toBe('References/%E0%A4%A.md');
	});

	test('normalizes Canvas text-preview internal references', () => {
		expect(canvasTextMarkdownReference('../Images/roof%20photo.svg#diagram', 'Boards/Board.canvas')).toEqual({
			path: 'Images/roof photo.svg',
			suffix: '#diagram'
		});
		expect(canvasTextMarkdownReference('/Docs/panel.pdf?page=2', 'Boards/Board.canvas')).toEqual({
			path: 'Docs/panel.pdf',
			suffix: '?page=2'
		});
		expect(canvasTextMarkdownReference('../../secret.md', 'Boards/Board.canvas')).toBeNull();
		expect(canvasTextMarkdownReference('/../secret.md', 'Boards/Board.canvas')).toBeNull();
		expect(canvasTextMarkdownReference('https://example.com/file.md', 'Boards/Board.canvas')).toBeNull();
		expect(canvasTextMarkdownReference('#Local', 'Boards/Board.canvas')).toBeNull();

		expect(splitCanvasWikilinkTarget('References/Roof Photos.md#Meter')).toEqual({
			path: 'References/Roof Photos.md',
			suffix: '#Meter'
		});
		const note = canvasTextInternalTarget('note', 'References/Roof Photos.md', '#Meter', 'Roof');
		expect(note).toEqual({
			kind: 'note',
			path: 'References/Roof Photos.md',
			title: 'Roof',
			subpath: '#Meter',
			hash: 'meter'
		});
		expect(note ? canvasTextTargetRouteHref('vault id', note) : null).toBe(
			'/vault/vault%20id/note/References/Roof%20Photos.md#meter'
		);
		expect(canvasTextInternalTarget('canvas', 'Boards/Map.canvas', '#Nope', 'Map')).toBeNull();
	});

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

		const markdownLinks = canvasTextPreviewInlines(
			'Review [Launch markdown](Home.md#Launch Plan), [Canvas markdown](Boards/Map.canvas), [site](https://example.com), [panel](Docs/panel.pdf#page=2), and [unsafe](../secret.md)'
		);
		expect(markdownLinks).toEqual([
			{ kind: 'text', text: 'Review ' },
			{
				kind: 'link',
				text: 'Launch markdown',
				target: {
					kind: 'note',
					path: 'Home.md',
					title: 'Launch markdown',
					subpath: '#Launch Plan',
					hash: 'launch-plan'
				}
			},
			{ kind: 'text', text: ', ' },
			{
				kind: 'link',
				text: 'Canvas markdown',
				target: {
					kind: 'canvas',
					path: 'Boards/Map.canvas',
					title: 'Canvas markdown',
					subpath: null,
					hash: null
				}
			},
			{ kind: 'text', text: ', ' },
			{ kind: 'link', text: 'site', href: 'https://example.com' },
			{ kind: 'text', text: ', [panel](Docs/panel.pdf#page=2), and [unsafe](../secret.md)' }
		]);
		expect(canvasTextInlineTargetHref('vault id', markdownLinks[1])).toBe('/vault/vault%20id/note/Home.md#launch-plan');
		expect(canvasTextInlineTargetHref('vault id', markdownLinks[3])).toBe('/vault/vault%20id/canvas/Boards/Map.canvas');
		expect(canvasTextInlineTargetHref('vault id', markdownLinks[5])).toBeNull();

		const relativeMarkdownLinks = canvasTextPreviewInlines(
			'Review [Parent note](../Home.md#Launch Plan), [sibling Canvas](Map.canvas), [encoded](../References/Roof%20Photos.md#Meter), and [escaped](../../secret.md)',
			{ sourcePath: 'Boards/Board.canvas' }
		);
		expect(canvasTextInlineTargetHref('vault id', relativeMarkdownLinks[1])).toBe('/vault/vault%20id/note/Home.md#launch-plan');
		expect(canvasTextInlineTargetHref('vault id', relativeMarkdownLinks[3])).toBe('/vault/vault%20id/canvas/Boards/Map.canvas');
		expect(canvasTextInlineTargetHref('vault id', relativeMarkdownLinks[5])).toBe('/vault/vault%20id/note/References/Roof%20Photos.md#meter');
		expect(relativeMarkdownLinks.at(-1)).toEqual({ kind: 'text', text: ', and [escaped](../../secret.md)' });

		const vaultRootMarkdownLinks = canvasTextPreviewInlines(
			'Review [Root note](/References/Roof%20Photos.md#Meter), [Root Canvas](/Boards/Map.canvas), and [root escaped](/../secret.md)',
			{ sourcePath: 'Boards/Board.canvas' }
		);
		expect(canvasTextInlineTargetHref('vault id', vaultRootMarkdownLinks[1])).toBe('/vault/vault%20id/note/References/Roof%20Photos.md#meter');
		expect(canvasTextInlineTargetHref('vault id', vaultRootMarkdownLinks[3])).toBe('/vault/vault%20id/canvas/Boards/Map.canvas');
		expect(vaultRootMarkdownLinks.at(-1)).toEqual({ kind: 'text', text: ', and [root escaped](/../secret.md)' });

		const titledMarkdownLinks = canvasTextPreviewInlines(
			'Review [space note](<../References/Roof Photos.md#Meter> "Open meter") and [titled Canvas](Map.canvas "Open board")',
			{ sourcePath: 'Boards/Board.canvas' }
		);
		expect(canvasTextInlineTargetHref('vault id', titledMarkdownLinks[1])).toBe('/vault/vault%20id/note/References/Roof%20Photos.md#meter');
		expect(canvasTextInlineTargetHref('vault id', titledMarkdownLinks[3])).toBe('/vault/vault%20id/canvas/Boards/Map.canvas');

		const resolved = canvasTextPreviewInlines('Review [[Survey Photos#Meter|site photos]] and [[Launch Base]]', {
			resolveWikilinkTarget: canvasTextNoteWikilinkResolver(noteTargets)
		});
		expect(canvasTextInlineTargetHref('vault id', resolved[1])).toBe('/vault/vault%20id/note/References/Roof%20Photos.md#meter');
		expect(canvasTextInlineTargetHref('vault id', resolved[3])).toBe('/vault/vault%20id/note/Home.md');
	});

	test('parses safe inline Markdown image embeds', () => {
		const inline = canvasTextPreviewInlines(
			'Inline photo ![Roof inline|120x60](<../Images/roof photo.svg#diagram> "Roof") stays with text and ![unsafe](../../secret.svg)',
			{ sourcePath: 'Boards/Board.canvas' }
		);
		expect(inline).toEqual([
			{ kind: 'text', text: 'Inline photo ' },
			{
				kind: 'image',
				text: 'Roof inline',
				embed: {
					path: 'Images/roof photo.svg',
					suffix: '#diagram',
					kind: 'image',
					title: 'Roof inline',
					alt: 'Roof inline',
					width: 120,
					height: 60
				}
			},
			{ kind: 'text', text: ' stays with text and ![unsafe](../../secret.svg)' }
		]);
		expect(canvasTextEmbedHref('vault id', inline[1].embed!)).toBe('/api/vaults/vault%20id/raw/Images/roof%20photo.svg#diagram');

		const parenthesized = canvasTextPreviewInlines(
			'Inline photo ![Roof south|90](../Images/roof (south).svg#diagram) stays with text',
			{ sourcePath: 'Boards/Board.canvas' }
		);
		expect(parenthesized[1]).toEqual({
			kind: 'image',
			text: 'Roof south',
			embed: {
				path: 'Images/roof (south).svg',
				suffix: '#diagram',
				kind: 'image',
				title: 'Roof south',
				alt: 'Roof south',
				width: 90,
				height: null
			}
		});
		expect(canvasTextEmbedHref('vault id', parenthesized[1].embed!)).toBe('/api/vaults/vault%20id/raw/Images/roof%20(south).svg#diagram');

		const recovered = canvasTextPreviewInlines(
			'Unsafe first ![unsafe](../../secret.svg), safe second ![Roof south](../Images/roof (south).svg)',
			{ sourcePath: 'Boards/Board.canvas' }
		);
		expect(recovered[0]).toEqual({ kind: 'text', text: 'Unsafe first ![unsafe](../../secret.svg), safe second ' });
		expect(recovered[1]).toMatchObject({
			kind: 'image',
			text: 'Roof south',
			embed: { path: 'Images/roof (south).svg', kind: 'image' }
		});
	});

	test('parses Canvas text-card blocks without mutating markdown text', () => {
		const blocks = canvasTextPreviewBlocks([
			'# Launch plan',
			'#### Detail scope',
			'---',
			'',
			'- [x] Capture **utility bill**',
			'- [ ] Upload [[Roof Photos]]',
			'> Refer questions',
			'> [!WARNING]- Site survey',
			'> Capture ==main panel== photos',
			'| Step | Owner |',
			'| :--- | ---: |',
			'| Bill | [[Sandy]] |',
			'| Utility \\| meter | Main \\| exterior |',
			'```txt',
			'main panel',
			'```'
		].join('\n'));

		expect(blocks[0]).toMatchObject({ type: 'heading', level: 1 });
		expect(blocks[1]).toMatchObject({ type: 'heading', level: 4 });
		expect(blocks[2]).toEqual({ type: 'thematic-break' });
		expect(blocks[3]).toMatchObject({ type: 'unordered-list' });
		expect(blocks[4]).toMatchObject({ type: 'quote' });
		expect(blocks[5]).toMatchObject({ type: 'callout', kind: 'warning', fold: 'closed' });
		expect(blocks[6]).toMatchObject({
			type: 'table',
			table: {
				headers: [
					{ inline: [{ kind: 'text', text: 'Step' }], align: 'left' },
					{ inline: [{ kind: 'text', text: 'Owner' }], align: 'right' }
				],
				rows: [
					[
						{ inline: [{ kind: 'text', text: 'Bill' }], align: 'left' },
						{ inline: [{ kind: 'wikilink', text: 'Sandy' }], align: 'right' }
					],
					[
						{ inline: [{ kind: 'text', text: 'Utility | meter' }], align: 'left' },
						{ inline: [{ kind: 'text', text: 'Main | exterior' }], align: 'right' }
					]
				]
			}
		});
		expect(blocks[7]).toEqual({ type: 'code', language: 'txt', code: 'main panel' });
	});

	test('hides Obsidian comments in Canvas text previews outside code', () => {
		const blocks = canvasTextPreviewBlocks([
			'Visible %%hidden [[Secret]] #private%% note',
			'%%',
			'Hidden block [[Secret]]',
			'%%',
			'Code `%%kept-inline%%` stays',
			'```txt',
			'%% kept fence %%',
			'```'
		].join('\n'));
		const serialized = JSON.stringify(blocks);
		expect(serialized).not.toContain('hidden');
		expect(serialized).not.toContain('Hidden block');
		expect(serialized).not.toContain('Secret');
		expect(serialized).not.toContain('private');
		expect(blocks[0]).toMatchObject({
			type: 'paragraph',
			inline: [{ kind: 'text', text: 'Visible  note' }]
		});
		expect(blocks[1]).toMatchObject({
			type: 'paragraph',
			inline: [
				{ kind: 'text', text: 'Code ' },
				{ kind: 'code', text: '%%kept-inline%%' },
				{ kind: 'text', text: ' stays' }
			]
		});
		expect(blocks[2]).toEqual({ type: 'code', language: 'txt', code: '%% kept fence %%' });
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
		expect(canvasTextPreviewBlocks('![Relative roof](../Images/roof%20photo.svg#diagram)', {
			sourcePath: 'Boards/Board.canvas'
		})).toEqual([
			{
				type: 'embed',
				embed: {
					path: 'Images/roof photo.svg',
					suffix: '#diagram',
					kind: 'image',
					title: 'Relative roof',
					alt: 'Relative roof',
					width: null,
					height: null
				}
			}
		]);
		expect(canvasTextPreviewBlocks('![Root panel](/Docs/panel.pdf?page=2)', {
			sourcePath: 'Boards/Board.canvas'
		})).toEqual([
			{
				type: 'embed',
				embed: {
					path: 'Docs/panel.pdf',
					suffix: '?page=2',
					kind: 'pdf',
					title: 'Root panel',
					alt: 'Root panel',
					width: null,
					height: null
				}
			}
		]);
		expect(canvasTextPreviewBlocks('![Roof photo|320x180](<../Images/roof photo.svg#diagram> "Roof")', {
			sourcePath: 'Boards/Board.canvas'
		})).toEqual([
			{
				type: 'embed',
				embed: {
					path: 'Images/roof photo.svg',
					suffix: '#diagram',
					kind: 'image',
					title: 'Roof photo',
					alt: 'Roof photo',
					width: 320,
					height: 180
				}
			}
		]);
		expect(canvasTextPreviewBlocks('![Panel packet](../Docs/panel (final).pdf#page=2)', {
			sourcePath: 'Boards/Board.canvas'
		})).toEqual([
			{
				type: 'embed',
				embed: {
					path: 'Docs/panel (final).pdf',
					suffix: '#page=2',
					kind: 'pdf',
					title: 'Panel packet',
					alt: 'Panel packet',
					width: null,
					height: null
				}
			}
		]);
		expect(canvasTextEmbedHref('vault id', { path: 'Images/roof.svg', suffix: '#diagram', kind: 'image' })).toBe('/api/vaults/vault%20id/raw/Images/roof.svg#diagram');
		expect(canvasTextEmbedHref('vault id', { path: 'Images/roof photo.svg', suffix: '#diagram', kind: 'image' })).toBe('/api/vaults/vault%20id/raw/Images/roof%20photo.svg#diagram');
		expect(canvasTextEmbedHref('vault id', { path: 'Docs/panel (final).pdf', suffix: '#page=2', kind: 'pdf' })).toBe('/api/vaults/vault%20id/raw/Docs/panel%20(final).pdf#page=2');

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
		expect(canvasTextPreviewBlocks('![Escaped](../../secret.png)', {
			sourcePath: 'Boards/Board.canvas'
		})).toEqual([
			{ type: 'paragraph', inline: [{ kind: 'text', text: '![Escaped](../../secret.png)' }] }
		]);
		expect(canvasTextPreviewBlocks('![Root escaped](/../secret.png)', {
			sourcePath: 'Boards/Board.canvas'
		})).toEqual([
			{ type: 'paragraph', inline: [{ kind: 'text', text: '![Root escaped](/../secret.png)' }] }
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
