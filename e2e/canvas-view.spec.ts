import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURE_PATHS } from './setup-fixture';
import type { CanvasDoc } from '../src/lib/types';
import { duplicateCanvasRawNode } from '../src/lib/server/canvas';
import { canvasNotePreviewBody } from '../src/lib/server/canvas-note-previews';
import {
	canvasNotePreviewForNode,
	canvasNotePreviewMap,
	canvasNotePreviewPaths
} from '../src/lib/canvas/note-previews';
import {
	CANVAS_COLOR_OPTIONS,
	CANVAS_EDGE_END_OPTIONS,
	CANVAS_EDGE_SIDE_OPTIONS,
	canvasBounds,
	canvasConnectionDraft,
	canvasDraftStateForDoc,
	canvasDraftChanged,
	canvasDraftFor,
	canvasAddNodeButtonLabel,
	canvasAddNodePlaceholder,
	canvasDisplayColor,
	canvasEdgeEnd,
	canvasEdgeStyle,
	canvasEdgeLabelChanged,
	canvasEdgeLabelDraftFor,
	canvasEdgeLabelDrafts,
	canvasEdgeMarkerId,
	canvasEdgeMarkerStyle,
	canvasEdgeMarkerUrl,
	canvasEdgeEndpoint,
	canvasEdgeRoutingChanged,
	canvasEdgeRoutingDraftFor,
	canvasEdgeRoutingDrafts,
	canvasEdgeSide,
	canvasGroupLabelChanged,
	canvasGroupLabelDraftFor,
	canvasGroupLabelDrafts,
	canSaveCanvasGroupLabel,
	canSubmitCanvasAddNode,
	canConnectCanvasNodes,
	canOpenCanvasNode,
	canSaveCanvasNodeRefDraft,
	canvasEdgeSummaries,
	canvasFileAssetKind,
	canvasFileAssetPreview,
	canvasFileNodeDisplayPath,
	canvasFileNodeFragment,
	canvasFileOpenTarget,
	canvasFileNodePath,
	canvasFileNodeSubpath,
	canvasFileNodeTitle,
	canvasLinkNodeHref,
	canvasContentNodes,
	canvasLayeredNodes,
	canvasNodeClass,
	canvasNodeBody,
	canvasNodeColorStyle,
	canvasNodeAnchor,
	canvasOpenNodeLabel,
	canvasNodeOptions,
	canvasNodePositionChanged,
	canvasNodeRefDraftChanged,
	canvasNodeRefDraftFor,
	canvasNodeRefDrafts,
	canvasNodeRefValue,
	canvasNodeSizeChanged,
	canvasNodeTitle,
	canvasNodesWithPosition,
	canvasNodesWithSize,
	canvasSvgEdgeStroke,
	canvasSvgNodeColors,
	canvasSummary,
	canvasTextEmbedHref,
	canvasTextInlineTargetHref,
	canvasTextEmbedOpenTarget,
	canvasTextEmbedRouteHref,
	canvasTextPreviewBlocks,
	canvasTextPreviewInlines,
	canvasTextNoteEmbedResolver,
	canvasTextNoteWikilinkResolver,
	canvasTextDrafts,
	edgeLines,
	canvasNodeStyle,
	canvasPaletteColorValue,
	canvasRawAssetHref,
	normalizeCanvasFileSubpath,
	normalizeCanvasColor,
	nodeStyle
} from '../src/lib/canvas/view';
import {
	canvasNodeDragPosition,
	canvasNodeMinSize,
	canvasNodeResizeSize,
	createCanvasNodeDragState,
	createCanvasNodeResizeState,
	isCanvasNodeDragPointer,
	isCanvasNodeResizePointer,
	updateCanvasNodeDragState,
	updateCanvasNodeResizeState
} from '../src/lib/canvas/drag';
import {
	canZoomCanvasIn,
	canZoomCanvasOut,
	canvasBoardZoomStyle,
	canvasGridBackgroundSize,
	canvasZoomLabel,
	canvasZoomLayerStyle,
	fitCanvasZoom,
	normalizeCanvasZoom,
	scaledCanvasLength,
	stepCanvasZoom
} from '../src/lib/canvas/viewport';
import {
	canvasEdgeMutationFlags,
	canvasNodeMutationFlags,
	canDeleteCanvasNode,
	canDuplicateCanvasNode,
	canMutateCanvasEdge,
	canSaveCanvasNodeContent,
	canSaveCanvasNodeColor,
	canStartCanvasNodeMove,
	canStartCanvasNodeResize,
	clearCanvasPointerMutationState,
	idleCanvasMutationState,
	isCanvasNodeDeleteDisabled,
	patchCanvasMutationState,
	type CanvasMutationState
} from '../src/lib/canvas/mutations';

const canvasJson = JSON.stringify({
	nodes: [
		{ id: 'a', type: 'text', x: 0, y: 0, width: 220, height: 120, text: 'Canvas text card', color: '1' },
		{ id: 'b', type: 'file', x: 320, y: 40, width: 220, height: 100, file: 'Home.md', color: '#22c55e' }
	],
	edges: [
		{ id: 'edge-a-b', fromNode: 'a', fromEnd: 'arrow', toNode: 'b', toEnd: 'none', label: 'opens', color: '6' }
	]
}, null, 2);

function gitStatus(cwd: string): string {
	return execFileSync('git', ['-C', cwd, 'status', '--short'], { encoding: 'utf-8' }).trim();
}

test.describe('canvas view helpers', () => {
	test('computes board bounds, node copy, and edge line positions', () => {
		const doc = {
			path: 'Board.canvas',
			title: 'Board',
			revision: 'rev',
			mtime: 0,
			nodes: [
				{ id: 'a', type: 'text', x: 0, y: 0, width: 220, height: 120, text: 'Hello canvas', color: 'red' },
				{ id: 'b', type: 'file', x: 320, y: 40, width: 220, height: 100, file: 'Home.md', color: '#2dd4bf' }
			],
			edges: [{ id: 'edge-a-b', fromNode: 'a', toNode: 'b', label: 'opens', color: '5' }],
			warnings: []
		} satisfies CanvasDoc;
		const bounds = canvasBounds(doc.nodes);
		expect(normalizeCanvasZoom(9)).toBe(2);
		expect(normalizeCanvasZoom(0.1)).toBe(0.25);
		expect(normalizeCanvasZoom(Number.NaN)).toBe(1);
		expect(canvasZoomLabel(1.25)).toBe('125%');
		expect(canZoomCanvasIn(1.99)).toBe(true);
		expect(canZoomCanvasIn(2)).toBe(false);
		expect(canZoomCanvasOut(0.26)).toBe(true);
		expect(canZoomCanvasOut(0.25)).toBe(false);
		expect(stepCanvasZoom(1, 'in')).toBe(1.25);
		expect(stepCanvasZoom(1, 'out')).toBe(0.8);
		expect(fitCanvasZoom({ width: 1000, height: 500 }, 564, 314)).toBe(0.5);
		expect(scaledCanvasLength(640, 1.25)).toBe(800);
		expect(canvasZoomLayerStyle({ width: 640, height: 360 }, 1.25)).toBe('width: 800px; height: 450px');
		expect(canvasBoardZoomStyle({ width: 640, height: 360 }, 0.8)).toBe('width: 640px; height: 360px; transform: scale(0.8)');
		expect(canvasGridBackgroundSize(0.5)).toBe('18px 18px');
		const idleMutationState = idleCanvasMutationState();
		expect(idleMutationState).toEqual({
			savingNodeId: null,
			duplicatingNodeId: null,
			movingNodeId: null,
			moveSavingNodeId: null,
			resizingNodeId: null,
			resizeSavingNodeId: null,
			deletingNodeId: null,
			savingEdgeId: null,
			deletingEdgeId: null
		} satisfies CanvasMutationState);
		expect(idleCanvasMutationState({ savingNodeId: 'a' })).toEqual({
			...idleMutationState,
			savingNodeId: 'a'
		});
		const activePointerState = patchCanvasMutationState(idleMutationState, {
			movingNodeId: 'a',
			resizingNodeId: 'b',
			moveSavingNodeId: 'a',
			savingEdgeId: 'edge-a-b'
		});
		expect(activePointerState).toEqual({
			...idleMutationState,
			movingNodeId: 'a',
			resizingNodeId: 'b',
			moveSavingNodeId: 'a',
			savingEdgeId: 'edge-a-b'
		});
		expect(clearCanvasPointerMutationState(activePointerState)).toEqual({
			...activePointerState,
			movingNodeId: null,
			resizingNodeId: null
		});
		expect(canSaveCanvasNodeContent(idleMutationState)).toBe(true);
		expect(canSaveCanvasNodeColor(idleMutationState)).toBe(true);
		expect(canDeleteCanvasNode(idleMutationState)).toBe(true);
		expect(canDuplicateCanvasNode(idleMutationState)).toBe(true);
		expect(canMutateCanvasEdge(idleMutationState)).toBe(true);
		expect(canStartCanvasNodeMove(idleMutationState)).toBe(true);
		expect(canStartCanvasNodeResize(idleMutationState)).toBe(true);
		expect(isCanvasNodeDeleteDisabled(idleMutationState)).toBe(false);
		expect(canSaveCanvasNodeColor({ ...idleMutationState, movingNodeId: 'a' })).toBe(false);
		expect(canDeleteCanvasNode({ ...idleMutationState, savingEdgeId: 'edge-a-b' })).toBe(false);
		expect(canMutateCanvasEdge({ ...idleMutationState, deletingEdgeId: 'edge-a-b' })).toBe(false);
		expect(canSaveCanvasNodeContent({ ...idleMutationState, savingNodeId: 'a' })).toBe(false);
		expect(canSaveCanvasNodeContent({ ...idleMutationState, duplicatingNodeId: 'a' })).toBe(false);
		expect(canDuplicateCanvasNode({ ...idleMutationState, duplicatingNodeId: 'a' })).toBe(false);
		expect(canStartCanvasNodeMove({ ...idleMutationState, moveSavingNodeId: 'a' })).toBe(false);
		expect(canStartCanvasNodeResize({ ...idleMutationState, resizeSavingNodeId: 'a' })).toBe(false);
		expect(isCanvasNodeDeleteDisabled({ ...idleMutationState, deletingNodeId: 'a' })).toBe(true);
		expect(canvasNodeMutationFlags('a', {
			...idleMutationState,
			savingNodeId: 'a',
			duplicatingNodeId: 'a',
			moveSavingNodeId: 'a',
			resizingNodeId: 'a',
			deletingNodeId: 'a',
			savingEdgeId: 'edge-a-b'
		})).toEqual({
			saving: true,
			duplicating: true,
			moving: true,
			resizing: true,
			deleting: true,
			duplicateDisabled: true,
			deleteDisabled: true
		});
		expect(canvasEdgeMutationFlags('edge-a-b', {
			...idleMutationState,
			savingEdgeId: 'edge-a-b'
		})).toEqual({
			saving: true,
			deleting: false,
			disabled: true
		});
		expect(canvasEdgeMutationFlags('edge-a-b', {
			...idleMutationState,
			deletingEdgeId: 'edge-a-b'
		})).toEqual({
			saving: false,
			deleting: true,
			disabled: true
		});

		expect(canvasNodeTitle(doc.nodes[0])).toBe('text');
		expect(canvasNodeTitle(doc.nodes[1])).toBe('Home.md');
		expect(canvasNodeTitle({ ...doc.nodes[1], label: 'Home note' })).toBe('Home note');
		const groupNode = { id: 'group', type: 'group', x: -40, y: -30, width: 640, height: 240, label: 'Research cluster' };
		expect(canvasNodeTitle(groupNode)).toBe('Research cluster');
		expect(canvasNodeTitle({ ...groupNode, label: undefined })).toBe('Group');
		expect(canvasNodeBody(groupNode)).toBe('');
		expect(canvasNodeClass(groupNode)).toBe('canvas-node canvas-node-group');
		expect(canvasLayeredNodes([doc.nodes[0], groupNode, doc.nodes[1]]).map((node) => node.id)).toEqual(['group', 'a', 'b']);
		expect(canvasContentNodes([doc.nodes[0], groupNode, doc.nodes[1]]).map((node) => node.id)).toEqual(['a', 'b']);
		expect(canvasNotePreviewPaths(doc.nodes)).toEqual(['Home.md']);
		const notePreviewMap = canvasNotePreviewMap([
			{ path: 'Home.md', title: 'Home', body: '# Home\n\nPreview body', status: 'ok', truncated: false }
		]);
		expect(canvasNotePreviewForNode(doc.nodes[1], notePreviewMap)?.body).toContain('Preview body');
		expect(canvasNotePreviewForNode(doc.nodes[0], notePreviewMap)).toBeNull();
		const longPreview = canvasNotePreviewBody(Array.from({ length: 90 }, (_, index) => `Line ${index + 1}`).join('\n'));
		expect(longPreview.truncated).toBe(true);
		expect(longPreview.body).toContain('...');
		const duplicatedRawNode = duplicateCanvasRawNode([
			{ id: 'raw-a', type: 'mystery', x: 12, y: 18, width: 260, height: 140, label: 'Keep me', pluginData: { preserved: true } }
		], 'raw-a');
		expect(duplicatedRawNode).toMatchObject({
			type: 'mystery',
			x: 52,
			y: 58,
			width: 260,
			height: 140,
			label: 'Keep me',
			pluginData: { preserved: true }
		});
		expect(duplicatedRawNode.id).toMatch(/^mystery-/);
		expect(duplicatedRawNode.id).not.toBe('raw-a');
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
		const explicitInlineTargets = canvasTextPreviewInlines(
			'Review [[Home.md#Install Steps|Launch link]] and [[Boards/Map.canvas|Map board]] plus [[Roof Photos]]'
		);
		expect(explicitInlineTargets).toEqual([
			{ kind: 'text', text: 'Review ' },
			{
				kind: 'wikilink',
				text: 'Launch link',
				target: {
					kind: 'note',
					path: 'Home.md',
					title: 'Launch link',
					subpath: '#Install Steps',
					hash: 'install-steps'
				}
			},
			{ kind: 'text', text: ' and ' },
			{
				kind: 'wikilink',
				text: 'Map board',
				target: {
					kind: 'canvas',
					path: 'Boards/Map.canvas',
					title: 'Map board',
					subpath: null,
					hash: null
				}
			},
			{ kind: 'text', text: ' plus ' },
			{ kind: 'wikilink', text: 'Roof Photos' }
		]);
		expect(canvasTextInlineTargetHref('vault id', explicitInlineTargets[1])).toBe('/vault/vault%20id/note/Home.md#install-steps');
		expect(canvasTextInlineTargetHref('vault id', explicitInlineTargets[3])).toBe('/vault/vault%20id/canvas/Boards/Map.canvas');
		expect(canvasTextInlineTargetHref('vault id', explicitInlineTargets[5])).toBeNull();
		const resolveWikilinkTarget = canvasTextNoteWikilinkResolver([
			{ path: 'Home.md', title: 'Home', aliases: ['Launch Base'], stem: 'home' },
			{
				path: 'References/Roof Photos.md',
				title: 'Roof Photos',
				aliases: ['Survey Photos'],
				stem: 'roof photos'
			}
		]);
		const resolvedAliasTargets = canvasTextPreviewInlines(
			'Review [[Survey Photos#Meter|site photos]], [[Home#Launch Plan]], [[Launch Base]], and [[Unknown]]',
			{ resolveWikilinkTarget }
		);
		expect(resolvedAliasTargets).toEqual([
			{ kind: 'text', text: 'Review ' },
			{
				kind: 'wikilink',
				text: 'site photos',
				target: {
					kind: 'note',
					path: 'References/Roof Photos.md',
					title: 'site photos',
					subpath: '#Meter',
					hash: 'meter'
				}
			},
			{ kind: 'text', text: ', ' },
			{
				kind: 'wikilink',
				text: 'Home',
				target: {
					kind: 'note',
					path: 'Home.md',
					title: 'Home',
					subpath: '#Launch Plan',
					hash: 'launch-plan'
				}
			},
			{ kind: 'text', text: ', ' },
			{
				kind: 'wikilink',
				text: 'Launch Base',
				target: {
					kind: 'note',
					path: 'Home.md',
					title: 'Home',
					subpath: null,
					hash: null
				}
			},
			{ kind: 'text', text: ', and ' },
			{ kind: 'wikilink', text: 'Unknown' }
		]);
		expect(canvasTextInlineTargetHref('vault id', resolvedAliasTargets[1])).toBe('/vault/vault%20id/note/References/Roof%20Photos.md#meter');
		expect(canvasTextInlineTargetHref('vault id', resolvedAliasTargets[3])).toBe('/vault/vault%20id/note/Home.md#launch-plan');
		expect(canvasTextInlineTargetHref('vault id', resolvedAliasTargets[5])).toBe('/vault/vault%20id/note/Home.md');
		expect(canvasTextInlineTargetHref('vault id', resolvedAliasTargets[7])).toBeNull();
		const resolveEmbedTarget = canvasTextNoteEmbedResolver([
			{ path: 'Home.md', title: 'Home', aliases: ['Launch Base'], stem: 'home' },
			{
				path: 'References/Roof Photos.md',
				title: 'Roof Photos',
				aliases: ['Survey Photos'],
				stem: 'roof photos'
			}
		]);
		expect(canvasTextPreviewBlocks('![[Survey Photos#Meter|site photos]]', { resolveEmbedTarget })).toEqual([
			{
				type: 'embed',
				embed: {
					path: 'References/Roof Photos.md',
					suffix: '#Meter',
					kind: 'note',
					title: 'site photos',
					alt: 'site photos',
					width: null,
					height: null
				}
			}
		]);
		const resolvedNoteEmbed = canvasTextPreviewBlocks('![[Launch Base]]', { resolveEmbedTarget })[0];
		if (!resolvedNoteEmbed || resolvedNoteEmbed.type !== 'embed') throw new Error('expected resolved note embed');
		expect(canvasTextEmbedRouteHref('vault id', resolvedNoteEmbed.embed)).toBe('/vault/vault%20id/note/Home.md');
		expect(canvasTextPreviewBlocks('![[Unknown Alias]]', { resolveEmbedTarget })).toEqual([
			{ type: 'paragraph', inline: [{ kind: 'text', text: '![[Unknown Alias]]' }] }
		]);
		const previewBlocks = canvasTextPreviewBlocks([
			'# Launch plan',
			'#### Detail scope',
			'---',
			'',
			'- [x] Capture **utility bill** and ~~old bill~~',
			'- [ ] Upload [[Roof Photos]]',
			'> Refer questions',
			'> [!WARNING]- Site survey',
			'> Capture ==main panel== photos',
			'| Step | Owner |',
			'| --- | --- |',
			'| Bill | [[Sandy]] |',
			'| **Panel** | ==Runner== |',
			'```txt',
			'main panel',
			'```'
		].join('\n'));
		expect(previewBlocks[0]).toMatchObject({ type: 'heading', level: 1 });
		expect(previewBlocks[1]).toMatchObject({ type: 'heading', level: 4 });
		expect(previewBlocks[2]).toEqual({ type: 'thematic-break' });
		expect(previewBlocks[3]).toMatchObject({
			type: 'unordered-list',
			items: [
				{
					checked: true,
					inline: [
						{ kind: 'text', text: 'Capture ' },
						{ kind: 'strong', text: 'utility bill' },
						{ kind: 'text', text: ' and ' },
						{ kind: 'strikethrough', text: 'old bill' }
					]
				},
				{ checked: false, inline: [{ kind: 'text', text: 'Upload ' }, { kind: 'wikilink', text: 'Roof Photos' }] }
			]
		});
		expect(previewBlocks[4]).toMatchObject({ type: 'quote', inline: [{ kind: 'text', text: 'Refer questions' }] });
		expect(previewBlocks[5]).toMatchObject({
			type: 'callout',
			kind: 'warning',
			title: [{ kind: 'text', text: 'Site survey' }],
			fold: 'closed',
			body: [
				{
					type: 'paragraph',
					inline: [
						{ kind: 'text', text: 'Capture ' },
						{ kind: 'highlight', text: 'main panel' },
						{ kind: 'text', text: ' photos' }
					]
				}
			]
		});
		expect(previewBlocks[6]).toMatchObject({
			type: 'table',
			table: {
				headers: [
					{ inline: [{ kind: 'text', text: 'Step' }] },
					{ inline: [{ kind: 'text', text: 'Owner' }] }
				],
				rows: [
					[
						{ inline: [{ kind: 'text', text: 'Bill' }] },
						{ inline: [{ kind: 'wikilink', text: 'Sandy' }] }
					],
					[
						{ inline: [{ kind: 'strong', text: 'Panel' }] },
						{ inline: [{ kind: 'highlight', text: 'Runner' }] }
					]
				]
			}
		});
		expect(canvasTextPreviewBlocks('A | B without separator')).toEqual([
			{ type: 'paragraph', inline: [{ kind: 'text', text: 'A | B without separator' }] }
		]);
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
		expect(canvasTextPreviewBlocks('![[../secret.png]]')).toEqual([
			{ type: 'paragraph', inline: [{ kind: 'text', text: '![[../secret.png]]' }] }
		]);
		expect(canvasTextPreviewBlocks('![[Home.md#Install Steps|Launch note]]')).toEqual([
			{
				type: 'embed',
				embed: {
					path: 'Home.md',
					suffix: '#Install Steps',
					kind: 'note',
					title: 'Launch note',
					alt: 'Launch note',
					width: null,
					height: null
				}
			}
		]);
		expect(canvasTextPreviewBlocks('![[Boards/Map.canvas|Canvas map]]')).toEqual([
			{
				type: 'embed',
				embed: {
					path: 'Boards/Map.canvas',
					suffix: '',
					kind: 'canvas',
					title: 'Canvas map',
					alt: 'Canvas map',
					width: null,
					height: null
				}
			}
		]);
		expect(canvasTextPreviewBlocks('![[Home.md?raw=1]]')).toEqual([
			{ type: 'paragraph', inline: [{ kind: 'text', text: '![[Home.md?raw=1]]' }] }
		]);
		expect(canvasTextEmbedHref('vault id', {
			path: 'Images/roof.svg',
			kind: 'image',
			suffix: '#diagram'
		})).toBe('/api/vaults/vault%20id/raw/Images/roof.svg#diagram');
		const noteEmbed = canvasTextPreviewBlocks('![[Home.md#Install Steps|Launch note]]')[0];
		if (noteEmbed.type !== 'embed') throw new Error('expected note embed');
		expect(canvasTextEmbedOpenTarget(noteEmbed.embed)).toEqual({
			kind: 'note',
			path: 'Home.md',
			title: 'Launch note',
			subpath: '#Install Steps',
			hash: 'install-steps'
		});
		expect(canvasTextEmbedRouteHref('vault id', noteEmbed.embed)).toBe('/vault/vault%20id/note/Home.md#install-steps');
		expect(previewBlocks[7]).toEqual({ type: 'code', language: 'txt', code: 'main panel' });
		const groupDrafts = canvasGroupLabelDrafts([doc.nodes[0], groupNode, doc.nodes[1]]);
		expect(canvasGroupLabelDraftFor(groupNode, groupDrafts)).toBe('Research cluster');
		expect(canvasGroupLabelChanged(groupNode, groupDrafts)).toBe(false);
		expect(canvasGroupLabelChanged(groupNode, { ...groupDrafts, group: 'Follow-up cluster' })).toBe(true);
		expect(canSaveCanvasGroupLabel(groupNode, { ...groupDrafts, group: '' })).toBe(true);
		expect(canSaveCanvasGroupLabel(doc.nodes[0], groupDrafts)).toBe(false);
		expect(canvasNodeBody(doc.nodes[0])).toBe('Hello canvas');
		expect(canvasNodeBody({ ...doc.nodes[1], label: 'Home note' })).toBe('Home.md');
		const subpathFileNode = { ...doc.nodes[1], subpath: '#Install Steps' };
		const blockSubpathFileNode = { ...doc.nodes[1], subpath: '#^install-steps' };
		expect(normalizeCanvasFileSubpath('#Install Steps')).toBe('#Install Steps');
		expect(normalizeCanvasFileSubpath('Install Steps')).toBeNull();
		expect(normalizeCanvasFileSubpath('#^install-steps')).toBe('#^install-steps');
		expect(normalizeCanvasFileSubpath('#')).toBeNull();
		expect(normalizeCanvasFileSubpath('#Bad\nHeading')).toBeNull();
		expect(canvasFileNodeSubpath(subpathFileNode)).toBe('#Install Steps');
		expect(canvasFileNodeFragment(subpathFileNode)).toBe('#install-steps');
		expect(canvasFileNodeFragment(blockSubpathFileNode)).toBe('#^install-steps');
		expect(canvasFileNodeDisplayPath(subpathFileNode)).toBe('Home.md#Install Steps');
		expect(canvasNodeClass(doc.nodes[0])).toBe('canvas-node canvas-node-text');
		expect(canvasDisplayColor('1')).toEqual({ accent: '#dc2626', fill: '#fee2e2', text: '#7f1d1d', label: 'red' });
		expect(canvasDisplayColor('purple')?.accent).toBe('#9333ea');
		expect(canvasDisplayColor('#ABC')).toMatchObject({ accent: '#aabbcc', fill: '#aabbcc22', label: 'custom' });
		expect(canvasDisplayColor('url(javascript:alert(1))')).toBeNull();
		expect(normalizeCanvasColor('green')).toBe('4');
		expect(normalizeCanvasColor('#ABC')).toBe('#aabbcc');
		expect(normalizeCanvasColor('bad')).toBeNull();
		expect(canvasPaletteColorValue('purple')).toBe('6');
		expect(canvasPaletteColorValue('#aabbcc')).toBe('#aabbcc');
		expect(canvasPaletteColorValue('bad')).toBe('');
		expect(CANVAS_COLOR_OPTIONS.map((option) => option.label)).toEqual([
			'default',
			'red',
			'orange',
			'yellow',
			'green',
			'cyan',
			'purple'
		]);
		expect(CANVAS_EDGE_SIDE_OPTIONS.map((option) => option.value)).toEqual([
			'center',
			'top',
			'right',
			'bottom',
			'left'
		]);
		expect(CANVAS_EDGE_END_OPTIONS.map((option) => option.value)).toEqual(['none', 'arrow']);
		expect(canvasNodeColorStyle(doc.nodes[0])).toContain('--canvas-node-border: #dc2626');
		expect(canvasNodeStyle(doc.nodes[0], bounds)).toContain('--canvas-node-bg: #fee2e2');
		expect(canvasSvgNodeColors(doc.nodes[0])).toEqual({ fill: '#fee2e2', stroke: '#dc2626' });
		expect(canvasSvgNodeColors({ ...doc.nodes[0], color: undefined })).toEqual({ fill: '#fffbeb', stroke: '#d97706' });
		expect(canvasSvgNodeColors({ ...groupNode, color: undefined })).toEqual({ fill: '#e2e8f0', stroke: '#64748b' });
		expect(canvasEdgeStyle(doc.edges[0])).toBe('stroke: #0891b2;');
		expect(canvasEdgeMarkerStyle(doc.edges[0])).toBe('fill: #0891b2;');
		expect(canvasSvgEdgeStroke(doc.edges[0])).toBe('#0891b2');
		expect(canvasSvgEdgeStroke({ ...doc.edges[0], color: 'bad' })).toBe('#94a3b8');
		expect(canvasSummary(doc)).toBe('2 nodes · 1 edge');
		expect(nodeStyle(doc.nodes[0], bounds)).toContain('left: 80px');
		expect(edgeLines(doc, bounds)).toEqual([
			{ edge: doc.edges[0], x1: 190, y1: 140, x2: 510, y2: 170 }
		]);
		expect(canvasEdgeSide('right')).toBe('right');
		expect(canvasEdgeSide('sideways')).toBe('center');
		expect(canvasEdgeEnd('arrow', 'none')).toBe('arrow');
		expect(canvasEdgeEnd('sideways', 'arrow')).toBe('arrow');
		expect(canvasEdgeEndpoint(doc.edges[0], 'from')).toBe('none');
		expect(canvasEdgeEndpoint(doc.edges[0], 'to')).toBe('arrow');
		expect(canvasEdgeEndpoint({ ...doc.edges[0], fromEnd: 'arrow', toEnd: 'none' }, 'from')).toBe('arrow');
		expect(canvasEdgeEndpoint({ ...doc.edges[0], fromEnd: 'arrow', toEnd: 'none' }, 'to')).toBe('none');
		expect(canvasEdgeMarkerUrl(doc.edges[0], 'from')).toBeNull();
		expect(canvasEdgeMarkerUrl(doc.edges[0], 'to')).toBe(`url(#${canvasEdgeMarkerId(doc.edges[0], 'to')})`);
		expect(canvasEdgeMarkerId({ ...doc.edges[0], id: 'weird edge/id' }, 'to')).toMatch(/^canvas-edge-weird-edge-id-[a-z0-9]+-to$/);
		expect(canvasNodeAnchor(doc.nodes[0], bounds, 'top')).toEqual({ x: 190, y: 80 });
		expect(canvasNodeAnchor(doc.nodes[0], bounds, 'right')).toEqual({ x: 300, y: 140 });
		expect(canvasNodeAnchor(doc.nodes[0], bounds, 'bottom')).toEqual({ x: 190, y: 200 });
		expect(canvasNodeAnchor(doc.nodes[0], bounds, 'left')).toEqual({ x: 80, y: 140 });
		expect(edgeLines({
			...doc,
			edges: [{ ...doc.edges[0], fromSide: 'right', toSide: 'left' }]
		}, bounds)).toEqual([
			{
				edge: { ...doc.edges[0], fromSide: 'right', toSide: 'left' },
				x1: 300,
				y1: 140,
				x2: 400,
				y2: 170
			}
		]);
		const drafts = canvasTextDrafts(doc.nodes);
		expect(canvasDraftFor(doc.nodes[0], drafts)).toBe('Hello canvas');
		expect(canvasDraftChanged(doc.nodes[0], drafts)).toBe(false);
		expect(canvasDraftChanged(doc.nodes[0], { ...drafts, a: 'Edited' })).toBe(true);
		const refDrafts = canvasNodeRefDrafts(doc.nodes);
		expect(canvasNodeRefValue(doc.nodes[1])).toBe('Home.md');
		expect(canvasNodeRefDraftFor(doc.nodes[1], refDrafts)).toEqual({ value: 'Home.md', label: '', subpath: '' });
		expect(canvasNodeRefDraftChanged(doc.nodes[1], refDrafts)).toBe(false);
		expect(canvasNodeRefDraftChanged(doc.nodes[1], { ...refDrafts, b: { value: 'Notes/Home.md', label: 'Home note', subpath: '#Install Steps' } })).toBe(true);
		expect(canSaveCanvasNodeRefDraft(doc.nodes[1], { ...refDrafts, b: { value: '', label: 'Home note', subpath: '' } })).toBe(false);
		expect(canSaveCanvasNodeRefDraft(doc.nodes[1], { ...refDrafts, b: { value: 'Notes/Home.md', label: 'Home note', subpath: 'Install Steps' } })).toBe(false);
		expect(canSaveCanvasNodeRefDraft(doc.nodes[1], { ...refDrafts, b: { value: 'Notes/Home.md', label: 'Home note', subpath: '#Install Steps' } })).toBe(true);
		expect(canvasFileNodePath(doc.nodes[1])).toBe('Home.md');
		expect(canvasFileNodeTitle(doc.nodes[1])).toBe('Home');
		expect(canvasFileNodeTitle({ ...doc.nodes[1], label: 'Home note' })).toBe('Home note');
		expect(canvasFileOpenTarget(doc.nodes[1])).toEqual({
			kind: 'note',
			path: 'Home.md',
			title: 'Home',
			actionLabel: 'Open note',
			subpath: null,
			hash: null
		});
		expect(canvasFileOpenTarget(subpathFileNode)).toEqual({
			kind: 'note',
			path: 'Home.md',
			title: 'Home',
			actionLabel: 'Open note',
			subpath: '#Install Steps',
			hash: 'install-steps'
		});
		expect(canvasOpenNodeLabel(doc.nodes[1])).toBe('Open canvas file node Home.md');
		expect(canOpenCanvasNode(doc.nodes[1])).toBe(true);
		const canvasFileNode = { ...doc.nodes[1], id: 'canvas-file', file: 'Boards/Ideas.canvas' };
		expect(canvasFileNodeTitle(canvasFileNode)).toBe('Ideas');
		expect(canvasFileOpenTarget(canvasFileNode)).toEqual({
			kind: 'canvas',
			path: 'Boards/Ideas.canvas',
			title: 'Ideas',
			actionLabel: 'Open Canvas',
			subpath: null,
			hash: null
		});
		expect(canOpenCanvasNode(canvasFileNode)).toBe(true);
		const assetFileNode = { ...doc.nodes[1], id: 'asset-file', file: 'Images/roof.png' };
		expect(canvasFileOpenTarget(assetFileNode)).toBeNull();
		expect(canOpenCanvasNode(assetFileNode)).toBe(false);
		expect(canvasFileAssetKind('Images/roof.png')).toBe('image');
		expect(canvasFileAssetKind('Docs/program.pdf')).toBe('pdf');
		expect(canvasFileAssetKind('Audio/walkthrough.mp3')).toBe('audio');
		expect(canvasFileAssetKind('Video/demo.webm')).toBe('video');
		expect(canvasFileAssetKind('Archive/site-data.zip')).toBe('file');
		expect(canvasRawAssetHref('vault id', 'Images/roof photo.png')).toBe('/api/vaults/vault%20id/raw/Images/roof%20photo.png');
		expect(canvasRawAssetHref('vault id', 'Images/roof photo.svg#diagram')).toBe('/api/vaults/vault%20id/raw/Images/roof%20photo.svg#diagram');
		expect(canvasRawAssetHref('vault', '../secret.png')).toBeNull();
		expect(canvasRawAssetHref('vault', 'https://example.com/roof.png')).toBeNull();
		expect(canvasFileAssetPreview(assetFileNode, 'vault id')).toEqual({
			kind: 'image',
			path: 'Images/roof.png',
			title: 'roof.png',
			href: '/api/vaults/vault%20id/raw/Images/roof.png',
			actionLabel: 'Open image'
		});
		const linkNode = {
			id: 'c',
			type: 'link',
			x: 0,
			y: 0,
			width: 220,
			height: 100,
			url: 'https://example.com/research'
		} satisfies CanvasDoc['nodes'][number];
		expect(canvasLinkNodeHref(linkNode)).toBe('https://example.com/research');
		expect(canvasOpenNodeLabel(linkNode)).toBe('Open canvas URL node https://example.com/research');
		expect(canOpenCanvasNode(linkNode)).toBe(true);
		expect(canvasLinkNodeHref({ ...linkNode, url: 'javascript:alert(1)' })).toBeNull();
		expect(canOpenCanvasNode({ ...linkNode, url: 'ftp://example.com/file' })).toBe(false);
		expect(canvasAddNodePlaceholder('file')).toBe('Note.md');
		expect(canvasAddNodePlaceholder('group')).toBe('Group label');
		expect(canvasAddNodeButtonLabel('link')).toBe('Add URL');
		expect(canvasAddNodeButtonLabel('group')).toBe('Add group');
		expect(canSubmitCanvasAddNode('text', '')).toBe(true);
		expect(canSubmitCanvasAddNode('group', '')).toBe(true);
		expect(canSubmitCanvasAddNode('file', '')).toBe(false);
		expect(canSubmitCanvasAddNode('file', 'Home.md')).toBe(true);
		expect(canvasNodePositionChanged(doc.nodes[1], 360, 90)).toBe(true);
		const moved = canvasNodesWithPosition(doc.nodes, { nodeId: 'b', x: 360, y: 90 });
		expect(moved.find((node) => node.id === 'b')).toMatchObject({ x: 360, y: 90 });
		expect(doc.nodes.find((node) => node.id === 'b')).toMatchObject({ x: 320, y: 40 });
		expect(canvasNodeSizeChanged(doc.nodes[1], 280, 180)).toBe(true);
		const resized = canvasNodesWithSize(doc.nodes, { nodeId: 'b', width: 280, height: 180 });
		expect(resized.find((node) => node.id === 'b')).toMatchObject({ width: 280, height: 180 });
		expect(doc.nodes.find((node) => node.id === 'b')).toMatchObject({ width: 220, height: 100 });
		const dragStart = createCanvasNodeDragState(doc.nodes[1], {
			pointerId: 7,
			clientX: 100,
			clientY: 120
		});
		expect(canvasNodeDragPosition(dragStart)).toEqual({ nodeId: 'b', x: 320, y: 40 });
		expect(isCanvasNodeDragPointer(dragStart, { pointerId: 99 })).toBe(false);
		expect(updateCanvasNodeDragState(dragStart, {
			pointerId: 99,
			clientX: 300,
			clientY: 300
		})).toBe(dragStart);
		const dragMoved = updateCanvasNodeDragState(dragStart, {
			pointerId: 7,
			clientX: 160.4,
			clientY: 150.6
		});
		expect(canvasNodeDragPosition(dragMoved)).toEqual({ nodeId: 'b', x: 380, y: 71 });
		const zoomedDragMoved = updateCanvasNodeDragState(createCanvasNodeDragState(doc.nodes[1], {
			pointerId: 17,
			clientX: 100,
			clientY: 120
		}, 2), {
			pointerId: 17,
			clientX: 160,
			clientY: 150
		});
		expect(canvasNodeDragPosition(zoomedDragMoved)).toEqual({ nodeId: 'b', x: 350, y: 55 });
		expect(canvasNodeMinSize(doc.nodes[1])).toEqual({ width: 140, height: 150 });
		const resizeStart = createCanvasNodeResizeState(doc.nodes[1], {
			pointerId: 8,
			clientX: 200,
			clientY: 240
		});
		expect(canvasNodeResizeSize(resizeStart)).toEqual({ nodeId: 'b', width: 220, height: 100 });
		expect(isCanvasNodeResizePointer(resizeStart, { pointerId: 99 })).toBe(false);
		expect(updateCanvasNodeResizeState(resizeStart, {
			pointerId: 99,
			clientX: 20,
			clientY: 20
		})).toBe(resizeStart);
		const resizeGrown = updateCanvasNodeResizeState(resizeStart, {
			pointerId: 8,
			clientX: 275.4,
			clientY: 315.6
		});
		expect(canvasNodeResizeSize(resizeGrown)).toEqual({ nodeId: 'b', width: 295, height: 176 });
		const zoomedResizeGrown = updateCanvasNodeResizeState(createCanvasNodeResizeState(doc.nodes[1], {
			pointerId: 18,
			clientX: 200,
			clientY: 240
		}, 2), {
			pointerId: 18,
			clientX: 280,
			clientY: 300
		});
		expect(canvasNodeResizeSize(zoomedResizeGrown)).toEqual({ nodeId: 'b', width: 260, height: 150 });
		const resizeClamped = updateCanvasNodeResizeState(resizeStart, {
			pointerId: 8,
			clientX: -200,
			clientY: -200
		});
		expect(canvasNodeResizeSize(resizeClamped)).toEqual({ nodeId: 'b', width: 140, height: 150 });
		expect(canvasNodeOptions(doc.nodes)).toEqual([
			{ id: 'a', label: 'text (text)' },
			{ id: 'b', label: 'Home.md (file)' }
		]);
		expect(canvasNodeOptions([groupNode, ...doc.nodes])).toEqual([
			{ id: 'a', label: 'text (text)' },
			{ id: 'b', label: 'Home.md (file)' }
		]);
		expect(canvasConnectionDraft(doc.nodes)).toEqual({ fromNodeId: 'a', toNodeId: 'b' });
		expect(canvasConnectionDraft([groupNode, ...doc.nodes])).toEqual({ fromNodeId: 'a', toNodeId: 'b' });
		expect(canvasConnectionDraft(doc.nodes, 'b', 'a')).toEqual({ fromNodeId: 'b', toNodeId: 'a' });
		expect(canConnectCanvasNodes('a', 'b')).toBe(true);
		expect(canConnectCanvasNodes('a', 'a')).toBe(false);
		const edgeSummaries = canvasEdgeSummaries(doc);
		expect(edgeSummaries).toEqual([
			{
				id: 'edge-a-b',
				label: 'opens',
				editableLabel: 'opens',
				fromLabel: 'text',
				toLabel: 'Home.md',
				description: 'text to Home.md: opens',
				fromSide: 'center',
				toSide: 'center',
				fromEnd: 'none',
				toEnd: 'arrow',
				color: '5'
			}
		]);
		const edgeDrafts = canvasEdgeLabelDrafts(edgeSummaries);
		expect(canvasEdgeLabelDraftFor(edgeSummaries[0], edgeDrafts)).toBe('opens');
		expect(canvasEdgeLabelChanged(edgeSummaries[0], edgeDrafts)).toBe(false);
		expect(canvasEdgeLabelChanged(edgeSummaries[0], { ...edgeDrafts, 'edge-a-b': 'loops back' })).toBe(true);
		const edgeRoutingDrafts = canvasEdgeRoutingDrafts(edgeSummaries);
		expect(canvasEdgeRoutingDraftFor(edgeSummaries[0], edgeRoutingDrafts)).toEqual({
			fromSide: 'center',
			toSide: 'center',
			fromEnd: 'none',
			toEnd: 'arrow'
		});
		expect(canvasEdgeRoutingChanged(edgeSummaries[0], edgeRoutingDrafts)).toBe(false);
		expect(canvasEdgeRoutingChanged(edgeSummaries[0], {
			...edgeRoutingDrafts,
			'edge-a-b': { fromSide: 'right', toSide: 'left', fromEnd: 'arrow', toEnd: 'none' }
		})).toBe(true);
		const draftState = canvasDraftStateForDoc({
			nodes: [
				doc.nodes[0],
				groupNode,
				{ ...doc.nodes[1], label: 'Home note', subpath: '#Install Steps' }
			],
			edges: [{ ...doc.edges[0], fromSide: 'right', toSide: 'left' }]
		}, 'b', 'a');
		expect(draftState.textDrafts).toEqual({ a: 'Hello canvas' });
		expect(draftState.groupLabelDrafts).toEqual({ group: 'Research cluster' });
		expect(draftState.refDrafts).toEqual({
			b: { value: 'Home.md', label: 'Home note', subpath: '#Install Steps' }
		});
		expect(draftState.edgeLabelDrafts).toEqual({ 'edge-a-b': 'opens' });
		expect(draftState.edgeRoutingDrafts).toEqual({
			'edge-a-b': { fromSide: 'right', toSide: 'left', fromEnd: 'none', toEnd: 'arrow' }
		});
		expect(draftState.edgeFromNodeId).toBe('b');
		expect(draftState.edgeToNodeId).toBe('a');
		const resetDraftState = canvasDraftStateForDoc({
			nodes: [groupNode, doc.nodes[0]],
			edges: []
		}, 'missing', 'b');
		expect(resetDraftState.edgeFromNodeId).toBe('a');
		expect(resetDraftState.edgeToNodeId).toBe('');
	});
});

test('canvas API and file tree open an editable Obsidian Canvas preview', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'canvas-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n');
	fs.writeFileSync(path.join(vaultDir, 'Board.canvas'), canvasJson);

	const created = await request.post('/api/vaults', {
		data: { name: 'Canvas Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	const loaded = await request.get(`/api/vaults/${vault.id}/canvas?path=${encodeURIComponent('Board.canvas')}`);
	expect(loaded.ok()).toBe(true);
	const body = await loaded.json() as CanvasDoc;
	expect(body.nodes).toHaveLength(2);
	expect(body.edges).toHaveLength(1);
	expect(body.nodes.find((node) => node.id === 'a')?.color).toBe('1');
	expect(body.edges[0].color).toBe('6');
	expect(body.edges[0].fromEnd).toBe('arrow');
	expect(body.edges[0].toEnd).toBe('none');

	await page.goto(`/vault/${vault.id}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
	const boardLink = page.locator('.tree .file-link').filter({ hasText: 'Board' }).first();
	await expect(boardLink).toBeVisible({ timeout: 10_000 });
	await boardLink.click();
	await expect(page.locator('.canvas-view')).toBeVisible({ timeout: 5_000 });
	await expect(page.locator('.canvas-view')).toContainText('Board');
	await expect(page.locator('.canvas-view')).toContainText('2 nodes · 1 edge · editable text cards');
	await expect(page.locator('.canvas-node-text textarea').first()).toHaveValue('Canvas text card');
	await expect(page.locator('.canvas-node-text').first()).toHaveAttribute('style', /--canvas-node-border: #dc2626/);
	await expect(page.locator('.canvas-view .edge').first()).toHaveAttribute('style', /stroke: rgb\(147, 51, 234\)/);
	await expect(page.locator('.canvas-view .edge').first()).toHaveAttribute('marker-start', /^url\(#canvas-edge-edge-a-b-[a-z0-9]+-from\)$/);
	await expect(page.locator('.canvas-view .edge').first()).not.toHaveAttribute('marker-end', /.*/);
	const zoomControls = page.getByRole('group', { name: 'Canvas zoom controls' });
	await expect(zoomControls.locator('.zoom-value')).toHaveText('100%');
	await zoomControls.getByRole('button', { name: 'Zoom in Canvas' }).click();
	await expect(zoomControls.locator('.zoom-value')).toHaveText('125%');
	await expect(page.locator('.canvas-board')).toHaveAttribute('style', /transform: scale\(1\.25\)/);
	await zoomControls.getByRole('button', { name: 'Zoom out Canvas' }).click();
	await expect(zoomControls.locator('.zoom-value')).toHaveText('100%');
	await zoomControls.getByRole('button', { name: 'Reset Canvas zoom' }).click();
	await expect(page.locator('.canvas-board')).toHaveAttribute('style', /transform: scale\(1\)/);
	await expect(page.locator('.canvas-view')).toContainText('Home.md');
	await expect(page.getByRole('button', { name: 'Add text' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Download SVG' })).toHaveAttribute(
		'href',
		`/api/vaults/${vault.id}/canvas/export?path=Board.canvas`
	);
	await page.getByRole('button', { name: 'Open canvas file node Home.md' }).click();
	await expect(page.getByRole('tab', { name: /Home/ })).toHaveAttribute('aria-selected', 'true');
	await expect(page.locator('.note-view')).toContainText('Home');
});

test('canvas text cards render a safe markdown preview while remaining editable', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'canvas-markdown-preview-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(path.join(vaultDir, 'Images'), { recursive: true });
	fs.mkdirSync(path.join(vaultDir, 'Docs'), { recursive: true });
	fs.mkdirSync(path.join(vaultDir, 'Boards'), { recursive: true });
	fs.mkdirSync(path.join(vaultDir, 'References'), { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Launch Plan\n\nHome details.\n');
	fs.writeFileSync(path.join(vaultDir, 'References', 'Roof Photos.md'), [
		'---',
		'aliases:',
		'  - Survey Photos',
		'---',
		'# Meter',
		'',
		'Site survey photos.'
	].join('\n'));
	fs.writeFileSync(path.join(vaultDir, 'Boards', 'Map.canvas'), JSON.stringify({
		nodes: [{ id: 'map-text', type: 'text', x: 0, y: 0, width: 220, height: 120, text: 'Map board' }],
		edges: []
	}));
	fs.writeFileSync(path.join(vaultDir, 'Images', 'roof.svg'), [
		'<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90">',
		'<rect width="160" height="90" fill="#0f766e"/>',
		'<path d="M20 62 L80 24 L140 62 Z" fill="#f8fafc"/>',
		'</svg>'
	].join(''));
	fs.writeFileSync(path.join(vaultDir, 'Images', 'roof (south).svg'), [
		'<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80">',
		'<rect width="120" height="80" fill="#2563eb"/>',
		'<path d="M12 54 L60 18 L108 54 Z" fill="#f8fafc"/>',
		'</svg>'
	].join(''));
	fs.writeFileSync(path.join(vaultDir, 'Docs', 'panel.pdf'), '%PDF-1.4\n');
	fs.writeFileSync(path.join(vaultDir, 'Docs', 'panel (final).pdf'), '%PDF-1.4\n');
	fs.writeFileSync(path.join(vaultDir, 'Boards', 'Board.canvas'), JSON.stringify({
		nodes: [
			{
				id: 'a',
				type: 'text',
				x: 0,
				y: 0,
				width: 340,
				height: 360,
				text: [
					'# Launch plan',
					'#### Detail scope',
					'---',
					'Visible %%hidden canvas comment [[Hidden]]%% note',
					'%%',
					'Hidden canvas block',
					'%%',
					'Code `%%kept-inline%%` stays',
					'![[Home.md#Launch Plan|Launch note]]',
					'![[Survey Photos#Meter|Survey note]]',
					'![[Boards/Map.canvas|Canvas map]]',
					'![[Images/roof.svg|Roof photo|160x90]]',
					'![Panel packet](../Docs/panel.pdf#page=2)',
					'![Final packet](../Docs/panel (final).pdf#page=4)',
					'![Root roof](/Images/roof.svg)',
					'Inline image ![Inline roof|120x60](<../Images/roof.svg#diagram> "Roof") inside a sentence',
					'Inline parenthesized image ![Roof south|90](../Images/roof (south).svg#diagram) inside a sentence',
					'Review [[Survey Photos#Meter|site photos]], [[Home#Launch Plan]], [[Home.md#Launch Plan|Launch link]], and [[Boards/Map.canvas|Map board]]',
					'Markdown links [Launch markdown](../Home.md#Launch Plan), [Canvas markdown](Map.canvas), and [external](https://example.com)',
					'Vault-root Markdown links [Root note](/References/Roof%20Photos.md#Meter) and [Root Canvas](/Boards/Map.canvas)',
					'- [x] Capture **utility bill** and ~~old bill~~',
					'- [ ] Upload [[Roof Photos]]',
					'- [ ] Missing [[Missing Alias]] stays visible',
					'> Refer homeowner questions',
					'> [!TIP]+ Site survey',
					'> Capture ==main panel== photos',
					'| Step | Owner |',
					'| :--- | ---: |',
					'| Bill | [[Sandy]] |',
					'| **Panel** | ==Runner== |',
					'| Utility \\| meter | Main \\| exterior |',
					'```txt',
					'main panel',
					'```'
				].join('\n')
			}
		],
		edges: []
	}, null, 2));

	const created = await request.post('/api/vaults', {
		data: { name: 'Canvas Markdown Preview Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };
	const linkTargets = await request.get(`/api/vaults/${vault.id}/link-targets`);
	expect(linkTargets.ok()).toBe(true);
	const linkTargetBody = await linkTargets.json() as { targets: unknown[] };
	expect(linkTargetBody.targets).toEqual(expect.arrayContaining([
		expect.objectContaining({
			path: 'References/Roof Photos.md',
			title: 'Roof Photos',
			aliases: ['Survey Photos'],
			stem: 'roof photos'
		})
	]));

	await page.goto(`/vault/${vault.id}/canvas/${encodeURI('Boards/Board.canvas')}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.canvas-view')).toBeVisible({ timeout: 5_000 });
	const preview = page.locator('.canvas-text-preview').first();
	await expect(preview).toContainText('Launch plan');
	await expect(preview.locator('.preview-heading.level-4')).toHaveText('Detail scope');
	await expect(preview.locator('hr')).toHaveCount(1);
	await expect(preview).toContainText('Visible note');
	await expect(preview).toContainText('%%kept-inline%%');
	await expect(preview).not.toContainText('hidden canvas comment');
	await expect(preview).not.toContainText('Hidden canvas block');
	await expect(preview.getByRole('link', { name: /Launch note NOTE/ })).toHaveAttribute('href', /\/vault\/[^/]+\/note\/Home\.md#launch-plan$/);
	await expect(preview.getByRole('link', { name: /Survey note NOTE/ })).toHaveAttribute('href', /\/vault\/[^/]+\/note\/References\/Roof%20Photos\.md#meter$/);
	await expect(preview.getByRole('link', { name: /Canvas map CANVAS/ })).toHaveAttribute('href', /\/vault\/[^/]+\/canvas\/Boards\/Map\.canvas$/);
	await expect(preview.locator('img[alt="Roof photo"]')).toHaveAttribute('src', /\/api\/vaults\/[^/]+\/raw\/Images\/roof\.svg$/);
	await expect(preview.locator('img[alt="Roof photo"]')).toHaveAttribute('width', '160');
	await expect(preview.locator('img[alt="Roof photo"]')).toHaveAttribute('height', '90');
	await expect(preview.getByRole('link', { name: /Panel packet PDF/ })).toHaveAttribute('href', /\/api\/vaults\/[^/]+\/raw\/Docs\/panel\.pdf#page=2$/);
	await expect(preview.getByRole('link', { name: /Final packet PDF/ })).toHaveAttribute('href', /\/api\/vaults\/[^/]+\/raw\/Docs\/panel%20\(final\)\.pdf#page=4$/);
	await expect(preview.locator('img[alt="Root roof"]')).toHaveAttribute('src', /\/api\/vaults\/[^/]+\/raw\/Images\/roof\.svg$/);
	await expect(preview.locator('img.inline-image[alt="Inline roof"]')).toHaveAttribute('src', /\/api\/vaults\/[^/]+\/raw\/Images\/roof\.svg#diagram$/);
	await expect(preview.locator('img.inline-image[alt="Inline roof"]')).toHaveAttribute('width', '120');
	await expect(preview.locator('img.inline-image[alt="Inline roof"]')).toHaveAttribute('height', '60');
	await expect(preview.locator('img.inline-image[alt="Roof south"]')).toHaveAttribute('src', /\/api\/vaults\/[^/]+\/raw\/Images\/roof%20\(south\)\.svg#diagram$/);
	await expect(preview.locator('img.inline-image[alt="Roof south"]')).toHaveAttribute('width', '90');
	await expect(preview.getByRole('link', { name: /\[\[site photos\]\]/ })).toHaveAttribute('href', /\/vault\/[^/]+\/note\/References\/Roof%20Photos\.md#meter$/);
	await expect(preview.getByRole('link', { name: /\[\[Home\]\]/ })).toHaveAttribute('href', /\/vault\/[^/]+\/note\/Home\.md#launch-plan$/);
	await expect(preview.getByRole('link', { name: /\[\[Launch link\]\]/ })).toHaveAttribute('href', /\/vault\/[^/]+\/note\/Home\.md#launch-plan$/);
	await expect(preview.getByRole('link', { name: /\[\[Map board\]\]/ })).toHaveAttribute('href', /\/vault\/[^/]+\/canvas\/Boards\/Map\.canvas$/);
	await expect(preview.getByRole('link', { name: 'Launch markdown' })).toHaveAttribute('href', /\/vault\/[^/]+\/note\/Home\.md#launch-plan$/);
	await expect(preview.getByRole('link', { name: 'Canvas markdown' })).toHaveAttribute('href', /\/vault\/[^/]+\/canvas\/Boards\/Map\.canvas$/);
	await expect(preview.getByRole('link', { name: 'Root note' })).toHaveAttribute('href', /\/vault\/[^/]+\/note\/References\/Roof%20Photos\.md#meter$/);
	await expect(preview.getByRole('link', { name: 'Root Canvas' })).toHaveAttribute('href', /\/vault\/[^/]+\/canvas\/Boards\/Map\.canvas$/);
	await expect(preview.getByRole('link', { name: 'external' })).toHaveAttribute('href', 'https://example.com');
	await expect(preview.getByRole('link', { name: 'external' })).toHaveAttribute('target', '_blank');
	await expect(preview.locator('strong').first()).toHaveText('utility bill');
	await expect(preview.locator('del')).toHaveText('old bill');
	await expect(preview.getByRole('link', { name: /\[\[Roof Photos\]\]/ })).toHaveAttribute('href', /\/vault\/[^/]+\/note\/References\/Roof%20Photos\.md$/);
	await expect(preview.locator('.wikilink').filter({ hasText: '[[Missing Alias]]' })).toHaveCount(1);
	await expect(preview.locator('blockquote')).toContainText('Refer homeowner questions');
	await expect(preview.locator('.preview-callout')).toContainText('tip');
	await expect(preview.locator('.preview-callout')).toContainText('Site survey');
	await expect(preview.locator('.preview-callout mark')).toHaveText('main panel');
	await expect(preview.locator('table')).toContainText('Step');
	await expect(preview.locator('table')).toContainText('Owner');
	await expect(preview.locator('table th').nth(0)).toHaveCSS('text-align', 'left');
	await expect(preview.locator('table th').nth(1)).toHaveCSS('text-align', 'right');
	await expect(preview.locator('table td').nth(1)).toHaveCSS('text-align', 'right');
	await expect(preview.locator('table .wikilink')).toHaveText('[[Sandy]]');
	await expect(preview.locator('table strong')).toHaveText('Panel');
	await expect(preview.locator('table mark')).toHaveText('Runner');
	await expect(preview.locator('table')).toContainText('Utility | meter');
	await expect(preview.locator('table')).toContainText('Main | exterior');
	await expect(preview.locator('table')).not.toContainText('Utility \\| meter');
	await expect(preview.locator('pre')).toContainText('main panel');
	await expect(page.locator('.canvas-node-text textarea')).toHaveValue(/# Launch plan/);
	await preview.getByRole('link', { name: /\[\[Launch link\]\]/ }).click();
	await expect(page.getByRole('tab', { name: /Launch link/ })).toHaveAttribute('aria-selected', 'true');
	await expect(page.locator('.note-view')).toContainText('Home details.');
});

test('canvas view renders and creates Obsidian Canvas groups', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'canvas-group-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Board.canvas'), JSON.stringify({
		nodes: [
			{ id: 'group-a', type: 'group', x: -40, y: -30, width: 560, height: 240, label: 'Research cluster', color: '5' },
			{ id: 'note-a', type: 'text', x: 20, y: 40, width: 220, height: 120, text: 'Inside the group' }
		],
		edges: []
	}, null, 2));

	const created = await request.post('/api/vaults', {
		data: { name: 'Canvas Group Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	const loaded = await request.get(`/api/vaults/${vault.id}/canvas?path=${encodeURIComponent('Board.canvas')}`);
	expect(loaded.ok()).toBe(true);
	const before = await loaded.json() as CanvasDoc;
	expect(before.nodes.find((node) => node.id === 'group-a')).toMatchObject({
		type: 'group',
		label: 'Research cluster',
		color: '5'
	});

	await page.goto(`/vault/${vault.id}/canvas/${encodeURI('Board.canvas')}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.canvas-view')).toBeVisible({ timeout: 5_000 });
	await expect(page.locator('.canvas-node-group').filter({ hasText: 'Research cluster' })).toBeVisible();
	await expect(page.locator('.canvas-node-group').first()).toHaveAttribute('style', /--canvas-node-border: #0891b2/);
	await expect(page.locator('.canvas-node-text textarea')).toHaveValue('Inside the group');
	await expect(page.getByLabel('Canvas edge source')).not.toContainText('Research cluster');

	const groupCard = page.locator('.canvas-node-group').filter({ hasText: 'Research cluster' }).first();
	await groupCard.getByLabel('Canvas group label for Research cluster').fill('Renamed research cluster');
	await groupCard.getByRole('button', { name: 'Save label' }).click();
	await expect(page.locator('.canvas-node-group').filter({ hasText: 'Renamed research cluster' })).toBeVisible();
	await expect.poll(async () => {
		const saved = await request.get(`/api/vaults/${vault.id}/canvas?path=${encodeURIComponent('Board.canvas')}`);
		const body = await saved.json() as CanvasDoc;
		return body.nodes.find((node) => node.id === 'group-a')?.label;
	}).toBe('Renamed research cluster');

	const exported = await request.get(`/api/vaults/${vault.id}/canvas/export?path=${encodeURIComponent('Board.canvas')}`);
	expect(exported.ok()).toBe(true);
	const svg = await exported.text();
	expect(svg).toContain('node-group');
	expect(svg).toContain('Renamed research cluster');
	expect(svg).toContain('stroke-dasharray');

	await page.getByLabel('Canvas node type').selectOption('group');
	await page.getByLabel('Canvas node value').fill('Follow-up zone');
	await page.getByRole('button', { name: 'Add group' }).click();
	await expect(page.locator('.canvas-view')).toContainText('3 nodes · 0 edges · editable text cards');
	await expect(page.locator('.canvas-node-group').filter({ hasText: 'Follow-up zone' })).toBeVisible();

	await expect.poll(async () => {
		const saved = await request.get(`/api/vaults/${vault.id}/canvas?path=${encodeURIComponent('Board.canvas')}`);
		const body = await saved.json() as CanvasDoc;
		return body.nodes.some((node) => node.type === 'group' && node.label === 'Follow-up zone');
	}).toBe(true);
	await expect.poll(() => gitStatus(vaultDir)).toBe('');
});

test('canvas file cards route notes with subpaths, Canvas files, and vault assets explicitly', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'canvas-file-routing-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(path.join(vaultDir, 'Images'), { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), [
		'---',
		'title: Launch Home',
		'---',
		'# Home',
		'Intro with [[Nested Note|nested note]].',
		'',
		'## Markdown target',
		'',
		'Target section'
	].join('\n'));
	fs.writeFileSync(path.join(vaultDir, 'Nested Note.md'), '# Nested Note\n\nPreview target\n');
	fs.writeFileSync(path.join(vaultDir, 'Nested.canvas'), JSON.stringify({
		nodes: [{ id: 'nested-a', type: 'text', x: 0, y: 0, width: 220, height: 120, text: 'Nested Canvas card' }],
		edges: []
	}, null, 2));
	fs.writeFileSync(path.join(vaultDir, 'Images', 'roof.svg'), [
		'<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90">',
		'<rect width="160" height="90" fill="#0f766e"/>',
		'<path d="M20 62 L80 24 L140 62 Z" fill="#f8fafc"/>',
		'</svg>'
	].join(''));
	fs.writeFileSync(path.join(vaultDir, 'Board.canvas'), JSON.stringify({
		nodes: [
			{ id: 'a', type: 'text', x: 0, y: 0, width: 220, height: 120, text: 'Routing board' },
			{ id: 'b', type: 'file', x: 280, y: 0, width: 220, height: 110, file: 'Home.md', subpath: '#Markdown target' },
			{ id: 'c', type: 'file', x: 560, y: 0, width: 220, height: 110, file: 'Nested.canvas' },
			{ id: 'd', type: 'file', x: 840, y: 0, width: 240, height: 220, file: 'Images/roof.svg' }
		],
		edges: []
	}, null, 2));

	const created = await request.post('/api/vaults', {
		data: { name: 'Canvas File Routing Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	const previews = await request.post(`/api/vaults/${vault.id}/canvas/note-previews`, {
		data: { paths: ['Home.md', 'Missing.md', 'Images/roof.svg', '../secret.md'] }
	});
	expect(previews.ok(), await previews.text()).toBe(true);
	const previewBody = await previews.json() as {
		previews: { path: string; title: string; body: string; status: string; detail?: string; truncated: boolean }[];
	};
	expect(previewBody.previews.find((preview) => preview.path === 'Home.md')).toMatchObject({
		title: 'Launch Home',
		status: 'ok',
		truncated: false
	});
	expect(previewBody.previews.find((preview) => preview.path === 'Home.md')?.body).toContain('Target section');
	expect(previewBody.previews.find((preview) => preview.path === 'Missing.md')?.status).toBe('missing');
	expect(previewBody.previews.find((preview) => preview.path === 'Images/roof.svg')?.status).toBe('unsupported');
	expect(previewBody.previews.find((preview) => preview.path === '../secret.md')?.status).toBe('invalid');

	await page.goto(`/vault/${vault.id}/canvas/${encodeURI('Board.canvas')}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.canvas-view')).toBeVisible({ timeout: 5_000 });
	await expect(page.getByRole('button', { name: 'Open canvas file node Home.md' })).toHaveText('Open note');
	await expect(page.getByLabel('Canvas file subpath for Home.md')).toHaveValue('#Markdown target');
	const notePreview = page.getByLabel('Canvas note preview Home.md');
	await expect(notePreview).toContainText('Target section');
	await expect(notePreview.getByRole('link', { name: '[[nested note]]' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Open canvas file node Nested.canvas' })).toHaveText('Open Canvas');
	await expect(page.getByRole('img', { name: 'Canvas file preview Images/roof.svg' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Preview raw canvas asset Images/roof.svg' })).toHaveAttribute('href', /\/api\/vaults\/[^/]+\/raw\/Images\/roof\.svg$/);
	await expect(page.getByRole('link', { name: 'Open raw canvas asset Images/roof.svg' })).toHaveText('Open image');

	await page.getByRole('button', { name: 'Open canvas file node Home.md' }).click();
	await expect(page.getByRole('tab', { name: /Home/ })).toHaveAttribute('aria-selected', 'true');
	await expect(page.locator('.note-view')).toContainText('Markdown target');
	expect(new URL(page.url()).hash).toBe('#markdown-target');

	await page.getByRole('tab', { name: /Board/ }).click();
	await expect(page.locator('.canvas-node-text textarea')).toHaveValue('Routing board');
	await page.getByRole('button', { name: 'Open canvas file node Nested.canvas' }).click();
	await expect(page.getByRole('tab', { name: /Nested/ })).toHaveAttribute('aria-selected', 'true');
	await expect(page.locator('.canvas-node-text textarea')).toHaveValue('Nested Canvas card');
});

test('canvas API exports a safe SVG snapshot', async ({ request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'canvas-export-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n');
	fs.writeFileSync(path.join(vaultDir, 'Export.canvas'), JSON.stringify({
		nodes: [
			{ id: 'a', type: 'text', x: 0, y: 0, width: 260, height: 140, text: 'Canvas <script>alert(1)</script> & text' },
			{ id: 'b', type: 'file', x: 340, y: 50, width: 220, height: 100, file: 'Home.md', color: '4' }
		],
		edges: [{ id: 'edge-a-b', fromNode: 'a', fromSide: 'right', fromEnd: 'arrow', toNode: 'b', toSide: 'left', label: 'opens <bad>', color: '#0ea5e9' }]
	}, null, 2));

	const created = await request.post('/api/vaults', {
		data: { name: 'Canvas Export Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	const exported = await request.get(`/api/vaults/${vault.id}/canvas/export?path=${encodeURIComponent('Export.canvas')}`);
	expect(exported.ok()).toBe(true);
	expect(exported.headers()['content-type']).toContain('image/svg+xml');
	expect(exported.headers()['content-disposition']).toContain('Export.svg');
	const svg = await exported.text();
	expect(svg).toContain('<svg');
	expect(svg).toContain('Canvas export');
	expect(svg).toContain('Home.md');
	expect(svg).toContain('fill="#dcfce7"');
	expect(svg).toContain('stroke="#16a34a"');
	expect(svg).toContain('stroke="#0ea5e9"');
	expect(svg).toContain('x1="340" y1="150" x2="420" y2="205"');
	expect(svg).toMatch(/<marker id="canvas-edge-edge-a-b-[a-z0-9]+-from"/);
	expect(svg).toMatch(/<marker id="canvas-edge-edge-a-b-[a-z0-9]+-to"/);
	expect(svg).toMatch(/marker-start="url\(#canvas-edge-edge-a-b-[a-z0-9]+-from\)"/);
	expect(svg).toMatch(/marker-end="url\(#canvas-edge-edge-a-b-[a-z0-9]+-to\)"/);
	expect(svg).toContain('opens &lt;bad&gt;');
	expect(svg).toContain('Canvas &lt;script&gt;alert(1)&lt;/script&gt;');
	expect(svg).toContain('&amp; text');
	expect(svg).not.toContain('<script>');
	expect(fs.existsSync(path.join(vaultDir, '.git'))).toBe(false);
	expect(fs.existsSync(path.join(vaultDir, 'Export.canvas'))).toBe(true);
});

test('canvas API adds, edits, moves, and deletes cards with clean git commits and stale guards', async ({ request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'canvas-edit-api-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n');
	fs.writeFileSync(path.join(vaultDir, 'Board.canvas'), canvasJson);

	const created = await request.post('/api/vaults', {
		data: { name: 'Canvas Edit API Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	const loaded = await request.get(`/api/vaults/${vault.id}/canvas?path=${encodeURIComponent('Board.canvas')}`);
	const before = await loaded.json() as CanvasDoc;

	const edited = await request.post(`/api/vaults/${vault.id}/canvas`, {
		data: {
			path: 'Board.canvas',
			action: 'update-node-text',
			nodeId: 'a',
			text: 'Edited text card',
			expectedRevision: before.revision
		}
	});
	expect(edited.ok()).toBe(true);
	const editedBody = await edited.json() as { sha: string | null; doc: CanvasDoc };
	expect(editedBody.sha).toBeTruthy();
	expect(editedBody.doc.nodes.find((node) => node.id === 'a')?.text).toBe('Edited text card');
	expect(gitStatus(vaultDir)).toBe('');

	const stale = await request.post(`/api/vaults/${vault.id}/canvas`, {
		data: {
			path: 'Board.canvas',
			action: 'update-node-text',
			nodeId: 'a',
			text: 'Stale edit',
			expectedRevision: before.revision
		}
	});
	expect(stale.status()).toBe(409);

	const added = await request.post(`/api/vaults/${vault.id}/canvas`, {
		data: {
			path: 'Board.canvas',
			action: 'add-text-node',
			text: 'Follow-up idea',
			expectedRevision: editedBody.doc.revision
		}
	});
	expect(added.ok()).toBe(true);
	const addedBody = await added.json() as { sha: string | null; doc: CanvasDoc };
	expect(addedBody.sha).toBeTruthy();
	expect(addedBody.doc.nodes).toHaveLength(3);
	expect(addedBody.doc.nodes.some((node) => node.type === 'text' && node.text === 'Follow-up idea')).toBe(true);
	expect(gitStatus(vaultDir)).toBe('');

	const fileAdded = await request.post(`/api/vaults/${vault.id}/canvas`, {
		data: {
			path: 'Board.canvas',
			action: 'add-node',
			nodeType: 'file',
			file: 'Home.md',
			expectedRevision: addedBody.doc.revision
		}
	});
	expect(fileAdded.ok(), await fileAdded.text()).toBe(true);
	const fileAddedBody = await fileAdded.json() as { sha: string | null; doc: CanvasDoc };
	expect(fileAddedBody.sha).toBeTruthy();
	expect(fileAddedBody.doc.nodes.some((node) => node.type === 'file' && node.file === 'Home.md')).toBe(true);
	expect(gitStatus(vaultDir)).toBe('');

	const linkAdded = await request.post(`/api/vaults/${vault.id}/canvas`, {
		data: {
			path: 'Board.canvas',
			action: 'add-node',
			nodeType: 'link',
			url: 'https://example.com/research',
			expectedRevision: fileAddedBody.doc.revision
		}
	});
	expect(linkAdded.ok(), await linkAdded.text()).toBe(true);
	const linkAddedBody = await linkAdded.json() as { sha: string | null; doc: CanvasDoc };
	expect(linkAddedBody.sha).toBeTruthy();
	expect(linkAddedBody.doc.nodes.some((node) => node.type === 'link' && node.url === 'https://example.com/research')).toBe(true);
	expect(gitStatus(vaultDir)).toBe('');

	const groupAdded = await request.post(`/api/vaults/${vault.id}/canvas`, {
		data: {
			path: 'Board.canvas',
			action: 'add-node',
			nodeType: 'group',
			label: 'API group',
			expectedRevision: linkAddedBody.doc.revision
		}
	});
	expect(groupAdded.ok(), await groupAdded.text()).toBe(true);
	const groupAddedBody = await groupAdded.json() as { sha: string | null; doc: CanvasDoc };
	expect(groupAddedBody.sha).toBeTruthy();
	const addedGroupNode = groupAddedBody.doc.nodes.find((node) => node.type === 'group' && node.label === 'API group');
	expect(addedGroupNode).toBeTruthy();
	expect(gitStatus(vaultDir)).toBe('');

	const groupUpdated = await request.post(`/api/vaults/${vault.id}/canvas`, {
		data: {
			path: 'Board.canvas',
			action: 'update-group-label',
			nodeId: addedGroupNode?.id,
			label: 'Renamed API group',
			expectedRevision: groupAddedBody.doc.revision
		}
	});
	expect(groupUpdated.ok(), await groupUpdated.text()).toBe(true);
	const groupUpdatedBody = await groupUpdated.json() as { sha: string | null; doc: CanvasDoc };
	expect(groupUpdatedBody.sha).toBeTruthy();
	expect(groupUpdatedBody.doc.nodes.find((node) => node.id === addedGroupNode?.id)).toMatchObject({
		type: 'group',
		label: 'Renamed API group'
	});
	expect(gitStatus(vaultDir)).toBe('');

	const duplicated = await request.post(`/api/vaults/${vault.id}/canvas`, {
		data: {
			path: 'Board.canvas',
			action: 'duplicate-node',
			nodeId: 'a',
			expectedRevision: groupUpdatedBody.doc.revision
		}
	});
	expect(duplicated.ok(), await duplicated.text()).toBe(true);
	const duplicatedBody = await duplicated.json() as { sha: string | null; doc: CanvasDoc };
	expect(duplicatedBody.sha).toBeTruthy();
	const duplicatedTextNode = duplicatedBody.doc.nodes.find((node) => node.id !== 'a' && node.type === 'text' && node.text === 'Edited text card');
	expect(duplicatedTextNode).toMatchObject({
		x: 40,
		y: 40,
		width: 220,
		height: 120,
		color: '1'
	});
	expect(gitStatus(vaultDir)).toBe('');

	const addedFileNode = duplicatedBody.doc.nodes.find((node) => node.type === 'file' && node.id !== 'b' && node.file === 'Home.md');
	expect(addedFileNode).toBeTruthy();
	const fileUpdated = await request.post(`/api/vaults/${vault.id}/canvas`, {
		data: {
			path: 'Board.canvas',
			action: 'update-node-reference',
			nodeId: addedFileNode?.id,
			file: 'References/Home.md',
			subpath: '#Install Steps',
			label: 'Home reference',
			expectedRevision: duplicatedBody.doc.revision
		}
	});
	expect(fileUpdated.ok(), await fileUpdated.text()).toBe(true);
	const fileUpdatedBody = await fileUpdated.json() as { sha: string | null; doc: CanvasDoc };
	expect(fileUpdatedBody.sha).toBeTruthy();
	expect(fileUpdatedBody.doc.nodes.find((node) => node.id === addedFileNode?.id)).toMatchObject({
		type: 'file',
		file: 'References/Home.md',
		subpath: '#Install Steps',
		label: 'Home reference'
	});
	expect(gitStatus(vaultDir)).toBe('');

	const invalidFileSubpath = await request.post(`/api/vaults/${vault.id}/canvas`, {
		data: {
			path: 'Board.canvas',
			action: 'update-node-reference',
			nodeId: addedFileNode?.id,
			file: 'References/Home.md',
			subpath: 'Install Steps',
			label: 'Home reference',
			expectedRevision: fileUpdatedBody.doc.revision
		}
	});
	expect(invalidFileSubpath.status()).toBe(400);
	expect(gitStatus(vaultDir)).toBe('');

	const clearedFileSubpath = await request.post(`/api/vaults/${vault.id}/canvas`, {
		data: {
			path: 'Board.canvas',
			action: 'update-node-reference',
			nodeId: addedFileNode?.id,
			file: 'References/Home.md',
			subpath: '',
			label: 'Home reference',
			expectedRevision: fileUpdatedBody.doc.revision
		}
	});
	expect(clearedFileSubpath.ok(), await clearedFileSubpath.text()).toBe(true);
	const clearedFileSubpathBody = await clearedFileSubpath.json() as { sha: string | null; doc: CanvasDoc };
	expect(clearedFileSubpathBody.sha).toBeTruthy();
	expect(clearedFileSubpathBody.doc.nodes.find((node) => node.id === addedFileNode?.id)).toMatchObject({
		type: 'file',
		file: 'References/Home.md',
		label: 'Home reference'
	});
	expect(clearedFileSubpathBody.doc.nodes.find((node) => node.id === addedFileNode?.id)?.subpath).toBeUndefined();
	expect(gitStatus(vaultDir)).toBe('');

	const addedLinkNode = clearedFileSubpathBody.doc.nodes.find((node) => node.type === 'link' && node.url === 'https://example.com/research');
	expect(addedLinkNode).toBeTruthy();
	const linkUpdated = await request.post(`/api/vaults/${vault.id}/canvas`, {
		data: {
			path: 'Board.canvas',
			action: 'update-node-reference',
			nodeId: addedLinkNode?.id,
			url: 'https://example.com/updated',
			label: 'Updated research',
			expectedRevision: clearedFileSubpathBody.doc.revision
		}
	});
	expect(linkUpdated.ok(), await linkUpdated.text()).toBe(true);
	const linkUpdatedBody = await linkUpdated.json() as { sha: string | null; doc: CanvasDoc };
	expect(linkUpdatedBody.sha).toBeTruthy();
	expect(linkUpdatedBody.doc.nodes.find((node) => node.id === addedLinkNode?.id)).toMatchObject({
		type: 'link',
		url: 'https://example.com/updated',
		label: 'Updated research'
	});
	expect(gitStatus(vaultDir)).toBe('');

	const moved = await request.post(`/api/vaults/${vault.id}/canvas`, {
		data: {
			path: 'Board.canvas',
			action: 'move-node',
			nodeId: 'b',
			x: 440,
			y: 120,
			expectedRevision: linkUpdatedBody.doc.revision
		}
	});
	expect(moved.ok()).toBe(true);
	const movedBody = await moved.json() as { sha: string | null; doc: CanvasDoc };
	expect(movedBody.sha).toBeTruthy();
	expect(movedBody.doc.nodes.find((node) => node.id === 'b')).toMatchObject({ x: 440, y: 120 });
	expect(gitStatus(vaultDir)).toBe('');

	const resized = await request.post(`/api/vaults/${vault.id}/canvas`, {
		data: {
			path: 'Board.canvas',
			action: 'resize-node',
			nodeId: 'b',
			width: 310,
			height: 190,
			expectedRevision: movedBody.doc.revision
		}
	});
	expect(resized.ok(), await resized.text()).toBe(true);
	const resizedBody = await resized.json() as { sha: string | null; doc: CanvasDoc };
	expect(resizedBody.sha).toBeTruthy();
	expect(resizedBody.doc.nodes.find((node) => node.id === 'b')).toMatchObject({ width: 310, height: 190 });
	expect(gitStatus(vaultDir)).toBe('');

	const clamped = await request.post(`/api/vaults/${vault.id}/canvas`, {
		data: {
			path: 'Board.canvas',
			action: 'resize-node',
			nodeId: 'b',
			width: 20,
			height: 20,
			expectedRevision: resizedBody.doc.revision
		}
	});
	expect(clamped.ok(), await clamped.text()).toBe(true);
	const clampedBody = await clamped.json() as { sha: string | null; doc: CanvasDoc };
	expect(clampedBody.doc.nodes.find((node) => node.id === 'b')).toMatchObject({ width: 140, height: 150 });
	expect(gitStatus(vaultDir)).toBe('');

	const coloredNode = await request.post(`/api/vaults/${vault.id}/canvas`, {
		data: {
			path: 'Board.canvas',
			action: 'update-node-color',
			nodeId: 'b',
			color: 'green',
			expectedRevision: clampedBody.doc.revision
		}
	});
	expect(coloredNode.ok(), await coloredNode.text()).toBe(true);
	const coloredNodeBody = await coloredNode.json() as { sha: string | null; doc: CanvasDoc };
	expect(coloredNodeBody.sha).toBeTruthy();
	expect(coloredNodeBody.doc.nodes.find((node) => node.id === 'b')).toMatchObject({ color: '4' });
	expect(gitStatus(vaultDir)).toBe('');

	const clearedNodeColor = await request.post(`/api/vaults/${vault.id}/canvas`, {
		data: {
			path: 'Board.canvas',
			action: 'update-node-color',
			nodeId: 'b',
			color: 'default',
			expectedRevision: coloredNodeBody.doc.revision
		}
	});
	expect(clearedNodeColor.ok(), await clearedNodeColor.text()).toBe(true);
	const clearedNodeColorBody = await clearedNodeColor.json() as { sha: string | null; doc: CanvasDoc };
	expect(clearedNodeColorBody.sha).toBeTruthy();
	expect(clearedNodeColorBody.doc.nodes.find((node) => node.id === 'b')?.color).toBeUndefined();
	expect(gitStatus(vaultDir)).toBe('');

	const invalidNodeColor = await request.post(`/api/vaults/${vault.id}/canvas`, {
		data: {
			path: 'Board.canvas',
			action: 'update-node-color',
			nodeId: 'b',
			color: 'url(javascript:alert(1))',
			expectedRevision: clearedNodeColorBody.doc.revision
		}
	});
	expect(invalidNodeColor.status()).toBe(400);
	expect(gitStatus(vaultDir)).toBe('');

	const edgeAdded = await request.post(`/api/vaults/${vault.id}/canvas`, {
		data: {
			path: 'Board.canvas',
			action: 'add-edge',
			fromNode: 'b',
			toNode: 'a',
			label: 'returns',
			expectedRevision: clearedNodeColorBody.doc.revision
		}
	});
	expect(edgeAdded.ok(), await edgeAdded.text()).toBe(true);
	const edgeAddedBody = await edgeAdded.json() as { sha: string | null; doc: CanvasDoc };
	expect(edgeAddedBody.sha).toBeTruthy();
	expect(edgeAddedBody.doc.edges).toHaveLength(2);
	expect(edgeAddedBody.doc.edges.at(-1)).toMatchObject({
		fromNode: 'b',
		toNode: 'a',
		fromSide: 'right',
		toSide: 'left',
		label: 'returns'
	});
	expect(gitStatus(vaultDir)).toBe('');

	const updatedEdge = await request.post(`/api/vaults/${vault.id}/canvas`, {
		data: {
			path: 'Board.canvas',
			action: 'update-edge-label',
			edgeId: edgeAddedBody.doc.edges.at(-1)?.id,
			label: 'routes back',
			expectedRevision: edgeAddedBody.doc.revision
		}
	});
	expect(updatedEdge.ok(), await updatedEdge.text()).toBe(true);
	const updatedEdgeBody = await updatedEdge.json() as { sha: string | null; doc: CanvasDoc };
	expect(updatedEdgeBody.sha).toBeTruthy();
	expect(updatedEdgeBody.doc.edges.at(-1)).toMatchObject({ label: 'routes back' });
	expect(gitStatus(vaultDir)).toBe('');

	const coloredEdge = await request.post(`/api/vaults/${vault.id}/canvas`, {
		data: {
			path: 'Board.canvas',
			action: 'update-edge-color',
			edgeId: updatedEdgeBody.doc.edges.at(-1)?.id,
			color: '#ABC',
			expectedRevision: updatedEdgeBody.doc.revision
		}
	});
	expect(coloredEdge.ok(), await coloredEdge.text()).toBe(true);
	const coloredEdgeBody = await coloredEdge.json() as { sha: string | null; doc: CanvasDoc };
	expect(coloredEdgeBody.sha).toBeTruthy();
	expect(coloredEdgeBody.doc.edges.at(-1)).toMatchObject({ color: '#aabbcc' });
	expect(gitStatus(vaultDir)).toBe('');

	const clearedEdgeColor = await request.post(`/api/vaults/${vault.id}/canvas`, {
		data: {
			path: 'Board.canvas',
			action: 'update-edge-color',
			edgeId: coloredEdgeBody.doc.edges.at(-1)?.id,
			color: 'none',
			expectedRevision: coloredEdgeBody.doc.revision
		}
	});
	expect(clearedEdgeColor.ok(), await clearedEdgeColor.text()).toBe(true);
	const clearedEdgeColorBody = await clearedEdgeColor.json() as { sha: string | null; doc: CanvasDoc };
	expect(clearedEdgeColorBody.sha).toBeTruthy();
	expect(clearedEdgeColorBody.doc.edges.at(-1)?.color).toBeUndefined();
	expect(gitStatus(vaultDir)).toBe('');

	const invalidEdgeColor = await request.post(`/api/vaults/${vault.id}/canvas`, {
		data: {
			path: 'Board.canvas',
			action: 'update-edge-color',
			edgeId: clearedEdgeColorBody.doc.edges.at(-1)?.id,
			color: 'url(javascript:alert(1))',
			expectedRevision: clearedEdgeColorBody.doc.revision
		}
	});
	expect(invalidEdgeColor.status()).toBe(400);
	expect(gitStatus(vaultDir)).toBe('');

	const routedEdge = await request.post(`/api/vaults/${vault.id}/canvas`, {
		data: {
			path: 'Board.canvas',
			action: 'update-edge-routing',
			edgeId: clearedEdgeColorBody.doc.edges.at(-1)?.id,
			fromSide: 'top',
			toSide: 'bottom',
			fromEnd: 'arrow',
			toEnd: 'none',
			expectedRevision: clearedEdgeColorBody.doc.revision
		}
	});
	expect(routedEdge.ok(), await routedEdge.text()).toBe(true);
	const routedEdgeBody = await routedEdge.json() as { sha: string | null; doc: CanvasDoc };
	expect(routedEdgeBody.sha).toBeTruthy();
	expect(routedEdgeBody.doc.edges.at(-1)).toMatchObject({
		fromSide: 'top',
		toSide: 'bottom',
		fromEnd: 'arrow',
		toEnd: 'none'
	});
	expect(gitStatus(vaultDir)).toBe('');

	const resetRoutedEdge = await request.post(`/api/vaults/${vault.id}/canvas`, {
		data: {
			path: 'Board.canvas',
			action: 'update-edge-routing',
			edgeId: routedEdgeBody.doc.edges.at(-1)?.id,
			fromSide: 'center',
			toSide: 'center',
			fromEnd: 'none',
			toEnd: 'arrow',
			expectedRevision: routedEdgeBody.doc.revision
		}
	});
	expect(resetRoutedEdge.ok(), await resetRoutedEdge.text()).toBe(true);
	const resetRoutedEdgeBody = await resetRoutedEdge.json() as { sha: string | null; doc: CanvasDoc };
	expect(resetRoutedEdgeBody.sha).toBeTruthy();
	expect(resetRoutedEdgeBody.doc.edges.at(-1)).toMatchObject({
		fromNode: 'b',
		toNode: 'a',
		label: 'routes back'
	});
	expect(resetRoutedEdgeBody.doc.edges.at(-1)?.fromSide).toBeUndefined();
	expect(resetRoutedEdgeBody.doc.edges.at(-1)?.toSide).toBeUndefined();
	expect(resetRoutedEdgeBody.doc.edges.at(-1)?.fromEnd).toBeUndefined();
	expect(resetRoutedEdgeBody.doc.edges.at(-1)?.toEnd).toBeUndefined();
	expect(gitStatus(vaultDir)).toBe('');

	const invalidEdgeRoute = await request.post(`/api/vaults/${vault.id}/canvas`, {
		data: {
			path: 'Board.canvas',
			action: 'update-edge-routing',
			edgeId: resetRoutedEdgeBody.doc.edges.at(-1)?.id,
			fromSide: 'sideways',
			toSide: 'left',
			fromEnd: 'none',
			toEnd: 'arrow',
			expectedRevision: resetRoutedEdgeBody.doc.revision
		}
	});
	expect(invalidEdgeRoute.status()).toBe(400);
	expect(gitStatus(vaultDir)).toBe('');

	const clearedEdge = await request.post(`/api/vaults/${vault.id}/canvas`, {
		data: {
			path: 'Board.canvas',
			action: 'update-edge-label',
			edgeId: resetRoutedEdgeBody.doc.edges.at(-1)?.id,
			label: '   ',
			expectedRevision: resetRoutedEdgeBody.doc.revision
		}
	});
	expect(clearedEdge.ok(), await clearedEdge.text()).toBe(true);
	const clearedEdgeBody = await clearedEdge.json() as { sha: string | null; doc: CanvasDoc };
	expect(clearedEdgeBody.sha).toBeTruthy();
	expect(clearedEdgeBody.doc.edges.at(-1)?.label).toBeUndefined();
	expect(gitStatus(vaultDir)).toBe('');

	const deletedEdge = await request.post(`/api/vaults/${vault.id}/canvas`, {
		data: {
			path: 'Board.canvas',
			action: 'delete-edge',
			edgeId: clearedEdgeBody.doc.edges.at(-1)?.id,
			expectedRevision: clearedEdgeBody.doc.revision
		}
	});
	expect(deletedEdge.ok(), await deletedEdge.text()).toBe(true);
	const deletedEdgeBody = await deletedEdge.json() as { sha: string | null; doc: CanvasDoc };
	expect(deletedEdgeBody.sha).toBeTruthy();
	expect(deletedEdgeBody.doc.edges).toHaveLength(1);
	expect(deletedEdgeBody.doc.edges.some((edge) => edge.label === 'returns')).toBe(false);
	expect(gitStatus(vaultDir)).toBe('');

	const deletedNode = await request.post(`/api/vaults/${vault.id}/canvas`, {
		data: {
			path: 'Board.canvas',
			action: 'delete-node',
			nodeId: 'b',
			expectedRevision: deletedEdgeBody.doc.revision
		}
	});
	expect(deletedNode.ok(), await deletedNode.text()).toBe(true);
	const deletedNodeBody = await deletedNode.json() as { sha: string | null; doc: CanvasDoc };
	expect(deletedNodeBody.sha).toBeTruthy();
	expect(deletedNodeBody.doc.nodes.some((node) => node.id === 'b')).toBe(false);
	expect(deletedNodeBody.doc.edges.some((edge) => edge.fromNode === 'b' || edge.toNode === 'b')).toBe(false);
	expect(gitStatus(vaultDir)).toBe('');

	const raw = JSON.parse(fs.readFileSync(path.join(vaultDir, 'Board.canvas'), 'utf-8')) as {
		nodes: { id?: string; type?: string; text?: string; file?: string; subpath?: string; url?: string; label?: string; x?: number; y?: number }[];
		edges: { fromNode?: string; toNode?: string; label?: string }[];
	};
	expect(raw.nodes.some((node) => node.text === 'Edited text card')).toBe(true);
	expect(raw.nodes.filter((node) => node.text === 'Edited text card')).toHaveLength(2);
	expect(raw.nodes.some((node) => node.text === 'Follow-up idea')).toBe(true);
	expect(raw.nodes.some((node) => node.type === 'group' && node.label === 'Renamed API group')).toBe(true);
	expect(raw.nodes.some((node) => node.file === 'References/Home.md' && node.label === 'Home reference')).toBe(true);
	expect(raw.nodes.some((node) => node.file === 'References/Home.md' && node.subpath)).toBe(false);
	expect(raw.nodes.some((node) => node.url === 'https://example.com/updated' && node.label === 'Updated research')).toBe(true);
	expect(raw.nodes.some((node) => node.id === 'b')).toBe(false);
	expect(raw.edges.some((edge) => edge.fromNode === 'b' || edge.toNode === 'b')).toBe(false);
	expect(raw.edges.some((edge) => edge.fromNode === 'b' && edge.toNode === 'a' && edge.label === 'returns')).toBe(false);
	expect(raw.edges.some((edge) => edge.fromNode === 'b' && edge.toNode === 'a' && edge.label === 'routes back')).toBe(false);
});

test('canvas view adds text, file, and URL cards from the board', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'canvas-edit-ui-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n');
	fs.writeFileSync(path.join(vaultDir, 'Board.canvas'), canvasJson);

	const created = await request.post('/api/vaults', {
		data: { name: 'Canvas Edit UI Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	await page.goto(`/vault/${vault.id}/canvas/${encodeURI('Board.canvas')}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.canvas-view')).toBeVisible({ timeout: 5_000 });
	await page.getByRole('button', { name: 'Set canvas node Home.md color cyan' }).click();
	await expect(page.getByText('Canvas node color saved')).toBeVisible({ timeout: 10_000 });
	await expect.poll(async () => {
		const loaded = await request.get(`/api/vaults/${vault.id}/canvas?path=${encodeURIComponent('Board.canvas')}`);
		const body = await loaded.json() as CanvasDoc;
		return body.nodes.find((node) => node.id === 'b')?.color;
	}).toBe('5');

	await page.getByRole('button', { name: 'Duplicate canvas node Home.md' }).click();
	await expect(page.getByText('Canvas node duplicated')).toBeVisible({ timeout: 10_000 });
	await expect(page.locator('.canvas-view')).toContainText('3 nodes · 1 edge · editable text cards');
	await expect(page.locator('.canvas-node-file').filter({ hasText: 'Home.md' })).toHaveCount(2);

	await page.getByRole('button', { name: 'Add text' }).click();
	await expect(page.locator('.canvas-view')).toContainText('4 nodes · 1 edge · editable text cards');

	await page.getByLabel('Canvas node type').selectOption('file');
	await page.getByLabel('Canvas node value').fill('Home.md');
	await page.getByRole('button', { name: 'Add file' }).click();
	await expect(page.locator('.canvas-view')).toContainText('5 nodes · 1 edge · editable text cards');
	await expect(page.locator('.canvas-node-file').filter({ hasText: 'Home.md' })).toHaveCount(3);

	await page.getByLabel('Canvas node type').selectOption('link');
	await page.getByLabel('Canvas node value').fill('https://example.com/research');
	await page.getByRole('button', { name: 'Add URL' }).click();
	await expect(page.locator('.canvas-view')).toContainText('6 nodes · 1 edge · editable text cards');
	await expect(page.locator('.canvas-node-link').filter({ hasText: 'https://example.com/research' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Open canvas URL node https://example.com/research' })).toHaveAttribute(
		'href',
		'https://example.com/research'
	);

	const addedFileCard = page.locator('.canvas-node-file').filter({ hasText: 'Home.md' }).last();
	await addedFileCard.getByLabel('Canvas file path for Home.md').fill('References/Home.md');
	await addedFileCard.getByLabel('Canvas file subpath for Home.md').fill('#Install Steps');
	await addedFileCard.getByLabel('Canvas label for Home.md').fill('Home reference');
	const saveFileButton = addedFileCard.getByRole('button', { name: 'Save canvas file node Home.md' });
	await expect(saveFileButton).toBeEnabled();
	await saveFileButton.click();
	await expect(page.locator('.canvas-node-file').filter({ hasText: 'Home reference' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Open canvas file node Home reference' })).toBeVisible();

	const linkCard = page.locator('.canvas-node-link').filter({ hasText: 'https://example.com/research' });
	await linkCard.getByLabel('Canvas URL target for https://example.com/research').fill('https://example.com/updated');
	await linkCard.getByLabel('Canvas label for https://example.com/research').fill('Updated research');
	const saveUrlButton = linkCard.getByRole('button', { name: 'Save canvas URL node https://example.com/research' });
	await expect(saveUrlButton).toBeEnabled();
	await saveUrlButton.click();
	await expect(page.locator('.canvas-node-link').filter({ hasText: 'Updated research' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Open canvas URL node Updated research' })).toHaveAttribute(
		'href',
		'https://example.com/updated'
	);

	const firstCard = page.locator('.canvas-node-text').first();
	const editor = firstCard.locator('textarea');
	await expect(editor).toBeVisible();
	await editor.fill('Edited through UI');
	const saveButton = firstCard.getByRole('button', { name: 'Save text' });
	await expect(saveButton).toBeEnabled();
	await saveButton.click();
	await expect(saveButton).toBeDisabled({ timeout: 10_000 });
	await expect(editor).toHaveValue('Edited through UI');

	await expect.poll(async () => {
		const loaded = await request.get(`/api/vaults/${vault.id}/canvas?path=${encodeURIComponent('Board.canvas')}`);
		const body = await loaded.json() as CanvasDoc;
		return {
			text: body.nodes.find((node) => node.id === 'a')?.text,
			homeColor: body.nodes.find((node) => node.id === 'b')?.color,
			homeFileNodes: body.nodes.filter((node) => node.type === 'file' && node.file === 'Home.md').length,
			hasFile: body.nodes.some((node) => node.type === 'file' && node.file === 'Home.md'),
			hasEditedFile: body.nodes.some((node) => node.type === 'file' && node.file === 'References/Home.md' && node.subpath === '#Install Steps' && node.label === 'Home reference'),
			hasEditedLink: body.nodes.some((node) => node.type === 'link' && node.url === 'https://example.com/updated' && node.label === 'Updated research')
		};
	}).toEqual({ text: 'Edited through UI', homeColor: '5', homeFileNodes: 2, hasFile: true, hasEditedFile: true, hasEditedLink: true });
	await expect.poll(() => gitStatus(vaultDir)).toBe('');
});

test('canvas view adds, edits, and removes labeled edges between nodes', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'canvas-edge-ui-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n');
	fs.writeFileSync(path.join(vaultDir, 'Board.canvas'), canvasJson);

	const created = await request.post('/api/vaults', {
		data: { name: 'Canvas Edge UI Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	await page.goto(`/vault/${vault.id}/canvas/${encodeURI('Board.canvas')}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.canvas-view')).toBeVisible({ timeout: 5_000 });
	await page.getByRole('button', { name: 'Set canvas edge text to Home.md: opens color green' }).click();
	await expect(page.getByText('Canvas edge color saved')).toBeVisible({ timeout: 10_000 });
	await expect.poll(async () => {
		const loaded = await request.get(`/api/vaults/${vault.id}/canvas?path=${encodeURIComponent('Board.canvas')}`);
		const body = await loaded.json() as CanvasDoc;
		return body.edges.find((edge) => edge.id === 'edge-a-b')?.color;
	}).toBe('4');
	await page.getByLabel('Canvas edge text to Home.md: opens from side').selectOption('right');
	await page.getByLabel('Canvas edge text to Home.md: opens to side').selectOption('left');
	await page.getByLabel('Canvas edge text to Home.md: opens start endpoint').selectOption('none');
	await page.getByLabel('Canvas edge text to Home.md: opens end endpoint').selectOption('arrow');
	await page.getByRole('button', { name: 'Save canvas edge routing text to Home.md: opens' }).click();
	await expect(page.getByText('Canvas edge routing saved')).toBeVisible({ timeout: 10_000 });
	await expect.poll(async () => {
		const loaded = await request.get(`/api/vaults/${vault.id}/canvas?path=${encodeURIComponent('Board.canvas')}`);
		const body = await loaded.json() as CanvasDoc;
		const edge = body.edges.find((candidate) => candidate.id === 'edge-a-b');
		return edge ? {
			fromSide: edge.fromSide,
			toSide: edge.toSide,
			fromEnd: edge.fromEnd,
			toEnd: edge.toEnd
		} : null;
	}).toEqual({ fromSide: 'right', toSide: 'left', fromEnd: undefined, toEnd: undefined });

	await page.getByLabel('Canvas edge source').selectOption('b');
	await page.getByLabel('Canvas edge target').selectOption('a');
	await page.getByLabel('Canvas edge label').fill('returns');
	await page.getByRole('button', { name: 'Connect' }).click();
	await expect(page.locator('.canvas-view')).toContainText('2 nodes · 2 edges · editable text cards');
	await expect(page.locator('.edge-label').filter({ hasText: 'returns' })).toBeVisible();
	await expect(page.getByLabel('Canvas edges')).toContainText('returns');

	await expect.poll(async () => {
		const loaded = await request.get(`/api/vaults/${vault.id}/canvas?path=${encodeURIComponent('Board.canvas')}`);
		const body = await loaded.json() as CanvasDoc;
		return body.edges.some((edge) => edge.fromNode === 'b' && edge.toNode === 'a' && edge.label === 'returns');
	}).toBe(true);

	const labelInput = page.getByLabel(/Edit label for canvas edge Home\.md to text: returns/);
	await labelInput.fill('loops back');
	await page.getByRole('button', { name: /Save canvas edge Home\.md to text: returns/ }).click();
	await expect(page.locator('.edge-label').filter({ hasText: 'loops back' })).toBeVisible();
	await expect(page.getByLabel('Canvas edges')).toContainText('loops back');
	await expect.poll(async () => {
		const loaded = await request.get(`/api/vaults/${vault.id}/canvas?path=${encodeURIComponent('Board.canvas')}`);
		const body = await loaded.json() as CanvasDoc;
		return body.edges.some((edge) => edge.fromNode === 'b' && edge.toNode === 'a' && edge.label === 'loops back');
	}).toBe(true);

	await page.getByRole('button', { name: /Remove canvas edge Home\.md to text: loops back/ }).click();
	const edgeDialog = page.getByRole('alertdialog', { name: 'Remove Canvas edge' });
	await expect(edgeDialog).toBeVisible();
	await expect(edgeDialog).toContainText('Remove canvas edge "Home.md to text: loops back"?');
	await edgeDialog.getByRole('button', { name: 'Cancel' }).click();
	await expect(edgeDialog).toBeHidden();
	await expect(page.getByLabel('Canvas edges')).toContainText('loops back');
	await page.getByRole('button', { name: /Remove canvas edge Home\.md to text: loops back/ }).click();
	await expect(edgeDialog).toBeVisible();
	await edgeDialog.getByRole('button', { name: 'Remove' }).click();
	await expect(page.locator('.canvas-view')).toContainText('2 nodes · 1 edge · editable text cards');
	await expect(page.getByLabel('Canvas edges')).not.toContainText('loops back');
	await expect.poll(async () => {
		const loaded = await request.get(`/api/vaults/${vault.id}/canvas?path=${encodeURIComponent('Board.canvas')}`);
		const body = await loaded.json() as CanvasDoc;
		return body.edges.some((edge) => edge.fromNode === 'b' && edge.toNode === 'a' && edge.label === 'loops back');
	}).toBe(false);
	await expect.poll(() => gitStatus(vaultDir)).toBe('');
});

test('canvas view removes nodes and connected edges from the board', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'canvas-node-delete-ui-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n');
	fs.writeFileSync(path.join(vaultDir, 'Board.canvas'), canvasJson);

	const created = await request.post('/api/vaults', {
		data: { name: 'Canvas Node Delete UI Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	await page.goto(`/vault/${vault.id}/canvas/${encodeURI('Board.canvas')}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.canvas-view')).toBeVisible({ timeout: 5_000 });
	await expect(page.locator('.canvas-view')).toContainText('2 nodes · 1 edge · editable text cards');
	await expect(page.getByLabel('Canvas edges')).toContainText('Home.md');

	await page.getByRole('button', { name: 'Remove canvas node Home.md' }).click();
	const nodeDialog = page.getByRole('alertdialog', { name: 'Remove Canvas node' });
	await expect(nodeDialog).toBeVisible();
	await expect(nodeDialog).toContainText('Remove canvas node "Home.md"? Connected edges will also be removed.');
	await nodeDialog.getByRole('button', { name: 'Cancel' }).click();
	await expect(nodeDialog).toBeHidden();
	await expect(page.locator('.canvas-node-file').filter({ hasText: 'Home.md' })).toBeVisible();
	await page.getByRole('button', { name: 'Remove canvas node Home.md' }).click();
	await expect(nodeDialog).toBeVisible();
	await nodeDialog.getByRole('button', { name: 'Remove' }).click();
	await expect(page.locator('.canvas-view')).toContainText('1 node · 0 edges · editable text cards');
	await expect(page.locator('.canvas-node-file').filter({ hasText: 'Home.md' })).toHaveCount(0);
	await expect(page.getByLabel('Canvas edges')).toHaveCount(0);

	await expect.poll(async () => {
		const loaded = await request.get(`/api/vaults/${vault.id}/canvas?path=${encodeURIComponent('Board.canvas')}`);
		const body = await loaded.json() as CanvasDoc;
		return {
			hasHomeNode: body.nodes.some((node) => node.id === 'b'),
			edgeCount: body.edges.length
		};
	}).toEqual({ hasHomeNode: false, edgeCount: 0 });
	await expect.poll(() => gitStatus(vaultDir)).toBe('');
});

test('canvas view drags nodes and saves positions to the Canvas file', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'canvas-move-ui-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n');
	fs.writeFileSync(path.join(vaultDir, 'Board.canvas'), canvasJson);

	const created = await request.post('/api/vaults', {
		data: { name: 'Canvas Move UI Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	const loaded = await request.get(`/api/vaults/${vault.id}/canvas?path=${encodeURIComponent('Board.canvas')}`);
	const before = await loaded.json() as CanvasDoc;
	const original = before.nodes.find((node) => node.id === 'b');
	expect(original).toBeTruthy();

	await page.goto(`/vault/${vault.id}/canvas/${encodeURI('Board.canvas')}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.canvas-view')).toBeVisible({ timeout: 5_000 });
	const moveHandle = page.getByRole('button', { name: 'Move canvas node Home.md', exact: true });
	await expect(moveHandle).toBeVisible();
	const box = await moveHandle.boundingBox();
	expect(box).toBeTruthy();
	if (!box || !original) throw new Error('move handle or original node missing');

	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30, { steps: 4 });
	await page.mouse.up();
	await expect(page.getByText('Canvas node moved')).toBeVisible({ timeout: 10_000 });

	await expect.poll(async () => {
		const saved = await request.get(`/api/vaults/${vault.id}/canvas?path=${encodeURIComponent('Board.canvas')}`);
		const body = await saved.json() as CanvasDoc;
		const moved = body.nodes.find((node) => node.id === 'b');
		return moved ? { x: moved.x, y: moved.y } : null;
	}).toEqual({ x: original.x + 60, y: original.y + 30 });
	await expect.poll(() => gitStatus(vaultDir)).toBe('');
});

test('canvas view resizes nodes and saves dimensions to the Canvas file', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'canvas-resize-ui-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n');
	fs.writeFileSync(path.join(vaultDir, 'Board.canvas'), canvasJson);

	const created = await request.post('/api/vaults', {
		data: { name: 'Canvas Resize UI Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	const loaded = await request.get(`/api/vaults/${vault.id}/canvas?path=${encodeURIComponent('Board.canvas')}`);
	const before = await loaded.json() as CanvasDoc;
	const original = before.nodes.find((node) => node.id === 'b');
	expect(original).toBeTruthy();

	await page.goto(`/vault/${vault.id}/canvas/${encodeURI('Board.canvas')}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.canvas-view')).toBeVisible({ timeout: 5_000 });
	const resizeHandle = page.getByRole('button', { name: 'Resize canvas node Home.md', exact: true });
	await expect(resizeHandle).toBeVisible();
	const box = await resizeHandle.boundingBox();
	expect(box).toBeTruthy();
	if (!box || !original) throw new Error('resize handle or original node missing');

	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 45, { steps: 4 });
	await page.mouse.up();
	await expect(page.getByText('Canvas node resized')).toBeVisible({ timeout: 10_000 });

	await expect.poll(async () => {
		const saved = await request.get(`/api/vaults/${vault.id}/canvas?path=${encodeURIComponent('Board.canvas')}`);
		const body = await saved.json() as CanvasDoc;
		const resized = body.nodes.find((node) => node.id === 'b');
		return resized ? { width: resized.width, height: resized.height } : null;
	}).toEqual({ width: original.width + 80, height: original.height + 45 });
	await expect.poll(() => gitStatus(vaultDir)).toBe('');
});

test('canvas API renames, moves, and deletes Canvas files with clean git commits', async ({ request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'canvas-file-ops-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n');
	fs.writeFileSync(path.join(vaultDir, 'Board.canvas'), canvasJson);

	const created = await request.post('/api/vaults', {
		data: { name: 'Canvas File Ops Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	const renamedPath = 'Boards/Roadmap.canvas';
	const renamed = await request.patch(`/api/vaults/${vault.id}/canvas`, {
		data: { from: 'Board.canvas', to: renamedPath }
	});
	expect(renamed.ok(), await renamed.text()).toBe(true);
	const renameBody = await renamed.json() as { from: string; to: string; sha: string | null };
	expect(renameBody).toMatchObject({ from: 'Board.canvas', to: renamedPath });
	expect(renameBody.sha).toBeTruthy();
	expect(fs.existsSync(path.join(vaultDir, 'Board.canvas'))).toBe(false);
	expect(fs.existsSync(path.join(vaultDir, renamedPath))).toBe(true);
	expect(gitStatus(vaultDir)).toBe('');

	const loaded = await request.get(`/api/vaults/${vault.id}/canvas?path=${encodeURIComponent(renamedPath)}`);
	expect(loaded.ok()).toBe(true);
	const loadedBody = await loaded.json() as CanvasDoc;
	expect(loadedBody.path).toBe(renamedPath);
	expect(loadedBody.nodes).toHaveLength(2);

	const deleted = await request.delete(`/api/vaults/${vault.id}/canvas?path=${encodeURIComponent(renamedPath)}`);
	expect(deleted.ok(), await deleted.text()).toBe(true);
	const deleteBody = await deleted.json() as { path: string; sha: string | null };
	expect(deleteBody.path).toBe(renamedPath);
	expect(deleteBody.sha).toBeTruthy();
	expect(fs.existsSync(path.join(vaultDir, renamedPath))).toBe(false);
	expect(gitStatus(vaultDir)).toBe('');
});

test('canvas file context menu deletes through an in-app confirmation dialog', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'canvas-menu-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Board.canvas'), canvasJson);

	const created = await request.post('/api/vaults', {
		data: { name: 'Canvas Menu Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	await page.goto(`/vault/${vault.id}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
	const boardLink = page.locator('.tree .file-link').filter({ hasText: 'Board' }).first();
	await expect(boardLink).toBeVisible({ timeout: 10_000 });
	await boardLink.click({ button: 'right' });
	await expect(page.getByRole('menuitem', { name: /Rename/ })).toBeVisible();
	await expect(page.getByRole('menuitem', { name: /Delete Canvas/ })).toBeVisible();
	await page.getByRole('menuitem', { name: /Delete Canvas/ }).click();
	const dialog = page.getByRole('alertdialog', { name: 'Delete Canvas' });
	await expect(dialog).toBeVisible();
	await expect(dialog).toContainText('This is reversible through git history.');
	await dialog.getByRole('button', { name: 'Cancel' }).click();
	await expect(dialog).toBeHidden();
	expect(fs.existsSync(path.join(vaultDir, 'Board.canvas'))).toBe(true);

	await boardLink.click({ button: 'right' });
	await page.getByRole('menuitem', { name: /Delete Canvas/ }).click();
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: 'Delete' }).click();
	await expect.poll(() => fs.existsSync(path.join(vaultDir, 'Board.canvas'))).toBe(false);
	await expect(page.locator('.tree .file-link').filter({ hasText: 'Board' })).toHaveCount(0);
	await expect.poll(() => gitStatus(vaultDir)).toBe('');
});
