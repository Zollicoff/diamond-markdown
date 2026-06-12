import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
	compactPathList,
	importReadiness,
	importSummary,
	obsidianDailyNotesSummary,
	obsidianAppConfigSummary,
	obsidianPluginMigrationNotes,
	obsidianPluginSummary
} from '../src/lib/import/checklist';
import { preferredObsidianNewNoteFolder, safeVaultFolder, shouldUpdateLinksOnRename } from '../src/lib/server/obsidian-config';
import { dailyNotePlan, obsidianDailyTemplatePath } from '../src/lib/server/obsidian-daily';
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
		obsidianAppConfig: {
			status: 'missing',
			attachmentFolderStatus: 'missing',
			newFileFolderStatus: 'not-configured',
			settings: [],
			warnings: []
		},
		obsidianDailyNotes: {
			status: 'missing',
			folderStatus: 'missing',
			templateStatus: 'missing',
			formatStatus: 'missing',
			plannedPath: 'Daily Notes/2026-06-12.md',
			settings: [],
			warnings: []
		},
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

	test('summarizes Obsidian app config without exposing raw JSON', () => {
		expect(obsidianAppConfigSummary(analysis().obsidianAppConfig)).toBe('No .obsidian/app.json file was found.');
		expect(obsidianAppConfigSummary({
			path: '.obsidian/app.json',
			status: 'invalid',
			bytes: 12,
			attachmentFolderStatus: 'missing',
			newFileFolderStatus: 'not-configured',
			settings: [],
			warnings: ['invalid']
		})).toBe('.obsidian/app.json is present but invalid.');
		expect(obsidianAppConfigSummary({
			path: '.obsidian/app.json',
			status: 'present',
			bytes: 64,
			attachmentFolderStatus: 'safe',
			attachmentFolderPath: 'Media/Uploads',
			newFileLocation: 'folder',
			newFileFolderStatus: 'safe',
			newFileFolderPath: 'Notes/Inbox',
			settings: [
				{
					id: 'attachmentFolderPath',
					label: 'Attachment folder',
					value: 'Media/Uploads',
					detail: 'Diamond uses this safe Obsidian folder for dropped, pasted, and uploaded attachments.',
					level: 'info'
				},
				{
					id: 'newFileFolderPath',
					label: 'Configured new-note folder',
					value: 'Notes/Inbox',
					detail: 'Reported for migration planning.',
					level: 'info'
				}
			],
			warnings: []
		})).toBe('2 supported app settings found.');
	});

	test('summarizes Obsidian Daily Notes config without raw JSON', () => {
		expect(obsidianDailyNotesSummary(analysis().obsidianDailyNotes)).toBe('No .obsidian/daily-notes.json file was found.');
		expect(obsidianDailyNotesSummary({
			path: '.obsidian/daily-notes.json',
			status: 'invalid',
			bytes: 12,
			folderStatus: 'missing',
			templateStatus: 'missing',
			formatStatus: 'missing',
			plannedPath: 'Daily Notes/2026-06-12.md',
			settings: [],
			warnings: ['invalid']
		})).toBe('.obsidian/daily-notes.json is present but invalid.');
		expect(obsidianDailyNotesSummary({
			path: '.obsidian/daily-notes.json',
			status: 'present',
			bytes: 96,
			folderPath: 'Journal',
			folderStatus: 'safe',
			templatePath: 'Templates/Daily Template.md',
			templateStatus: 'safe',
			format: 'YYYY/MMMM/YYYY-MM-DD-ddd',
			formatStatus: 'safe',
			plannedPath: 'Journal/2026/June/2026-06-12-Fri.md',
			settings: [
				{
					id: 'folder',
					label: 'Daily note folder',
					value: 'Journal',
					detail: 'Reported for migration planning.',
					level: 'info'
				}
			],
			warnings: []
		})).toBe("1 Daily Notes setting found; today's note resolves to Journal/2026/June/2026-06-12-Fri.md.");
	});

	test('guards Obsidian configured vault folders before reuse', () => {
		expect(safeVaultFolder('Media/Uploads')).toBe('Media/Uploads');
		expect(safeVaultFolder('./Media/Uploads')).toBe('Media/Uploads');
		expect(safeVaultFolder('../outside')).toBeNull();
		expect(safeVaultFolder('/tmp/uploads')).toBeNull();
		expect(safeVaultFolder('Media\\Uploads')).toBeNull();
		expect(safeVaultFolder('.obsidian/plugins')).toBeNull();
		expect(safeVaultFolder('node_modules/cache')).toBeNull();
		expect(safeVaultFolder('')).toBeNull();
	});

	test('uses only safe Obsidian folder settings for generic new-note defaults', () => {
		const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diamondmd-obsidian-new-note-'));
		fs.mkdirSync(path.join(vaultDir, '.obsidian'), { recursive: true });
		const appJson = path.join(vaultDir, '.obsidian', 'app.json');

		fs.writeFileSync(appJson, JSON.stringify({
			newFileLocation: 'folder',
			newFileFolderPath: 'Notes/Inbox'
		}));
		expect(preferredObsidianNewNoteFolder(vaultDir)).toBe('Notes/Inbox');

		fs.writeFileSync(appJson, JSON.stringify({
			newFileLocation: 'folder',
			newFileFolderPath: '../outside'
		}));
		expect(preferredObsidianNewNoteFolder(vaultDir)).toBeNull();

		fs.writeFileSync(appJson, JSON.stringify({
			newFileLocation: 'current',
			newFileFolderPath: 'Notes/Inbox'
		}));
		expect(preferredObsidianNewNoteFolder(vaultDir)).toBeNull();
	});

	test('honors Obsidian automatic link-update preference for rename behavior', () => {
		const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diamondmd-obsidian-link-updates-'));
		fs.mkdirSync(path.join(vaultDir, '.obsidian'), { recursive: true });
		const appJson = path.join(vaultDir, '.obsidian', 'app.json');

		expect(shouldUpdateLinksOnRename(vaultDir)).toBe(true);

		fs.writeFileSync(appJson, JSON.stringify({ alwaysUpdateLinks: false }));
		expect(shouldUpdateLinksOnRename(vaultDir)).toBe(false);

		fs.writeFileSync(appJson, JSON.stringify({ alwaysUpdateLinks: true }));
		expect(shouldUpdateLinksOnRename(vaultDir)).toBe(true);
	});

	test('uses safe Obsidian daily note settings for the daily-note plan', () => {
		const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diamondmd-obsidian-daily-'));
		fs.mkdirSync(path.join(vaultDir, '.obsidian'), { recursive: true });
		fs.writeFileSync(path.join(vaultDir, '.obsidian', 'daily-notes.json'), JSON.stringify({
			folder: 'Journal',
			template: 'Templates/Daily Template',
			format: 'YYYY/MMMM/YYYY-MM-DD-ddd'
		}));

		const plan = dailyNotePlan(vaultDir, new Date(2026, 5, 12, 8, 30, 0));
		expect(plan).toMatchObject({
			path: 'Journal/2026/June/2026-06-12-Fri.md',
			title: '2026-06-12-Fri',
			templateRel: 'Templates/Daily Template.md',
			source: 'obsidian-daily-notes'
		});
		expect(plan.date.getHours()).toBe(12);
		expect(obsidianDailyTemplatePath('./Templates/Daily Template')).toBe('Templates/Daily Template.md');
	});

	test('falls back from unsafe Obsidian daily note settings', () => {
		const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diamondmd-obsidian-daily-unsafe-'));
		fs.mkdirSync(path.join(vaultDir, '.obsidian'), { recursive: true });
		fs.writeFileSync(path.join(vaultDir, '.obsidian', 'daily-notes.json'), JSON.stringify({
			folder: '../outside',
			template: '.obsidian/secret',
			format: '../YYYY'
		}));

		expect(dailyNotePlan(vaultDir, new Date(2026, 5, 12, 8, 30, 0))).toMatchObject({
			path: 'Daily Notes/2026-06-12.md',
			title: '2026-06-12',
			templateRel: 'Daily Notes/Template.md',
			source: 'obsidian-daily-notes'
		});
		expect(obsidianDailyTemplatePath('.obsidian/secret')).toBeNull();
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
