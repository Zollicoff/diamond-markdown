import { expect, test } from '@playwright/test';
import { canvasAddNodePayload } from '../src/lib/api/canvas';

test.describe('canvas API client helpers', () => {
	test('builds Obsidian Canvas add-node payloads without UI dependencies', () => {
		expect(canvasAddNodePayload('Boards/Map.canvas', 'file', 'Home.md', 'rev-1')).toEqual({
			path: 'Boards/Map.canvas',
			action: 'add-node',
			nodeType: 'file',
			expectedRevision: 'rev-1',
			file: 'Home.md'
		});
		expect(canvasAddNodePayload('Boards/Map.canvas', 'link', 'https://example.com', 'rev-2')).toEqual({
			path: 'Boards/Map.canvas',
			action: 'add-node',
			nodeType: 'link',
			expectedRevision: 'rev-2',
			url: 'https://example.com'
		});
		expect(canvasAddNodePayload('Boards/Map.canvas', 'group', '', 'rev-3')).toEqual({
			path: 'Boards/Map.canvas',
			action: 'add-node',
			nodeType: 'group',
			expectedRevision: 'rev-3',
			label: 'Group'
		});
		expect(canvasAddNodePayload('Boards/Map.canvas', 'text', '', 'rev-4')).toEqual({
			path: 'Boards/Map.canvas',
			action: 'add-node',
			nodeType: 'text',
			expectedRevision: 'rev-4',
			text: 'New text card'
		});
	});
});
