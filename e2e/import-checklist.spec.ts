import { expect, test } from '@playwright/test';
import {
	compactPathList,
	importReadiness,
	importSummary,
	obsidianPluginMigrationNotes,
	obsidianPluginSummary
} from '../src/lib/import/checklist';
import type { ObsidianPluginInfo, VaultImportAnalysis } from '../src/lib/types';

function analysis(overrides: Partial<VaultImportAnalysis> = {}): VaultImportAnalysis {
	return {
		path: '/vault',
		markdownFiles: 2,
		assetFiles: 1,
		canvasFiles: 0,
		totalFiles: 3,
		obsidianConfig: false,
		diamondConfig: false,
		gitRepository: true,
		likelyAttachmentFolders: [],
		obsidianPluginFolders: [],
		obsidianPlugins: [],
		recommendedExcludedFolders: [],
		ignoredFolders: [],
		warnings: [],
		checklist: [{ id: 'markdown', label: 'Markdown notes', detail: '2 markdown files found.', level: 'ok' }],
		markdownExamples: ['Daily.md'],
		canvasExamples: [],
		...overrides
	};
}

test.describe('import checklist helpers', () => {
	test('summarizes import readiness without mutating analysis shape', () => {
		expect(importSummary(analysis())).toBe('2 notes · 1 asset');
		expect(importSummary(analysis({ canvasFiles: 1 }))).toBe('2 notes · 1 asset · 1 canvas');
		expect(importReadiness(analysis())).toEqual({ level: 'ok', label: 'Ready' });
		expect(importReadiness(analysis({
			checklist: [{ id: 'canvas', label: 'Canvas files', detail: '1 Canvas file found.', level: 'info' }]
		}))).toEqual({ level: 'info', label: 'Ready with notes' });
		expect(importReadiness(analysis({
			checklist: [{ id: 'git', label: 'Git sync readiness', detail: 'No .git folder found.', level: 'warn' }]
		}))).toEqual({ level: 'warn', label: 'Needs review' });
	});

	test('compacts long folder lists for dense import cards', () => {
		expect(compactPathList(['.obsidian', 'assets'])).toBe('.obsidian, assets');
		expect(compactPathList(['a', 'b', 'c', 'd', 'e'], 3)).toBe('a, b, c +2 more');
	});

	test('summarizes Obsidian plugin metadata without implying execution', () => {
		const plugins: ObsidianPluginInfo[] = [
			{
				folder: '.obsidian/plugins/dataview',
				id: 'dataview',
				name: 'Dataview',
				version: '0.5.0',
				enabled: true,
				manifestPath: '.obsidian/plugins/dataview/manifest.json',
				manifestStatus: 'present',
				settingsPath: '.obsidian/plugins/dataview/data.json',
				settingsStatus: 'present',
				settingsBytes: 12,
				settingsKeys: ['queries', 'views', 'widgets', 'zIndex']
			},
			{
				folder: '.obsidian/plugins/broken',
				id: 'broken',
				name: 'broken',
				enabled: false,
				manifestPath: '.obsidian/plugins/broken/manifest.json',
				manifestStatus: 'invalid',
				settingsStatus: 'missing'
			}
		];
		expect(obsidianPluginSummary(plugins)).toBe('Dataview (dataview): enabled, settings: queries, views, widgets +1; broken: invalid manifest, no settings');

		expect(obsidianPluginMigrationNotes(plugins, 2)).toEqual([
			{
				id: 'dataview',
				name: 'Dataview (dataview)',
				folder: '.obsidian/plugins/dataview',
				level: 'info',
				enabledLabel: 'Enabled in Obsidian',
				manifestLabel: 'Manifest present',
				settingsLabel: '4 setting keys',
				detail: '.obsidian/plugins/dataview · v0.5.0 · .obsidian/plugins/dataview/data.json preserved (12 B)',
				action: 'Preserved for manual migration; Diamond will not execute this Obsidian plugin.',
				keySummary: 'Top-level keys: queries, views +2 more'
			},
			{
				id: 'broken',
				name: 'broken',
				folder: '.obsidian/plugins/broken',
				level: 'warn',
				enabledLabel: 'Disabled in Obsidian',
				manifestLabel: 'Invalid manifest',
				settingsLabel: 'No settings file',
				detail: '.obsidian/plugins/broken',
				action: 'Review the preserved plugin folder before recreating this workflow in Diamond.',
				keySummary: undefined
			}
		]);
	});
});
