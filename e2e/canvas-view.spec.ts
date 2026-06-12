import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURE_PATHS } from './setup-fixture';
import type { CanvasDoc } from '../src/lib/types';
import {
	canvasBounds,
	canvasConnectionDraft,
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
	canvasFileOpenTarget,
	canvasFileNodePath,
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
	canvasNodeTitle,
	canvasNodesWithPosition,
	canvasSvgEdgeStroke,
	canvasSvgNodeColors,
	canvasSummary,
	canvasTextDrafts,
	edgeLines,
	canvasNodeStyle,
	nodeStyle
} from '../src/lib/canvas/view';
import {
	canvasNodeDragPosition,
	createCanvasNodeDragState,
	isCanvasNodeDragPointer,
	updateCanvasNodeDragState
} from '../src/lib/canvas/drag';

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
		const groupDrafts = canvasGroupLabelDrafts([doc.nodes[0], groupNode, doc.nodes[1]]);
		expect(canvasGroupLabelDraftFor(groupNode, groupDrafts)).toBe('Research cluster');
		expect(canvasGroupLabelChanged(groupNode, groupDrafts)).toBe(false);
		expect(canvasGroupLabelChanged(groupNode, { ...groupDrafts, group: 'Follow-up cluster' })).toBe(true);
		expect(canSaveCanvasGroupLabel(groupNode, { ...groupDrafts, group: '' })).toBe(true);
		expect(canSaveCanvasGroupLabel(doc.nodes[0], groupDrafts)).toBe(false);
		expect(canvasNodeBody(doc.nodes[0])).toBe('Hello canvas');
		expect(canvasNodeBody({ ...doc.nodes[1], label: 'Home note' })).toBe('Home.md');
		expect(canvasNodeClass(doc.nodes[0])).toBe('canvas-node canvas-node-text');
		expect(canvasDisplayColor('1')).toEqual({ accent: '#dc2626', fill: '#fee2e2', text: '#7f1d1d', label: 'red' });
		expect(canvasDisplayColor('purple')?.accent).toBe('#9333ea');
		expect(canvasDisplayColor('#ABC')).toMatchObject({ accent: '#aabbcc', fill: '#aabbcc22', label: 'custom' });
		expect(canvasDisplayColor('url(javascript:alert(1))')).toBeNull();
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
		expect(canvasNodeRefDraftFor(doc.nodes[1], refDrafts)).toEqual({ value: 'Home.md', label: '' });
		expect(canvasNodeRefDraftChanged(doc.nodes[1], refDrafts)).toBe(false);
		expect(canvasNodeRefDraftChanged(doc.nodes[1], { ...refDrafts, b: { value: 'Notes/Home.md', label: 'Home note' } })).toBe(true);
		expect(canSaveCanvasNodeRefDraft(doc.nodes[1], { ...refDrafts, b: { value: '', label: 'Home note' } })).toBe(false);
		expect(canSaveCanvasNodeRefDraft(doc.nodes[1], { ...refDrafts, b: { value: 'Notes/Home.md', label: 'Home note' } })).toBe(true);
		expect(canvasFileNodePath(doc.nodes[1])).toBe('Home.md');
		expect(canvasFileNodeTitle(doc.nodes[1])).toBe('Home');
		expect(canvasFileNodeTitle({ ...doc.nodes[1], label: 'Home note' })).toBe('Home note');
		expect(canvasFileOpenTarget(doc.nodes[1])).toEqual({
			kind: 'note',
			path: 'Home.md',
			title: 'Home',
			actionLabel: 'Open note'
		});
		expect(canvasOpenNodeLabel(doc.nodes[1])).toBe('Open canvas file node Home.md');
		expect(canOpenCanvasNode(doc.nodes[1])).toBe(true);
		const canvasFileNode = { ...doc.nodes[1], id: 'canvas-file', file: 'Boards/Ideas.canvas' };
		expect(canvasFileNodeTitle(canvasFileNode)).toBe('Ideas');
		expect(canvasFileOpenTarget(canvasFileNode)).toEqual({
			kind: 'canvas',
			path: 'Boards/Ideas.canvas',
			title: 'Ideas',
			actionLabel: 'Open Canvas'
		});
		expect(canOpenCanvasNode(canvasFileNode)).toBe(true);
		const assetFileNode = { ...doc.nodes[1], id: 'asset-file', file: 'Images/roof.png' };
		expect(canvasFileOpenTarget(assetFileNode)).toBeNull();
		expect(canOpenCanvasNode(assetFileNode)).toBe(false);
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
				description: 'text to Home.md: opens'
			}
		]);
		const edgeDrafts = canvasEdgeLabelDrafts(edgeSummaries);
		expect(canvasEdgeLabelDraftFor(edgeSummaries[0], edgeDrafts)).toBe('opens');
		expect(canvasEdgeLabelChanged(edgeSummaries[0], edgeDrafts)).toBe(false);
		expect(canvasEdgeLabelChanged(edgeSummaries[0], { ...edgeDrafts, 'edge-a-b': 'loops back' })).toBe(true);
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

	await page.goto(`/vault/${vault.id}`);
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

	await page.goto(`/vault/${vault.id}/canvas/${encodeURI('Board.canvas')}`);
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

test('canvas file cards route notes, Canvas files, and unsupported assets explicitly', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'canvas-file-routing-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(path.join(vaultDir, 'Images'), { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n\nMarkdown target\n');
	fs.writeFileSync(path.join(vaultDir, 'Nested.canvas'), JSON.stringify({
		nodes: [{ id: 'nested-a', type: 'text', x: 0, y: 0, width: 220, height: 120, text: 'Nested Canvas card' }],
		edges: []
	}, null, 2));
	fs.writeFileSync(path.join(vaultDir, 'Images', 'roof.png'), 'fake png');
	fs.writeFileSync(path.join(vaultDir, 'Board.canvas'), JSON.stringify({
		nodes: [
			{ id: 'a', type: 'text', x: 0, y: 0, width: 220, height: 120, text: 'Routing board' },
			{ id: 'b', type: 'file', x: 280, y: 0, width: 220, height: 110, file: 'Home.md' },
			{ id: 'c', type: 'file', x: 560, y: 0, width: 220, height: 110, file: 'Nested.canvas' },
			{ id: 'd', type: 'file', x: 840, y: 0, width: 220, height: 110, file: 'Images/roof.png' }
		],
		edges: []
	}, null, 2));

	const created = await request.post('/api/vaults', {
		data: { name: 'Canvas File Routing Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	await page.goto(`/vault/${vault.id}/canvas/${encodeURI('Board.canvas')}`);
	await expect(page.locator('.canvas-view')).toBeVisible({ timeout: 5_000 });
	await expect(page.getByRole('button', { name: 'Open canvas file node Home.md' })).toHaveText('Open note');
	await expect(page.getByRole('button', { name: 'Open canvas file node Nested.canvas' })).toHaveText('Open Canvas');
	await expect(page.getByRole('button', { name: 'Open canvas file node Images/roof.png' })).toBeDisabled();

	await page.getByRole('button', { name: 'Open canvas file node Home.md' }).click();
	await expect(page.getByRole('tab', { name: /Home/ })).toHaveAttribute('aria-selected', 'true');
	await expect(page.locator('.note-view')).toContainText('Markdown target');

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

	const addedFileNode = groupUpdatedBody.doc.nodes.find((node) => node.type === 'file' && node.id !== 'b' && node.file === 'Home.md');
	expect(addedFileNode).toBeTruthy();
	const fileUpdated = await request.post(`/api/vaults/${vault.id}/canvas`, {
		data: {
			path: 'Board.canvas',
			action: 'update-node-reference',
			nodeId: addedFileNode?.id,
			file: 'References/Home.md',
			label: 'Home reference',
			expectedRevision: groupUpdatedBody.doc.revision
		}
	});
	expect(fileUpdated.ok(), await fileUpdated.text()).toBe(true);
	const fileUpdatedBody = await fileUpdated.json() as { sha: string | null; doc: CanvasDoc };
	expect(fileUpdatedBody.sha).toBeTruthy();
	expect(fileUpdatedBody.doc.nodes.find((node) => node.id === addedFileNode?.id)).toMatchObject({
		type: 'file',
		file: 'References/Home.md',
		label: 'Home reference'
	});
	expect(gitStatus(vaultDir)).toBe('');

	const addedLinkNode = fileUpdatedBody.doc.nodes.find((node) => node.type === 'link' && node.url === 'https://example.com/research');
	expect(addedLinkNode).toBeTruthy();
	const linkUpdated = await request.post(`/api/vaults/${vault.id}/canvas`, {
		data: {
			path: 'Board.canvas',
			action: 'update-node-reference',
			nodeId: addedLinkNode?.id,
			url: 'https://example.com/updated',
			label: 'Updated research',
			expectedRevision: fileUpdatedBody.doc.revision
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

	const edgeAdded = await request.post(`/api/vaults/${vault.id}/canvas`, {
		data: {
			path: 'Board.canvas',
			action: 'add-edge',
			fromNode: 'b',
			toNode: 'a',
			label: 'returns',
			expectedRevision: movedBody.doc.revision
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

	const clearedEdge = await request.post(`/api/vaults/${vault.id}/canvas`, {
		data: {
			path: 'Board.canvas',
			action: 'update-edge-label',
			edgeId: updatedEdgeBody.doc.edges.at(-1)?.id,
			label: '   ',
			expectedRevision: updatedEdgeBody.doc.revision
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
		nodes: { id?: string; type?: string; text?: string; file?: string; url?: string; label?: string; x?: number; y?: number }[];
		edges: { fromNode?: string; toNode?: string; label?: string }[];
	};
	expect(raw.nodes.some((node) => node.text === 'Edited text card')).toBe(true);
	expect(raw.nodes.some((node) => node.text === 'Follow-up idea')).toBe(true);
	expect(raw.nodes.some((node) => node.type === 'group' && node.label === 'Renamed API group')).toBe(true);
	expect(raw.nodes.some((node) => node.file === 'References/Home.md' && node.label === 'Home reference')).toBe(true);
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

	await page.goto(`/vault/${vault.id}/canvas/${encodeURI('Board.canvas')}`);
	await expect(page.locator('.canvas-view')).toBeVisible({ timeout: 5_000 });
	await page.getByRole('button', { name: 'Add text' }).click();
	await expect(page.locator('.canvas-view')).toContainText('3 nodes · 1 edge · editable text cards');

	await page.getByLabel('Canvas node type').selectOption('file');
	await page.getByLabel('Canvas node value').fill('Home.md');
	await page.getByRole('button', { name: 'Add file' }).click();
	await expect(page.locator('.canvas-view')).toContainText('4 nodes · 1 edge · editable text cards');
	await expect(page.locator('.canvas-node-file').filter({ hasText: 'Home.md' })).toHaveCount(2);

	await page.getByLabel('Canvas node type').selectOption('link');
	await page.getByLabel('Canvas node value').fill('https://example.com/research');
	await page.getByRole('button', { name: 'Add URL' }).click();
	await expect(page.locator('.canvas-view')).toContainText('5 nodes · 1 edge · editable text cards');
	await expect(page.locator('.canvas-node-link').filter({ hasText: 'https://example.com/research' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Open canvas URL node https://example.com/research' })).toHaveAttribute(
		'href',
		'https://example.com/research'
	);

	const addedFileCard = page.locator('.canvas-node-file').filter({ hasText: 'Home.md' }).last();
	await addedFileCard.getByLabel('Canvas file path for Home.md').fill('References/Home.md');
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
			hasFile: body.nodes.some((node) => node.type === 'file' && node.file === 'Home.md'),
			hasEditedFile: body.nodes.some((node) => node.type === 'file' && node.file === 'References/Home.md' && node.label === 'Home reference'),
			hasEditedLink: body.nodes.some((node) => node.type === 'link' && node.url === 'https://example.com/updated' && node.label === 'Updated research')
		};
	}).toEqual({ text: 'Edited through UI', hasFile: true, hasEditedFile: true, hasEditedLink: true });
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

	await page.goto(`/vault/${vault.id}/canvas/${encodeURI('Board.canvas')}`);
	await expect(page.locator('.canvas-view')).toBeVisible({ timeout: 5_000 });
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

	await page.goto(`/vault/${vault.id}/canvas/${encodeURI('Board.canvas')}`);
	await expect(page.locator('.canvas-view')).toBeVisible({ timeout: 5_000 });
	await expect(page.locator('.canvas-view')).toContainText('2 nodes · 1 edge · editable text cards');
	await expect(page.getByLabel('Canvas edges')).toContainText('Home.md');

	await page.getByRole('button', { name: 'Remove canvas node Home.md' }).click();
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

	await page.goto(`/vault/${vault.id}/canvas/${encodeURI('Board.canvas')}`);
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

	await expect.poll(async () => {
		const saved = await request.get(`/api/vaults/${vault.id}/canvas?path=${encodeURIComponent('Board.canvas')}`);
		const body = await saved.json() as CanvasDoc;
		const moved = body.nodes.find((node) => node.id === 'b');
		return moved ? { x: moved.x, y: moved.y } : null;
	}).toEqual({ x: original.x + 60, y: original.y + 30 });
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

test('canvas file context menu exposes rename and delete actions', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'canvas-menu-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Board.canvas'), canvasJson);

	const created = await request.post('/api/vaults', {
		data: { name: 'Canvas Menu Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	await page.goto(`/vault/${vault.id}`);
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
	const boardLink = page.locator('.tree .file-link').filter({ hasText: 'Board' }).first();
	await expect(boardLink).toBeVisible({ timeout: 10_000 });
	await boardLink.click({ button: 'right' });
	await expect(page.getByRole('menuitem', { name: /Rename/ })).toBeVisible();
	await expect(page.getByRole('menuitem', { name: /Delete Canvas/ })).toBeVisible();
});
