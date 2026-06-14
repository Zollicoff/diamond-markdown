import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
	compactPathList,
	importReadiness,
	importSummary,
	obsidianDailyNotesSummary,
	obsidianAppearanceSummary,
	obsidianAppConfigSummary,
	obsidianBookmarksSummary,
	obsidianCorePluginsSummary,
	obsidianGraphSummary,
	obsidianHotkeysSummary,
	obsidianTemplatesSummary,
	obsidianPluginMigrationNotes,
	obsidianPluginSummary
} from '../src/lib/import/checklist';
import { linkInsertion, linkToolbarButton } from '../src/lib/editor/link-insertion';
import { editorDisplayPreference, editorLinkPreference, preferredObsidianNewNoteFolder, readObsidianAppConfig, safeVaultFolder, shouldUpdateLinksOnRename } from '../src/lib/server/obsidian-config';
import { dailyNotePlan, obsidianDailyTemplatePath } from '../src/lib/server/obsidian-daily';
import { readObsidianAppearanceConfig } from '../src/lib/server/obsidian-appearance';
import { readObsidianCorePlugins, readObsidianHotkeys } from '../src/lib/server/obsidian-core';
import { readObsidianGraphConfig } from '../src/lib/server/obsidian-graph';
import { readObsidianTemplatesConfig, templateRuntimeSettings } from '../src/lib/server/obsidian-templates';
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
		obsidianTemplates: {
			status: 'missing',
			folderStatus: 'missing',
			dateFormatStatus: 'missing',
			timeFormatStatus: 'missing',
			settings: [],
			warnings: []
		},
		obsidianAppearance: {
			status: 'missing',
			enabledCssSnippets: [],
			snippetFiles: [],
			missingEnabledSnippets: [],
			settings: [],
			warnings: []
		},
		obsidianCorePlugins: {
			status: 'missing',
			enabledPlugins: [],
			entries: [],
			supportedCount: 0,
			partialCount: 0,
			manualCount: 0,
			unknownCount: 0,
			warnings: []
		},
		obsidianHotkeys: {
			status: 'missing',
			commandCount: 0,
			bindingCount: 0,
			commands: [],
			omittedCommands: 0,
			warnings: []
		},
		obsidianBookmarks: {
			status: 'missing',
			source: 'missing',
			totalItems: 0,
			importableBookmarks: 0,
			paths: [],
			warnings: []
		},
		obsidianGraph: {
			status: 'missing',
			colorGroupCount: 0,
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
			defaultMode: 'read',
			spellcheck: true,
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
				},
				{
					id: 'defaultViewMode',
					label: 'Default view mode',
					value: 'Reading view',
					detail: 'Diamond opens notes in Read mode for this imported vault.',
					level: 'info'
				},
				{
					id: 'spellcheck',
					label: 'Spellcheck',
					value: 'Enabled',
					detail: 'Diamond enables browser spellcheck in the markdown editor for this imported vault.',
					level: 'info'
				}
			],
			warnings: []
		})).toBe('4 supported app settings found.');
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

	test('summarizes Obsidian Templates config without raw JSON', () => {
		expect(obsidianTemplatesSummary(analysis().obsidianTemplates)).toBe('No .obsidian/templates.json file was found.');
		expect(obsidianTemplatesSummary({
			path: '.obsidian/templates.json',
			status: 'invalid',
			bytes: 12,
			folderStatus: 'missing',
			dateFormatStatus: 'missing',
			timeFormatStatus: 'missing',
			settings: [],
			warnings: ['invalid']
		})).toBe('.obsidian/templates.json is present but invalid.');
		expect(obsidianTemplatesSummary({
			path: '.obsidian/templates.json',
			status: 'present',
			bytes: 96,
			folderPath: 'Snippet Bank',
			folderStatus: 'safe',
			dateFormat: 'dddd, MMMM D, YYYY',
			dateFormatStatus: 'safe',
			timeFormat: 'HH:mm:ss',
			timeFormatStatus: 'safe',
			settings: [
				{
					id: 'folder',
					label: 'Template folder',
					value: 'Snippet Bank',
					detail: 'Reported for migration planning.',
					level: 'info'
				}
			],
			warnings: []
		})).toBe('1 Templates setting found; templates load from Snippet Bank.');
	});

	test('summarizes Obsidian bookmarks importability', () => {
		expect(obsidianBookmarksSummary(analysis().obsidianBookmarks)).toBe('No .obsidian/bookmarks.json or legacy .obsidian/starred.json file was found.');
		expect(obsidianBookmarksSummary({
			path: '.obsidian/bookmarks.json',
			status: 'invalid',
			source: 'bookmarks',
			totalItems: 0,
			importableBookmarks: 0,
			paths: [],
			warnings: []
		})).toBe('.obsidian/bookmarks.json is present but invalid.');
		expect(obsidianBookmarksSummary({
			path: '.obsidian/bookmarks.json',
			status: 'present',
			source: 'bookmarks',
			totalItems: 3,
			importableBookmarks: 2,
			paths: ['Home.md', 'Projects/Solar.md'],
			warnings: []
		})).toBe('2 Obsidian bookmark items can seed Diamond bookmarks.');
		expect(obsidianBookmarksSummary({
			path: '.obsidian/starred.json',
			status: 'present',
			source: 'starred',
			totalItems: 1,
			importableBookmarks: 1,
			paths: ['Legacy.md'],
			warnings: []
		})).toBe('1 Obsidian legacy starred item can seed Diamond bookmarks.');
	});

	test('summarizes Obsidian graph settings as migration guidance', () => {
		expect(obsidianGraphSummary(analysis().obsidianGraph)).toBe('No .obsidian/graph.json file was found.');
		expect(obsidianGraphSummary({
			path: '.obsidian/graph.json',
			status: 'invalid',
			bytes: 12,
			colorGroupCount: 0,
			settings: [],
			warnings: ['invalid']
		})).toBe('.obsidian/graph.json is present but invalid.');
		expect(obsidianGraphSummary({
			path: '.obsidian/graph.json',
			status: 'present',
			bytes: 160,
			searchQuery: 'tag:#project',
			showOrphans: false,
			showAttachments: true,
			showTags: true,
			hideUnresolved: false,
			colorGroupCount: 2,
			settings: [
				{
					id: 'search',
					label: 'Graph search filter',
					value: 'tag:#project',
					detail: 'Reported for migration planning.',
					level: 'info'
				},
				{
					id: 'showAttachments',
					label: 'Attachment graph nodes',
					value: 'Shown in Obsidian',
					detail: 'Reported for migration planning.',
					level: 'warn'
				},
				{
					id: 'colorGroups',
					label: 'Graph color groups',
					value: '2 groups',
					detail: 'Reported for migration planning.',
					level: 'warn'
				}
			],
			warnings: []
		})).toBe('3 Graph settings found; 2 need manual review.');
	});

	test('reads Obsidian graph settings without exposing private graph config', () => {
		const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diamondmd-obsidian-graph-'));
		fs.mkdirSync(path.join(vaultDir, '.obsidian'), { recursive: true });
		fs.writeFileSync(path.join(vaultDir, '.obsidian', 'graph.json'), JSON.stringify({
			search: 'tag:#project path:"Notes"',
			showOrphans: false,
			showAttachments: true,
			showTags: true,
			hideUnresolved: false,
			colorGroups: [
				{ query: 'tag:#urgent', color: { a: 1, rgb: 16711680 } },
				{ query: 'path:Archive', color: { a: 1, rgb: 65280 } }
			],
			nodeSizeMultiplier: 1.2,
			lineSizeMultiplier: 0.75,
			textFadeMultiplier: 0.4,
			centerStrength: 0.52,
			repelStrength: 10,
			linkStrength: 1,
			linkDistance: 250,
			scale: 0.85,
			privateGraphSetting: 'do-not-render-this-graph-value'
		}));

		const config = readObsidianGraphConfig(vaultDir);
		expect(config).toMatchObject({
			status: 'present',
			searchQuery: 'tag:#project path:"Notes"',
			showOrphans: false,
			showAttachments: true,
			showTags: true,
			hideUnresolved: false,
			colorGroupCount: 2,
			nodeSizeMultiplier: 1.2,
			lineSizeMultiplier: 0.75,
			textFadeMultiplier: 0.4,
			centerStrength: 0.52,
			repelStrength: 10,
			linkStrength: 1,
			linkDistance: 250,
			scale: 0.85
		});
		expect(config.settings.map((setting) => setting.id)).toEqual([
			'search',
			'showOrphans',
			'showAttachments',
			'showTags',
			'hideUnresolved',
			'colorGroups',
			'nodeSizeMultiplier',
			'lineSizeMultiplier',
			'textFadeMultiplier',
			'centerStrength',
			'repelStrength',
			'linkStrength',
			'linkDistance',
			'scale'
		]);
		expect(config.settings.filter((setting) => setting.level === 'warn').map((setting) => setting.id)).toEqual([
			'showAttachments',
			'showTags',
			'hideUnresolved',
			'colorGroups'
		]);
		expect(JSON.stringify(config)).not.toContain('do-not-render-this-graph-value');
		expect(JSON.stringify(config)).not.toContain('tag:#urgent');
	});

	test('summarizes Obsidian Appearance settings without loading CSS snippets', () => {
		expect(obsidianAppearanceSummary(analysis().obsidianAppearance)).toBe('No .obsidian/appearance.json file was found.');
		expect(obsidianAppearanceSummary({
			path: '.obsidian/appearance.json',
			status: 'invalid',
			bytes: 12,
			enabledCssSnippets: [],
			snippetFiles: [],
			missingEnabledSnippets: [],
			settings: [],
			warnings: ['invalid']
		})).toBe('.obsidian/appearance.json is present but invalid.');
		expect(obsidianAppearanceSummary({
			path: '.obsidian/appearance.json',
			status: 'present',
			bytes: 160,
			theme: 'moonstone',
			cssTheme: 'Minimal',
			baseFontSize: 16,
			enabledCssSnippets: ['cards'],
			snippetFiles: ['cards', 'dashboard'],
			missingEnabledSnippets: [],
			settings: [
				{
					id: 'cssTheme',
					label: 'Community theme',
					value: 'Minimal',
					detail: 'Reported for migration planning.',
					level: 'info'
				},
				{
					id: 'cssSnippetFiles',
					label: 'CSS snippet files',
					value: 'cards.css, dashboard.css',
					detail: 'Reported for migration planning.',
					level: 'info'
				}
			],
			warnings: []
		})).toBe('2 Appearance settings found; 2 CSS snippet files preserved.');
		expect(obsidianAppearanceSummary({
			status: 'missing',
			enabledCssSnippets: [],
			snippetFiles: ['cards'],
			missingEnabledSnippets: [],
			settings: [],
			warnings: []
		})).toBe('No .obsidian/appearance.json file was found; 1 CSS snippet file preserved.');
	});

	test('reads Obsidian Appearance settings and snippet filenames without exposing CSS contents', () => {
		const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diamondmd-obsidian-appearance-'));
		fs.mkdirSync(path.join(vaultDir, '.obsidian', 'snippets'), { recursive: true });
		fs.writeFileSync(path.join(vaultDir, '.obsidian', 'appearance.json'), JSON.stringify({
			theme: 'moonstone',
			cssTheme: 'Minimal',
			baseFontSize: 16,
			accentColor: '#0f766e',
			enabledCssSnippets: ['cards', 'missing', '../unsafe'],
			privateAppearanceSetting: 'do-not-render-this-appearance-value'
		}));
		fs.writeFileSync(path.join(vaultDir, '.obsidian', 'snippets', 'cards.css'), '.cards { content: "do-not-render-this-css-value"; }');
		fs.writeFileSync(path.join(vaultDir, '.obsidian', 'snippets', 'dashboard.css'), '.dashboard { color: red; }');

		const config = readObsidianAppearanceConfig(vaultDir);
		expect(config).toMatchObject({
			status: 'present',
			theme: 'moonstone',
			cssTheme: 'Minimal',
			baseFontSize: 16,
			accentColor: '#0f766e',
			enabledCssSnippets: ['cards', 'missing'],
			snippetFiles: ['cards', 'dashboard'],
			missingEnabledSnippets: ['missing']
		});
		expect(config.settings.map((setting) => setting.id)).toEqual([
			'cssSnippetFiles',
			'theme',
			'cssTheme',
			'baseFontSize',
			'accentColor',
			'enabledCssSnippets',
			'missingEnabledCssSnippets'
		]);
		expect(config.warnings).toContain('Obsidian appearance enables CSS snippets that were not found in .obsidian/snippets.');
		expect(config.warnings).toContain('1 Obsidian CSS snippet name ignored because it was unsafe.');
		expect(JSON.stringify(config)).not.toContain('do-not-render-this-css-value');
		expect(JSON.stringify(config)).not.toContain('do-not-render-this-appearance-value');
	});

	test('summarizes and classifies Obsidian core plugin settings', () => {
		expect(obsidianCorePluginsSummary(analysis().obsidianCorePlugins)).toBe('No .obsidian/core-plugins.json file was found.');
		expect(obsidianCorePluginsSummary({
			path: '.obsidian/core-plugins.json',
			status: 'invalid',
			bytes: 8,
			enabledPlugins: [],
			entries: [],
			supportedCount: 0,
			partialCount: 0,
			manualCount: 0,
			unknownCount: 0,
			warnings: ['invalid']
		})).toBe('.obsidian/core-plugins.json is present but invalid.');

		const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diamondmd-obsidian-core-plugins-'));
		fs.mkdirSync(path.join(vaultDir, '.obsidian'), { recursive: true });
		fs.writeFileSync(path.join(vaultDir, '.obsidian', 'core-plugins.json'), JSON.stringify([
			'file-explorer',
			'global-search',
			'canvas',
			'markdown-importer',
			'unknown-plugin',
			'../unsafe'
		]));

		const config = readObsidianCorePlugins(vaultDir);
		expect(config).toMatchObject({
			status: 'present',
			enabledPlugins: ['canvas', 'file-explorer', 'global-search', 'markdown-importer', 'unknown-plugin'],
			supportedCount: 2,
			partialCount: 1,
			manualCount: 1,
			unknownCount: 1
		});
		expect(config.entries.map((entry) => `${entry.id}:${entry.support}`)).toEqual([
			'canvas:partial',
			'file-explorer:supported',
			'global-search:supported',
			'markdown-importer:manual',
			'unknown-plugin:unknown'
		]);
		expect(config.warnings).toContain('1 Obsidian core plugin id ignored because it was unsafe.');
		expect(obsidianCorePluginsSummary(config)).toBe('5 enabled core plugins found: 2 supported, 1 partial, 2 manual review.');
	});

	test('summarizes Obsidian hotkeys as manual shortcut guidance', () => {
		const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diamondmd-obsidian-hotkeys-'));
		fs.mkdirSync(path.join(vaultDir, '.obsidian'), { recursive: true });
		fs.writeFileSync(path.join(vaultDir, '.obsidian', 'hotkeys.json'), JSON.stringify({
			'switcher:open': [{ modifiers: ['Mod', 'Alt'], key: 'ArrowLeft' }],
			'editor:toggle-bold': [
				{ modifiers: ['Mod'], key: 'B' },
				{ modifiers: ['Mod', 'Shift'], key: 'B' }
			],
			'unsafe:command': [{ modifiers: ['Mod'], key: '\u0000' }],
			privateHotkeySetting: 'do-not-render-this-hotkey-value'
		}));

		const config = readObsidianHotkeys(vaultDir);
		expect(config).toMatchObject({
			status: 'present',
			commandCount: 2,
			bindingCount: 3,
			commands: [
				{
					commandId: 'editor:toggle-bold',
					bindings: ['Mod+B', 'Mod+Shift+B'],
					support: 'manual',
					detail: 'No direct Diamond command is mapped yet; recreate or skip this shortcut manually.'
				},
				{
					commandId: 'switcher:open',
					bindings: ['Mod+Alt+ArrowLeft'],
					support: 'mapped',
					diamondCommandId: 'switcher.open',
					diamondCommandTitle: 'Quick switcher'
				}
			],
			omittedCommands: 0
		});
		expect(config.warnings).toContain('1 Obsidian hotkey binding ignored because it was invalid or unsafe.');
		expect(JSON.stringify(config)).not.toContain('do-not-render-this-hotkey-value');
		expect(obsidianHotkeysSummary(config)).toBe('3 custom hotkey bindings across 2 commands found.');
	});

	test('uses safe Obsidian Templates settings for template runtime defaults', () => {
		const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diamondmd-obsidian-templates-'));
		fs.mkdirSync(path.join(vaultDir, '.obsidian'), { recursive: true });
		fs.writeFileSync(path.join(vaultDir, '.obsidian', 'templates.json'), JSON.stringify({
			folder: 'Snippet Bank/',
			dateFormat: 'dddd, MMMM D, YYYY',
			timeFormat: 'HH:mm:ss',
			privateTemplateSetting: 'do-not-render-this-template-config-value'
		}));

		const config = readObsidianTemplatesConfig(vaultDir);
		expect(config).toMatchObject({
			status: 'present',
			folderPath: 'Snippet Bank',
			folderStatus: 'safe',
			dateFormat: 'dddd, MMMM D, YYYY',
			dateFormatStatus: 'safe',
			timeFormat: 'HH:mm:ss',
			timeFormatStatus: 'safe'
		});
		expect(config.settings.map((setting) => setting.id)).toEqual(['folder', 'dateFormat', 'timeFormat']);
		expect(JSON.stringify(config)).not.toContain('do-not-render-this-template-config-value');
		expect(templateRuntimeSettings(vaultDir)).toEqual({
			folder: 'Snippet Bank',
			dateFormat: 'dddd, MMMM D, YYYY',
			timeFormat: 'HH:mm:ss',
			source: 'obsidian-templates'
		});
	});

	test('falls back from unsafe Obsidian Templates settings', () => {
		const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diamondmd-obsidian-templates-unsafe-'));
		fs.mkdirSync(path.join(vaultDir, '.obsidian'), { recursive: true });
		fs.writeFileSync(path.join(vaultDir, '.obsidian', 'templates.json'), JSON.stringify({
			folder: '../outside',
			dateFormat: '',
			timeFormat: 'x'.repeat(121)
		}));

		const config = readObsidianTemplatesConfig(vaultDir);
		expect(config).toMatchObject({
			status: 'present',
			folderStatus: 'unsafe',
			dateFormatStatus: 'unsafe',
			timeFormatStatus: 'unsafe'
		});
		expect(templateRuntimeSettings(vaultDir)).toEqual({
			folder: 'Templates',
			dateFormat: 'YYYY-MM-DD',
			timeFormat: 'HH:mm',
			source: 'obsidian-templates'
		});
	});

	test('guards Obsidian configured vault folders before reuse', () => {
		expect(safeVaultFolder('Media/Uploads')).toBe('Media/Uploads');
		expect(safeVaultFolder('Media/Uploads/')).toBe('Media/Uploads');
		expect(safeVaultFolder('./Media/Uploads')).toBe('Media/Uploads');
		expect(safeVaultFolder('Media/Uploads/')).toBe('Media/Uploads');
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

	test('uses Obsidian Markdown-link preference for editor link insertion', () => {
		const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diamondmd-obsidian-link-style-'));
		fs.mkdirSync(path.join(vaultDir, '.obsidian'), { recursive: true });
		const appJson = path.join(vaultDir, '.obsidian', 'app.json');

		expect(editorLinkPreference(vaultDir)).toEqual({
			style: 'wikilink',
			newLinkFormat: null,
			source: 'diamond-default'
		});

		fs.writeFileSync(appJson, JSON.stringify({
			useMarkdownLinks: true,
			newLinkFormat: 'relative'
		}));
		expect(editorLinkPreference(vaultDir)).toEqual({
			style: 'markdown',
			newLinkFormat: 'relative',
			source: 'obsidian-app-config'
		});
		expect(linkToolbarButton('markdown')).toEqual({ icon: '[]()', title: 'Markdown link' });
		expect(linkInsertion('', 'markdown')).toEqual({ text: '[]()', anchorOffset: 1, headOffset: 1 });
		expect(linkInsertion('Solar Plan', 'markdown')).toEqual({
			text: '[Solar Plan]()',
			anchorOffset: 13,
			headOffset: 13
		});
		expect(linkInsertion('Solar Plan', 'wikilink')).toEqual({
			text: '[[Solar Plan]]',
			anchorOffset: 2,
			headOffset: 12
		});
	});

	test('uses Obsidian line-number preference for editor display', () => {
		const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diamondmd-obsidian-editor-display-'));
		fs.mkdirSync(path.join(vaultDir, '.obsidian'), { recursive: true });
		const appJson = path.join(vaultDir, '.obsidian', 'app.json');

		expect(editorDisplayPreference(vaultDir)).toEqual({
			lineNumbers: true,
			spellcheck: false,
			defaultMode: 'live',
			source: 'diamond-default'
		});

		fs.writeFileSync(appJson, JSON.stringify({ showLineNumber: false }));
		expect(readObsidianAppConfig(vaultDir).settings.find((setting) => setting.id === 'showLineNumber')).toMatchObject({
			label: 'Line numbers',
			value: 'Hidden'
		});
		expect(editorDisplayPreference(vaultDir)).toEqual({
			lineNumbers: false,
			spellcheck: false,
			defaultMode: 'live',
			source: 'obsidian-app-config'
		});

		fs.writeFileSync(appJson, JSON.stringify({ showLineNumber: true }));
		expect(editorDisplayPreference(vaultDir)).toEqual({
			lineNumbers: true,
			spellcheck: false,
			defaultMode: 'live',
			source: 'obsidian-app-config'
		});

		fs.writeFileSync(appJson, JSON.stringify({ spellcheck: true }));
		expect(readObsidianAppConfig(vaultDir).settings.find((setting) => setting.id === 'spellcheck')).toMatchObject({
			label: 'Spellcheck',
			value: 'Enabled'
		});
		expect(editorDisplayPreference(vaultDir)).toEqual({
			lineNumbers: true,
			spellcheck: true,
			defaultMode: 'live',
			source: 'obsidian-app-config'
		});

		fs.writeFileSync(appJson, JSON.stringify({ spellcheck: false }));
		expect(editorDisplayPreference(vaultDir)).toEqual({
			lineNumbers: true,
			spellcheck: false,
			defaultMode: 'live',
			source: 'obsidian-app-config'
		});

		fs.writeFileSync(appJson, JSON.stringify({ defaultViewMode: 'preview' }));
		expect(readObsidianAppConfig(vaultDir).settings.find((setting) => setting.id === 'defaultViewMode')).toMatchObject({
			label: 'Default view mode',
			value: 'Reading view'
		});
		expect(editorDisplayPreference(vaultDir)).toEqual({
			lineNumbers: true,
			spellcheck: false,
			defaultMode: 'read',
			source: 'obsidian-app-config'
		});

		fs.writeFileSync(appJson, JSON.stringify({ defaultViewMode: 'source', livePreview: false }));
		expect(editorDisplayPreference(vaultDir)).toEqual({
			lineNumbers: true,
			spellcheck: false,
			defaultMode: 'source',
			source: 'obsidian-app-config'
		});

		fs.writeFileSync(appJson, JSON.stringify({ defaultViewMode: 'source', livePreview: true }));
		expect(editorDisplayPreference(vaultDir)).toEqual({
			lineNumbers: true,
			spellcheck: false,
			defaultMode: 'live',
			source: 'obsidian-app-config'
		});
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
