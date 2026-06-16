import { expect, test } from '@playwright/test';
import type { CanvasDoc } from '../src/lib/types';
import {
	canvasFileAssetKind,
	canvasFileAssetPreview,
	canvasFileNodeDisplayPath,
	canvasFileNodeFragment,
	canvasFileNodePath,
	canvasFileNodeSubpath,
	canvasFileNodeTitle,
	canvasFileOpenTarget,
	canvasLinkNodeHref,
	canvasRawAssetHref,
	isCanvasVaultRelativeAssetPath,
	normalizeCanvasFileSubpath,
	splitCanvasAssetReference
} from '../src/lib/canvas/files';

const noteNode = {
	id: 'note',
	type: 'file',
	x: 0,
	y: 0,
	width: 240,
	height: 120,
	file: 'Notes/Home.md',
	subpath: '#Install Steps'
} satisfies CanvasDoc['nodes'][number];

test.describe('canvas file helpers', () => {
	test('normalizes note and Canvas file targets', () => {
		expect(canvasFileNodePath(noteNode)).toBe('Notes/Home.md');
		expect(canvasFileNodeSubpath(noteNode)).toBe('#Install Steps');
		expect(canvasFileNodeFragment(noteNode)).toBe('#install-steps');
		expect(canvasFileNodeDisplayPath(noteNode)).toBe('Notes/Home.md#Install Steps');
		expect(canvasFileNodeTitle(noteNode)).toBe('Home');
		expect(canvasFileOpenTarget(noteNode)).toEqual({
			kind: 'note',
			path: 'Notes/Home.md',
			title: 'Home',
			actionLabel: 'Open note',
			subpath: '#Install Steps',
			hash: 'install-steps'
		});
		expect(canvasFileOpenTarget({ ...noteNode, file: 'Boards/Map.canvas', subpath: '#Ignored' })).toEqual({
			kind: 'canvas',
			path: 'Boards/Map.canvas',
			title: 'Map',
			actionLabel: 'Open Canvas',
			subpath: '#Ignored',
			hash: null
		});
		expect(normalizeCanvasFileSubpath('Install Steps')).toBeNull();
		expect(normalizeCanvasFileSubpath('#')).toBeNull();
		expect(normalizeCanvasFileSubpath('#Bad\nHeading')).toBeNull();
	});

	test('keeps vault asset references safe and classifies media', () => {
		expect(splitCanvasAssetReference('Images/roof photo.svg#diagram')).toEqual({
			path: 'Images/roof photo.svg',
			suffix: '#diagram'
		});
		expect(isCanvasVaultRelativeAssetPath('Images/roof.png')).toBe(true);
		expect(isCanvasVaultRelativeAssetPath('../secret.png')).toBe(false);
		expect(isCanvasVaultRelativeAssetPath('https://example.com/roof.png')).toBe(false);
		expect(canvasRawAssetHref('vault id', 'Images/roof photo.svg#diagram')).toBe('/api/vaults/vault%20id/raw/Images/roof%20photo.svg#diagram');
		expect(canvasRawAssetHref('vault', '../secret.png')).toBeNull();
		expect(canvasFileAssetKind('Images/roof.png')).toBe('image');
		expect(canvasFileAssetKind('Docs/program.pdf')).toBe('pdf');
		expect(canvasFileAssetKind('Audio/walkthrough.mp3')).toBe('audio');
		expect(canvasFileAssetKind('Video/demo.webm')).toBe('video');
		expect(canvasFileAssetKind('Archive/site-data.zip')).toBe('file');
		expect(canvasFileAssetPreview({ ...noteNode, file: 'Images/roof.png', subpath: undefined }, 'vault id')).toEqual({
			kind: 'image',
			path: 'Images/roof.png',
			title: 'roof.png',
			href: '/api/vaults/vault%20id/raw/Images/roof.png',
			actionLabel: 'Open image'
		});
	});

	test('accepts only http and https URL nodes', () => {
		const linkNode = {
			id: 'link',
			type: 'link',
			x: 0,
			y: 0,
			width: 240,
			height: 120,
			url: 'https://example.com/research'
		} satisfies CanvasDoc['nodes'][number];

		expect(canvasLinkNodeHref(linkNode)).toBe('https://example.com/research');
		expect(canvasLinkNodeHref({ ...linkNode, url: 'http://example.com/research' })).toBe('http://example.com/research');
		expect(canvasLinkNodeHref({ ...linkNode, url: 'javascript:alert(1)' })).toBeNull();
		expect(canvasLinkNodeHref({ ...linkNode, url: 'ftp://example.com/file' })).toBeNull();
	});
});
