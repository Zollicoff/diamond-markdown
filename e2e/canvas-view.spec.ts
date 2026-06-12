import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURE_PATHS } from './setup-fixture';
import type { CanvasDoc } from '../src/lib/types';
import {
	canvasBounds,
	canvasNodeBody,
	canvasNodeTitle,
	canvasSummary,
	edgeLines,
	nodeStyle
} from '../src/lib/canvas/view';

const canvasJson = JSON.stringify({
	nodes: [
		{ id: 'a', type: 'text', x: 0, y: 0, width: 220, height: 120, text: 'Canvas text card' },
		{ id: 'b', type: 'file', x: 320, y: 40, width: 220, height: 100, file: 'Home.md' }
	],
	edges: [
		{ id: 'edge-a-b', fromNode: 'a', toNode: 'b', label: 'opens' }
	]
}, null, 2);

test.describe('canvas view helpers', () => {
	test('computes board bounds, node copy, and edge line positions', () => {
		const doc = {
			path: 'Board.canvas',
			title: 'Board',
			revision: 'rev',
			mtime: 0,
			nodes: [
				{ id: 'a', type: 'text', x: 0, y: 0, width: 220, height: 120, text: 'Hello canvas' },
				{ id: 'b', type: 'file', x: 320, y: 40, width: 220, height: 100, file: 'Home.md' }
			],
			edges: [{ id: 'edge-a-b', fromNode: 'a', toNode: 'b', label: 'opens' }],
			warnings: []
		} satisfies CanvasDoc;
		const bounds = canvasBounds(doc.nodes);

		expect(canvasNodeTitle(doc.nodes[0])).toBe('text');
		expect(canvasNodeTitle(doc.nodes[1])).toBe('Home.md');
		expect(canvasNodeBody(doc.nodes[0])).toBe('Hello canvas');
		expect(canvasSummary(doc)).toBe('2 nodes · 1 edge');
		expect(nodeStyle(doc.nodes[0], bounds)).toContain('left: 80px');
		expect(edgeLines(doc, bounds)).toEqual([
			{ edge: doc.edges[0], x1: 190, y1: 140, x2: 510, y2: 170 }
		]);
	});
});

test('canvas API and file tree open a read-only Obsidian Canvas preview', async ({ page, request }) => {
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

	await page.goto(`/vault/${vault.id}`);
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
	await page.locator('.tree .file-link').filter({ hasText: 'Board' }).click();
	await expect(page.locator('.canvas-view')).toBeVisible({ timeout: 5_000 });
	await expect(page.locator('.canvas-view')).toContainText('Board');
	await expect(page.locator('.canvas-view')).toContainText('2 nodes · 1 edge · read-only');
	await expect(page.locator('.canvas-view')).toContainText('Canvas text card');
	await expect(page.locator('.canvas-view')).toContainText('Home.md');
});
