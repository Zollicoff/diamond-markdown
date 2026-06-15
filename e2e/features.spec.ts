import { test, expect, type Locator, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { FIXTURE_PATHS } from './setup-fixture';
import { SAVED_SEARCHES_REL_PATH } from '../src/lib/server/saved-searches';
import { formatDate } from '../src/lib/server/templates';
import type { TreeNode } from '../src/lib/types';

/**
 * Feature spec — covers surfaces that don't fit the smoke or hotkey
 * suites: search rail icon, sort-menu z-index, wikilink rendering, and
 * the templates picker.
 */

async function openVault(page: Page): Promise<void> {
	await page.goto('/vault/default', { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
}

async function openSettingsSection(page: Page, section: string): Promise<void> {
	await clickUntilVisible(
		page.getByLabel('Settings'),
		page.getByRole('heading', { name: 'Settings', exact: true })
	);
	const navButton = page.getByRole('button', { name: section, exact: true });
	await expect(navButton).toBeVisible({ timeout: 10_000 });
	await navButton.click();
}

async function openPluginInstaller(page: Page): Promise<void> {
	await openSettingsSection(page, 'Plugins');
	await expect(page.getByLabel('Install from manifest URL')).toBeVisible({ timeout: 10_000 });
}

async function clickUntilVisible(trigger: Locator, target: Locator, timeout = 10_000): Promise<void> {
	await expect(trigger).toBeVisible({ timeout });
	await expect(async () => {
		if (!(await target.isVisible().catch(() => false))) {
			await trigger.click();
		}
		await expect(target).toBeVisible({ timeout: 1_500 });
	}).toPass({ timeout });
}

function git(cwd: string, args: string[]): string {
	return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

function treePaths(nodes: TreeNode[]): string[] {
	const paths: string[] = [];
	for (const node of nodes) {
		paths.push(node.path);
		if (node.children) paths.push(...treePaths(node.children));
	}
	return paths;
}

function findTreeNode(nodes: TreeNode[], target: string): TreeNode | null {
	for (const node of nodes) {
		if (node.path === target) return node;
		const found = node.children ? findTreeNode(node.children, target) : null;
		if (found) return found;
	}
	return null;
}

async function servePluginFiles(files: Record<string, string>): Promise<{ url: (path: string) => string; close: () => Promise<void> }> {
	const server = http.createServer((req, res) => {
		const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
		const body = files[pathname];
		if (!body) {
			res.writeHead(404, { 'content-type': 'text/plain' });
			res.end('not found');
			return;
		}
		res.writeHead(200, {
			'content-type': pathname.endsWith('.json') ? 'application/json' : 'application/javascript'
		});
		res.end(body);
	});
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolve);
	});
	const address = server.address() as AddressInfo;
	return {
		url: (pathname: string) => `http://127.0.0.1:${address.port}${pathname}`,
		close: () => new Promise<void>((resolve, reject) => {
			server.close((err) => err ? reject(err) : resolve());
		})
	};
}

test('indexer writes a config-scoped warm cache and refreshes it on note save', async ({ request }) => {
	const cacheDir = path.join(FIXTURE_PATHS.CONFIG_DIR, 'index-cache');
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'cache-vault');
	fs.rmSync(cacheDir, { recursive: true, force: true });
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	fs.writeFileSync(
		path.join(vaultDir, 'Cache Seed.md'),
		'---\ntitle: Cache Seed\ntags: [cache]\n---\n# Cache Seed\n\nLinks to [[Second Note]] and [Second Note](Second%20Note.md).\n'
	);
	fs.writeFileSync(path.join(vaultDir, 'Second Note.md'), '# Second Note\n\nTarget.\n');

	const created = await request.post('/api/vaults', {
		data: { name: 'Cache Test Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string; path: string } };

	const search = await request.get(`/api/vaults/${vault.id}/search?q=Cache`);
	expect(search.ok()).toBe(true);
	const searchBody = await search.json() as { mode: string; total: number; limit: number; limited: boolean; results: { path: string }[] };
	expect(searchBody.mode).toBe('title');
	expect(searchBody.total).toBeGreaterThanOrEqual(1);
	expect(searchBody.limit).toBe(25);
	expect(searchBody.limited).toBe(false);
	expect(searchBody.results.some((r) => r.path === 'Cache Seed.md')).toBe(true);
	const fullSearch = await request.get(`/api/vaults/${vault.id}/search?q=${encodeURIComponent('Links to')}&full=1`);
	expect(fullSearch.ok()).toBe(true);
	const fullSearchBody = await fullSearch.json() as { mode: string; total: number; limit: number; limited: boolean; results: { path: string; snippet: string }[] };
	expect(fullSearchBody.mode).toBe('full');
	expect(fullSearchBody.total).toBeGreaterThanOrEqual(1);
	expect(fullSearchBody.limit).toBe(50);
	expect(fullSearchBody.limited).toBe(false);
	expect(fullSearchBody.results.find((r) => r.path === 'Cache Seed.md')?.snippet).toContain('Links to');
	const filteredSearch = await request.get(`/api/vaults/${vault.id}/search?q=${encodeURIComponent('tag:cache content:Links')}&full=1`);
	expect(filteredSearch.ok()).toBe(true);
	const filteredSearchBody = await filteredSearch.json() as { total: number; results: { path: string; snippet: string }[] };
	expect(filteredSearchBody.total).toBe(1);
	expect(filteredSearchBody.results[0]?.path).toBe('Cache Seed.md');

	const cacheFiles = fs.readdirSync(cacheDir)
		.filter((name) => name.endsWith('.json'))
		.map((name) => path.join(cacheDir, name));
	type CacheEntry = {
		version: number;
		vaultId: string;
		vaultPath: string;
		files: { rel: string }[];
		notes: { notePath: string }[];
		linksOutRaw: { notePath: string; targets: string[] }[];
		searchDocs: { notePath: string; text: string }[];
	};

	const cacheEntries = cacheFiles.map((cachePath) => ({
		cachePath,
		body: JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as CacheEntry
	}));
	const matchingCaches = cacheEntries.filter((entry) => entry.body.vaultId === vault.id);
	expect(matchingCaches).toHaveLength(1);
	const { cachePath, body: cache } = matchingCaches[0];
	const updatedCache = (): CacheEntry => JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as CacheEntry;
	expect(cache.version).toBe(3);
	expect(cache.vaultId).toBe(vault.id);
	expect(cache.vaultPath).toBe(path.resolve(vaultDir));
	expect(cache.files.map((f) => f.rel)).toContain('Cache Seed.md');
	expect(cache.notes.map((n) => n.notePath)).toContain('Cache Seed.md');
	expect(cache.linksOutRaw.find((row) => row.notePath === 'Cache Seed.md')?.targets).toContain('Second Note');
	expect(cache.linksOutRaw.find((row) => row.notePath === 'Cache Seed.md')?.targets).toContain('Second Note.md');
	expect(cache.searchDocs.find((row) => row.notePath === 'Cache Seed.md')?.text).toContain('Links to [[Second Note]] and [Second Note](Second%20Note.md).');

	const saved = await request.post(`/api/vaults/${vault.id}/note`, {
		data: { path: 'Cache Added.md', content: '# Cache Added\n\nMore cache text.\n', commitNow: false }
	});
	expect(saved.ok()).toBe(true);
	const updated = updatedCache();
	expect(updated.files.map((f) => f.rel)).toContain('Cache Added.md');
	expect(updated.notes.map((n) => n.notePath)).toContain('Cache Added.md');
	expect(updated.searchDocs.find((row) => row.notePath === 'Cache Added.md')?.text).toContain('More cache text.');
	const addedSearch = await request.get(`/api/vaults/${vault.id}/search?q=${encodeURIComponent('More cache text')}&full=1`);
	expect(addedSearch.ok()).toBe(true);
	const addedSearchBody = await addedSearch.json() as { results: { path: string; snippet: string }[] };
	expect(addedSearchBody.results.find((r) => r.path === 'Cache Added.md')?.snippet).toContain('More cache text');
});

test('Obsidian import check reports vault readiness without changing files', async ({ request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'obsidian-import-vault');
	const notePath = path.join(vaultDir, 'Notes', 'Home.md');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(path.join(vaultDir, '.obsidian'), { recursive: true });
	fs.mkdirSync(path.join(vaultDir, '.obsidian', 'plugins', 'dataview'), { recursive: true });
	fs.mkdirSync(path.join(vaultDir, '.obsidian', 'snippets'), { recursive: true });
	fs.mkdirSync(path.join(vaultDir, 'Notes'), { recursive: true });
	fs.mkdirSync(path.join(vaultDir, 'Attachments'), { recursive: true });
	fs.mkdirSync(path.join(vaultDir, 'Templates'), { recursive: true });
	fs.mkdirSync(path.join(vaultDir, 'Snippet Bank'), { recursive: true });
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'app.json'), JSON.stringify({
		attachmentFolderPath: 'Attachments',
		newFileLocation: 'folder',
		newFileFolderPath: 'Notes/Inbox',
		useMarkdownLinks: true,
		alwaysUpdateLinks: true,
		newLinkFormat: 'relative',
		showUnsupportedFiles: true,
		showLineNumber: false,
		spellcheck: true,
		tabSize: 8,
		readableLineLength: true,
		strictLineBreaks: false,
		defaultViewMode: 'preview',
		livePreview: true,
		promptDelete: false,
		trashOption: 'local',
		privateSetting: 'do-not-render-this-app-config-value'
	}));
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'daily-notes.json'), JSON.stringify({
		folder: 'Journal',
		template: 'Templates/Daily Template',
		format: 'YYYY/MMMM/YYYY-MM-DD-ddd',
		privateDailySetting: 'do-not-render-this-daily-config-value'
	}));
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'templates.json'), JSON.stringify({
		folder: 'Snippet Bank',
		dateFormat: 'dddd, MMMM D, YYYY',
		timeFormat: 'HH:mm:ss',
		privateTemplatesSetting: 'do-not-render-this-template-config-value'
	}));
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'appearance.json'), JSON.stringify({
		theme: 'moonstone',
		cssTheme: 'Minimal',
		baseFontSize: 16,
		accentColor: '#0f766e',
		enabledCssSnippets: ['cards'],
		privateAppearanceSetting: 'do-not-render-this-appearance-value'
	}));
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'core-plugins.json'), JSON.stringify([
		'file-explorer',
		'global-search',
		'canvas',
		'markdown-importer'
	]));
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'hotkeys.json'), JSON.stringify({
		'switcher:open': [{ modifiers: ['Mod'], key: 'K' }],
		'editor:toggle-bold': [{ modifiers: ['Mod'], key: 'B' }],
		privateHotkeySetting: 'do-not-render-this-hotkey-value'
	}));
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'graph.json'), JSON.stringify({
		search: 'tag:#project path:"Notes"',
		showOrphans: false,
		showAttachments: true,
		showTags: true,
		hideUnresolved: false,
		colorGroups: [{ query: 'tag:#urgent', color: { a: 1, rgb: 16711680 } }],
		nodeSizeMultiplier: 1.2,
		linkDistance: 250,
		privateGraphSetting: 'do-not-render-this-graph-value'
	}));
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'snippets', 'cards.css'), '.cards { content: "do-not-render-this-css-value"; }');
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'bookmarks.json'), JSON.stringify({
		items: [
			{ type: 'file', path: 'Notes/Home.md', title: 'Home bookmark' },
			{ type: 'file', path: 'Missing.md', title: 'Missing bookmark' },
			{ type: 'search', query: 'tag:#todo' }
		]
	}));
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'community-plugins.json'), JSON.stringify(['dataview']));
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'plugins', 'dataview', 'manifest.json'), JSON.stringify({
		id: 'dataview',
		name: 'Dataview',
		version: '0.5.0',
		author: 'Blacksmith'
	}));
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'plugins', 'dataview', 'data.json'), JSON.stringify({
		queries: true,
		refreshInterval: 5000
	}));
	fs.writeFileSync(notePath, '# Home\n\nObsidian note with ![[roof.png]].\n');
	fs.writeFileSync(path.join(vaultDir, 'Daily.md'), '# Daily\n\nLog.\n');
	fs.writeFileSync(path.join(vaultDir, 'Board.canvas'), '{"nodes":[],"edges":[]}\n');
	fs.writeFileSync(path.join(vaultDir, 'Attachments', 'roof.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
	git(vaultDir, ['init']);
	const before = fs.readFileSync(notePath, 'utf-8');

	const checked = await request.post('/api/vaults/import-check', {
		data: { path: vaultDir }
	});
	expect(checked.ok()).toBe(true);
	const body = await checked.json() as {
		path: string;
		markdownFiles: number;
		assetFiles: number;
		canvasFiles: number;
		obsidianConfig: boolean;
		gitRepository: boolean;
		likelyAttachmentFolders: string[];
		obsidianAppConfig: {
			status: string;
			attachmentFolderPath?: string;
			attachmentFolderStatus: string;
			newFileFolderPath?: string;
			newFileFolderStatus: string;
			showUnsupportedFiles?: boolean;
			showLineNumber?: boolean;
			spellcheck?: boolean;
			tabSize?: number;
			readableLineLength?: boolean;
			defaultMode?: string;
			promptDelete?: boolean;
			settings: { id: string; label: string; value: string; level: string; detail: string }[];
			warnings: string[];
		};
		obsidianDailyNotes: {
			status: string;
			folderPath?: string | null;
			folderStatus: string;
			templatePath?: string;
			templateStatus: string;
			format?: string;
			formatStatus: string;
			plannedPath: string;
			settings: { id: string; label: string; value: string; level: string; detail: string }[];
			warnings: string[];
		};
		obsidianTemplates: {
			status: string;
			folderPath?: string;
			folderStatus: string;
			dateFormat?: string;
			dateFormatStatus: string;
			timeFormat?: string;
			timeFormatStatus: string;
			settings: { id: string; label: string; value: string; level: string; detail: string }[];
			warnings: string[];
		};
		obsidianAppearance: {
			status: string;
			theme?: string;
			cssTheme?: string;
			baseFontSize?: number;
			accentColor?: string;
			enabledCssSnippets: string[];
			snippetFiles: string[];
			missingEnabledSnippets: string[];
			settings: { id: string; label: string; value: string; level: string; detail: string }[];
			warnings: string[];
		};
		obsidianCorePlugins: {
			status: string;
			enabledPlugins: string[];
			entries: { id: string; label: string; support: string; level: string; detail: string }[];
			supportedCount: number;
			partialCount: number;
			manualCount: number;
			unknownCount: number;
			warnings: string[];
		};
		obsidianHotkeys: {
			status: string;
			commandCount: number;
			bindingCount: number;
			commands: { commandId: string; bindings: string[] }[];
			omittedCommands: number;
			warnings: string[];
		};
		obsidianBookmarks: {
			status: string;
			source: string;
			importableBookmarks: number;
			importableSearches: number;
			paths: string[];
			searchQueries: string[];
			warnings: string[];
		};
		obsidianGraph: {
			status: string;
			searchQuery?: string;
			showOrphans?: boolean;
			showAttachments?: boolean;
			showTags?: boolean;
			hideUnresolved?: boolean;
			colorGroupCount: number;
			settings: { id: string; label: string; value: string; level: string; detail: string }[];
			warnings: string[];
		};
		obsidianPluginFolders: string[];
		obsidianPlugins: {
			id: string;
			name: string;
			version?: string;
			author?: string;
			enabled: boolean;
			manifestStatus: string;
			settingsStatus: string;
			settingsPath?: string;
			settingsKeys?: string[];
		}[];
		recommendedExcludedFolders: string[];
		checklist: { id: string; detail: string; level: string }[];
		markdownExamples: string[];
		canvasExamples: string[];
	};
	expect(body.path).toBe(path.resolve(vaultDir));
	expect(body.markdownFiles).toBe(2);
	expect(body.assetFiles).toBe(1);
	expect(body.canvasFiles).toBe(1);
	expect(body.obsidianConfig).toBe(true);
	expect(body.gitRepository).toBe(true);
	expect(body.likelyAttachmentFolders).toContain('Attachments');
	expect(body.obsidianAppConfig).toMatchObject({
		status: 'present',
		attachmentFolderPath: 'Attachments',
		attachmentFolderStatus: 'safe',
		newFileFolderPath: 'Notes/Inbox',
		newFileFolderStatus: 'safe',
		showUnsupportedFiles: true,
		showLineNumber: false,
		spellcheck: true,
		tabSize: 8,
		readableLineLength: true,
		defaultMode: 'read',
		promptDelete: false
	});
	expect(body.obsidianAppConfig.settings.map((setting) => setting.id)).toEqual([
		'attachmentFolderPath',
		'newFileLocation',
		'newFileFolderPath',
		'useMarkdownLinks',
		'alwaysUpdateLinks',
		'newLinkFormat',
		'showUnsupportedFiles',
		'showLineNumber',
		'spellcheck',
		'tabSize',
		'readableLineLength',
		'strictLineBreaks',
		'livePreview',
		'defaultViewMode',
		'promptDelete',
		'trashOption'
	]);
	expect(body.obsidianAppConfig.settings.find((setting) => setting.id === 'attachmentFolderPath')).toMatchObject({
		label: 'Attachment folder',
		value: 'Attachments',
		level: 'info'
	});
	expect(body.obsidianAppConfig.settings.find((setting) => setting.id === 'showLineNumber')).toMatchObject({
		label: 'Line numbers',
		value: 'Hidden',
		level: 'info'
	});
	expect(body.obsidianAppConfig.settings.find((setting) => setting.id === 'showUnsupportedFiles')).toMatchObject({
		label: 'Unsupported files',
		value: 'Visible',
		level: 'info'
	});
	expect(body.obsidianAppConfig.settings.find((setting) => setting.id === 'spellcheck')).toMatchObject({
		label: 'Spellcheck',
		value: 'Enabled',
		level: 'info'
	});
	expect(body.obsidianAppConfig.settings.find((setting) => setting.id === 'tabSize')).toMatchObject({
		label: 'Tab size',
		value: '8 spaces',
		level: 'info'
	});
	expect(body.obsidianAppConfig.settings.find((setting) => setting.id === 'readableLineLength')).toMatchObject({
		label: 'Readable line length',
		value: 'Enabled',
		level: 'info'
	});
	expect(body.obsidianAppConfig.settings.find((setting) => setting.id === 'strictLineBreaks')).toMatchObject({
		label: 'Strict line breaks',
		value: 'Disabled',
		level: 'info'
	});
	expect(body.obsidianAppConfig.settings.find((setting) => setting.id === 'defaultViewMode')).toMatchObject({
		label: 'Default view mode',
		value: 'Reading view',
		level: 'info'
	});
	expect(body.obsidianAppConfig.settings.find((setting) => setting.id === 'promptDelete')).toMatchObject({
		label: 'Delete confirmation',
		value: 'Disabled',
		level: 'info'
	});
	expect(body.obsidianAppConfig.settings.find((setting) => setting.id === 'useMarkdownLinks')?.detail).toContain('editor link button inserts Markdown link syntax');
	expect(JSON.stringify(body.obsidianAppConfig)).not.toContain('do-not-render-this-app-config-value');
	expect(body.obsidianDailyNotes).toMatchObject({
		status: 'present',
		folderPath: 'Journal',
		folderStatus: 'safe',
		templatePath: 'Templates/Daily Template.md',
		templateStatus: 'safe',
		format: 'YYYY/MMMM/YYYY-MM-DD-ddd',
		formatStatus: 'safe'
	});
	expect(body.obsidianDailyNotes.settings.map((setting) => setting.id)).toEqual(['folder', 'template', 'format']);
	expect(body.obsidianDailyNotes.plannedPath).toMatch(/^Journal\/\d{4}\/[A-Za-z]+\/\d{4}-\d{2}-\d{2}-[A-Za-z]{3}\.md$/);
	expect(JSON.stringify(body.obsidianDailyNotes)).not.toContain('do-not-render-this-daily-config-value');
	expect(body.obsidianTemplates).toMatchObject({
		status: 'present',
		folderPath: 'Snippet Bank',
		folderStatus: 'safe',
		dateFormat: 'dddd, MMMM D, YYYY',
		dateFormatStatus: 'safe',
		timeFormat: 'HH:mm:ss',
		timeFormatStatus: 'safe'
	});
	expect(body.obsidianTemplates.settings.map((setting) => setting.id)).toEqual(['folder', 'dateFormat', 'timeFormat']);
	expect(JSON.stringify(body.obsidianTemplates)).not.toContain('do-not-render-this-template-config-value');
	expect(body.obsidianAppearance).toMatchObject({
		status: 'present',
		theme: 'moonstone',
		cssTheme: 'Minimal',
		baseFontSize: 16,
		accentColor: '#0f766e',
		enabledCssSnippets: ['cards'],
		snippetFiles: ['cards'],
		missingEnabledSnippets: []
	});
	expect(body.obsidianAppearance.settings.map((setting) => setting.id)).toEqual([
		'cssSnippetFiles',
		'theme',
		'cssTheme',
		'baseFontSize',
		'accentColor',
		'enabledCssSnippets'
	]);
	expect(JSON.stringify(body.obsidianAppearance)).not.toContain('do-not-render-this-appearance-value');
	expect(JSON.stringify(body.obsidianAppearance)).not.toContain('do-not-render-this-css-value');
	expect(body.obsidianCorePlugins).toMatchObject({
		status: 'present',
		enabledPlugins: ['canvas', 'file-explorer', 'global-search', 'markdown-importer'],
		supportedCount: 2,
		partialCount: 1,
		manualCount: 1,
		unknownCount: 0
	});
	expect(body.obsidianCorePlugins.entries.map((entry) => `${entry.id}:${entry.support}`)).toEqual([
		'canvas:partial',
		'file-explorer:supported',
		'global-search:supported',
		'markdown-importer:manual'
	]);
	expect(body.obsidianHotkeys).toMatchObject({
		status: 'present',
		commandCount: 2,
		bindingCount: 2,
		commands: [
			{ commandId: 'editor:toggle-bold', bindings: ['Mod+B'], support: 'manual' },
			{ commandId: 'switcher:open', bindings: ['Mod+K'], support: 'mapped', diamondCommandId: 'switcher.open' }
		],
		omittedCommands: 0
	});
	expect(JSON.stringify(body.obsidianHotkeys)).not.toContain('do-not-render-this-hotkey-value');
	expect(body.obsidianBookmarks).toMatchObject({
		status: 'present',
		source: 'bookmarks',
		importableBookmarks: 1,
		importableSearches: 1,
		paths: ['Notes/Home.md'],
		searchQueries: ['tag:#todo']
	});
	expect(body.obsidianGraph).toMatchObject({
		status: 'present',
		searchQuery: 'tag:#project path:"Notes"',
		showOrphans: false,
		showAttachments: true,
		showTags: true,
		hideUnresolved: false,
		colorGroupCount: 1
	});
	expect(body.obsidianGraph.settings.map((setting) => setting.id)).toEqual([
		'search',
		'showOrphans',
		'showAttachments',
		'showTags',
		'hideUnresolved',
		'colorGroups',
		'nodeSizeMultiplier',
		'linkDistance'
	]);
	expect(JSON.stringify(body.obsidianGraph)).not.toContain('do-not-render-this-graph-value');
	expect(JSON.stringify(body.obsidianGraph)).not.toContain('tag:#urgent');
	expect(body.obsidianPluginFolders).toContain('.obsidian/plugins/dataview');
	expect(body.obsidianPlugins[0]).toMatchObject({
		id: 'dataview',
		name: 'Dataview',
		version: '0.5.0',
		author: 'Blacksmith',
		enabled: true,
		manifestStatus: 'present',
		settingsStatus: 'present',
		settingsPath: '.obsidian/plugins/dataview/data.json',
		settingsKeys: ['queries', 'refreshInterval']
	});
	expect(body.recommendedExcludedFolders).toContain('.obsidian');
	expect(body.markdownExamples).toContain('Daily.md');
	expect(body.canvasExamples).toContain('Board.canvas');
	expect(body.checklist.find((row) => row.id === 'obsidian-plugins')?.level).toBe('info');
	expect(body.checklist.find((row) => row.id === 'obsidian-templates')?.detail).toContain('templates load from Snippet Bank');
	expect(body.checklist.find((row) => row.id === 'obsidian-appearance')?.detail).toContain('6 Appearance settings found');
	expect(body.checklist.find((row) => row.id === 'obsidian-core-plugins')?.detail).toContain('4 enabled core plugins found');
	expect(body.checklist.find((row) => row.id === 'obsidian-hotkeys')?.detail).toContain('2 custom hotkey bindings across 2 commands found');
	expect(body.checklist.find((row) => row.id === 'obsidian-bookmarks')?.detail).toContain('1 note bookmark item and 1 search bookmark item can seed Diamond bookmarks and saved searches');
	expect(body.checklist.find((row) => row.id === 'obsidian-graph')?.detail).toContain('8 Graph settings found');
	expect(body.checklist.find((row) => row.id === 'obsidian-graph')?.level).toBe('warn');
	expect(body.checklist.find((row) => row.id === 'canvas')?.detail).toContain('git-backed node and edge editing');
	expect(body.checklist.find((row) => row.id === 'preserve')?.level).toBe('ok');
	expect(body.checklist.find((row) => row.id === 'preserve')?.detail).toContain('do not rewrite markdown content');
	expect(fs.readFileSync(notePath, 'utf-8')).toBe(before);
});

test('home add vault form previews Obsidian import checklist', async ({ page }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'obsidian-ui-import-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(path.join(vaultDir, '.obsidian', 'plugins', 'kanban'), { recursive: true });
	fs.mkdirSync(path.join(vaultDir, '.obsidian', 'snippets'), { recursive: true });
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'app.json'), JSON.stringify({
		attachmentFolderPath: 'Media/Uploads',
		newFileLocation: 'folder',
		newFileFolderPath: 'Notes/Inbox',
		useMarkdownLinks: true,
		alwaysUpdateLinks: false,
		newLinkFormat: 'relative',
		showUnsupportedFiles: true,
		showLineNumber: false,
		spellcheck: true,
		tabSize: 8,
		readableLineLength: true,
		defaultViewMode: 'source',
		livePreview: false,
		promptDelete: false,
		trashOption: 'local',
		privateSetting: 'do-not-render-this-app-config-value'
	}));
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'daily-notes.json'), JSON.stringify({
		folder: 'Journal',
		template: 'Templates/Daily Template',
		format: 'YYYY/MMMM/YYYY-MM-DD-ddd',
		privateDailySetting: 'do-not-render-this-daily-config-value'
	}));
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'templates.json'), JSON.stringify({
		folder: 'Snippet Bank',
		dateFormat: 'dddd, MMMM D, YYYY',
		timeFormat: 'HH:mm:ss',
		privateTemplatesSetting: 'do-not-render-this-template-config-value'
	}));
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'appearance.json'), JSON.stringify({
		theme: 'moonstone',
		cssTheme: 'Minimal',
		baseFontSize: 16,
		accentColor: '#0f766e',
		enabledCssSnippets: ['cards'],
		privateAppearanceSetting: 'do-not-render-this-appearance-value'
	}));
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'core-plugins.json'), JSON.stringify([
		'file-explorer',
		'global-search',
		'canvas',
		'markdown-importer'
	]));
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'hotkeys.json'), JSON.stringify({
		'switcher:open': [{ modifiers: ['Mod'], key: 'K' }],
		'editor:toggle-bold': [{ modifiers: ['Mod'], key: 'B' }],
		privateHotkeySetting: 'do-not-render-this-hotkey-value'
	}));
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'graph.json'), JSON.stringify({
		search: 'tag:#project path:"Notes"',
		showOrphans: false,
		showAttachments: true,
		showTags: true,
		hideUnresolved: false,
		colorGroups: [{ query: 'tag:#urgent', color: { a: 1, rgb: 16711680 } }],
		nodeSizeMultiplier: 1.2,
		linkDistance: 250,
		privateGraphSetting: 'do-not-render-this-graph-value'
	}));
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'snippets', 'cards.css'), '.cards { content: "do-not-render-this-css-value"; }');
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'bookmarks.json'), JSON.stringify({
		items: [
			{
				type: 'group',
				title: 'Pinned',
				items: [
					{ type: 'file', path: 'Home.md', title: 'Home bookmark' },
					{ type: 'file', path: 'Missing.md', title: 'Missing bookmark' },
					{ type: 'search', title: 'Todo search', query: 'tag:#todo' }
				]
			}
		]
	}));
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'community-plugins.json'), JSON.stringify(['obsidian-kanban']));
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'plugins', 'kanban', 'manifest.json'), JSON.stringify({
		id: 'obsidian-kanban',
		name: 'Kanban',
		version: '2.0.0'
	}));
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'plugins', 'kanban', 'data.json'), JSON.stringify({
		laneWidth: 280,
		secretValue: 'do-not-render-this-value',
		showCheckboxes: true
	}));
	fs.writeFileSync(path.join(vaultDir, 'Board.canvas'), '{"nodes":[],"edges":[]}\n');
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n\n![[roof.png]]\n');
	fs.writeFileSync(path.join(vaultDir, 'roof.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

	await page.goto('/', { waitUntil: 'domcontentloaded' });
	await page.getByRole('button', { name: /Add vault/ }).click();
	await page.getByLabel('Display name').fill('Obsidian UI Import');
	await page.getByLabel('Absolute path').fill(vaultDir);
	await page.getByRole('button', { name: 'Inspect import' }).click();
	await expect(page.locator('.import-card')).toContainText('Import readiness');
	await expect(page.locator('.import-card')).toContainText('1 note');
	await expect(page.locator('.import-card')).toContainText('1 asset');
	await expect(page.locator('.import-card')).toContainText('1 canvas');
	await expect(page.locator('.import-card')).toContainText('1 Obsidian plugin folder');
	await expect(page.locator('.import-card')).toContainText('1 Canvas file found');
	await expect(page.locator('.import-card')).toContainText('Canvas files');
	await expect(page.locator('.import-card')).toContainText('Board.canvas');
	await expect(page.locator('.import-card')).toContainText('1 asset file found outside named attachment folders; verify embed paths after import.');
	await expect(page.locator('.import-card')).toContainText('No .git folder found; initialize Git before first GitHub sync.');
	await expect(page.locator('.import-card')).toContainText('Obsidian app config');
	await expect(page.locator('.import-card')).toContainText('15 supported app settings found.');
	await expect(page.locator('.import-card')).toContainText('Attachment folder');
	await expect(page.locator('.import-card')).toContainText('Media/Uploads');
	await expect(page.locator('.import-card')).toContainText('Configured new-note folder');
	await expect(page.locator('.import-card')).toContainText('Notes/Inbox');
	await expect(page.locator('.import-card')).toContainText('Link style');
	await expect(page.locator('.import-card')).toContainText('Markdown links');
	await expect(page.locator('.import-card')).toContainText('Unsupported files');
	await expect(page.locator('.import-card')).toContainText('Visible');
	await expect(page.locator('.import-card')).toContainText('Line numbers');
	await expect(page.locator('.import-card')).toContainText('Hidden');
	await expect(page.locator('.import-card')).toContainText('Spellcheck');
	await expect(page.locator('.import-card')).toContainText('Enabled');
	await expect(page.locator('.import-card')).toContainText('Tab size');
	await expect(page.locator('.import-card')).toContainText('8 spaces');
	await expect(page.locator('.import-card')).toContainText('Readable line length');
	await expect(page.locator('.import-card')).toContainText('Live Preview');
	await expect(page.locator('.import-card')).toContainText('Default view mode');
	await expect(page.locator('.import-card')).toContainText('Editing view');
	await expect(page.locator('.import-card')).toContainText('Source mode');
	await expect(page.locator('.import-card')).toContainText('Delete confirmation');
	await expect(page.locator('.import-card')).toContainText('Update links on rename');
	await expect(page.locator('.import-card')).toContainText('Disabled in Obsidian');
	await expect(page.locator('.import-card')).not.toContainText('do-not-render-this-app-config-value');
	await expect(page.locator('.import-card')).toContainText('Daily Notes settings');
	await expect(page.locator('.import-card')).toContainText('3 Daily Notes settings found');
	await expect(page.locator('.import-card')).toContainText('Obsidian Daily Notes');
	await expect(page.locator('.import-card')).toContainText('Daily note folder');
	await expect(page.locator('.import-card')).toContainText('Journal');
	await expect(page.locator('.import-card')).toContainText('Daily note template');
	await expect(page.locator('.import-card')).toContainText('Templates/Daily Template.md');
	await expect(page.locator('.import-card')).toContainText('Daily note date format');
	await expect(page.locator('.import-card')).toContainText('YYYY/MMMM/YYYY-MM-DD-ddd');
	await expect(page.locator('.import-card')).not.toContainText('do-not-render-this-daily-config-value');
	await expect(page.locator('.import-card')).toContainText('Templates settings');
	await expect(page.locator('.import-card')).toContainText('3 Templates settings found');
	await expect(page.locator('.import-card')).toContainText('Obsidian Templates');
	await expect(page.locator('.import-card')).toContainText('Template folder');
	await expect(page.locator('.import-card')).toContainText('Snippet Bank');
	await expect(page.locator('.import-card')).toContainText('Template date format');
	await expect(page.locator('.import-card')).toContainText('dddd, MMMM D, YYYY');
	await expect(page.locator('.import-card')).toContainText('Template time format');
	await expect(page.locator('.import-card')).toContainText('HH:mm:ss');
	await expect(page.locator('.import-card')).not.toContainText('do-not-render-this-template-config-value');
	await expect(page.locator('.import-card')).toContainText('Appearance settings');
	await expect(page.locator('.import-card')).toContainText('6 Appearance settings found');
	await expect(page.locator('.import-card')).toContainText('Obsidian Appearance');
	await expect(page.locator('.import-card')).toContainText('Community theme');
	await expect(page.locator('.import-card')).toContainText('Minimal');
	await expect(page.locator('.import-card')).toContainText('CSS snippet files');
	await expect(page.locator('.import-card')).toContainText('cards.css');
	await expect(page.locator('.import-card')).toContainText('Enabled CSS snippets');
	await expect(page.locator('.import-card')).toContainText('cards');
	await expect(page.locator('.import-card')).not.toContainText('do-not-render-this-appearance-value');
	await expect(page.locator('.import-card')).not.toContainText('do-not-render-this-css-value');
	await expect(page.locator('.import-card')).toContainText('Obsidian core plugins');
	await expect(page.locator('.import-card')).toContainText('4 enabled core plugins found');
	await expect(page.locator('.import-card')).toContainText('File explorer');
	await expect(page.locator('.import-card')).toContainText('Search');
	await expect(page.locator('.import-card')).toContainText('Canvas');
	await expect(page.locator('.import-card')).toContainText('Markdown importer');
	await expect(page.locator('.import-card')).toContainText('supported');
	await expect(page.locator('.import-card')).toContainText('partial');
	await expect(page.locator('.import-card')).toContainText('manual');
	await expect(page.locator('.import-card')).toContainText('Obsidian hotkeys');
	await expect(page.locator('.import-card')).toContainText('2 custom hotkey bindings across 2 commands found');
	await expect(page.locator('.import-card')).toContainText('switcher:open');
	await expect(page.locator('.import-card')).toContainText('Diamond: Quick switcher');
	await expect(page.locator('.import-card')).toContainText('mapped: Mod+K');
	await expect(page.locator('.import-card')).toContainText('editor:toggle-bold');
	await expect(page.locator('.import-card')).toContainText('manual: Mod+B');
	await expect(page.locator('.import-card')).not.toContainText('do-not-render-this-hotkey-value');
	await expect(page.locator('.import-card')).toContainText('Obsidian bookmarks');
	await expect(page.locator('.import-card')).toContainText('1 note bookmark item and 1 search bookmark item can seed Diamond bookmarks and saved searches');
	await expect(page.locator('.import-card')).toContainText('Home.md');
	await expect(page.locator('.import-card')).toContainText('tag:#todo');
	await expect(page.locator('.import-card')).toContainText('Graph settings');
	await expect(page.locator('.import-card')).toContainText('8 Graph settings found');
	await expect(page.locator('.import-card')).toContainText('Obsidian Graph');
	await expect(page.locator('.import-card')).toContainText('Graph search filter');
	await expect(page.locator('.import-card')).toContainText('tag:#project path:"Notes"');
	await expect(page.locator('.import-card')).toContainText('Attachment graph nodes');
	await expect(page.locator('.import-card')).toContainText('Shown in Obsidian');
	await expect(page.locator('.import-card')).toContainText('Tag graph nodes');
	await expect(page.locator('.import-card')).toContainText('Unresolved links');
	await expect(page.locator('.import-card')).toContainText('Graph color groups');
	await expect(page.locator('.import-card')).not.toContainText('do-not-render-this-graph-value');
	await expect(page.locator('.import-card')).not.toContainText('tag:#urgent');
	await expect(page.locator('.import-card')).toContainText('Recommended excludes');
	await expect(page.locator('.import-card')).toContainText('.obsidian');
	await expect(page.locator('.import-card')).toContainText('Obsidian plugin settings');
	await expect(page.locator('.import-card')).toContainText('Preserved read-only');
	await expect(page.locator('.import-card')).toContainText('Diamond will not execute Obsidian community plugins');
	await expect(page.locator('.import-card')).toContainText('Kanban (obsidian-kanban): enabled, settings: laneWidth, secretValue, showCheckboxes');
	await expect(page.locator('.import-card')).toContainText('Enabled in Obsidian');
	await expect(page.locator('.import-card')).toContainText('3 setting keys');
	await expect(page.locator('.import-card')).toContainText('Top-level keys: laneWidth, secretValue, showCheckboxes');
	await expect(page.locator('.import-card')).toContainText('Preserved for manual migration; Diamond will not execute this Obsidian plugin.');
	await expect(page.locator('.import-card')).not.toContainText('do-not-render-this-value');

	await page.getByRole('button', { name: 'Add vault', exact: true }).click();
	await expect(page).toHaveURL(/\/vault\/obsidian-ui-import$/);
});

test('file tree honors Obsidian unsupported file visibility', async ({ page, request }) => {
	const hiddenVaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'unsupported-files-hidden-vault');
	fs.rmSync(hiddenVaultDir, { recursive: true, force: true });
	fs.mkdirSync(hiddenVaultDir, { recursive: true });
	fs.writeFileSync(path.join(hiddenVaultDir, 'Home.md'), '# Home\n\nVisible note.\n');
	fs.writeFileSync(path.join(hiddenVaultDir, 'packet.pdf'), Buffer.from('%PDF-hidden'));

	const hiddenCreated = await request.post('/api/vaults', {
		data: { name: 'Unsupported Files Hidden', path: hiddenVaultDir }
	});
	expect(hiddenCreated.ok(), await hiddenCreated.text()).toBe(true);
	const { vault: hiddenVault } = await hiddenCreated.json() as { vault: { id: string } };
	const hiddenTreeResponse = await request.get(`/api/vaults/${hiddenVault.id}/tree`);
	expect(hiddenTreeResponse.ok(), await hiddenTreeResponse.text()).toBe(true);
	const hiddenTree = await hiddenTreeResponse.json() as { tree: TreeNode[] };
	expect(treePaths(hiddenTree.tree)).toContain('Home.md');
	expect(treePaths(hiddenTree.tree)).not.toContain('packet.pdf');

	const visibleVaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'unsupported-files-visible-vault');
	fs.rmSync(visibleVaultDir, { recursive: true, force: true });
	fs.mkdirSync(path.join(visibleVaultDir, '.obsidian'), { recursive: true });
	fs.writeFileSync(path.join(visibleVaultDir, '.obsidian', 'app.json'), JSON.stringify({ showUnsupportedFiles: true }));
	fs.writeFileSync(path.join(visibleVaultDir, 'Home.md'), '# Home\n\nVisible note.\n');
	fs.writeFileSync(path.join(visibleVaultDir, 'packet.pdf'), Buffer.from('%PDF-visible'));

	const visibleCreated = await request.post('/api/vaults', {
		data: { name: 'Unsupported Files Visible', path: visibleVaultDir }
	});
	expect(visibleCreated.ok(), await visibleCreated.text()).toBe(true);
	const { vault } = await visibleCreated.json() as { vault: { id: string } };
	const visibleTreeResponse = await request.get(`/api/vaults/${vault.id}/tree`);
	expect(visibleTreeResponse.ok(), await visibleTreeResponse.text()).toBe(true);
	const visibleTree = await visibleTreeResponse.json() as { tree: TreeNode[] };
	expect(findTreeNode(visibleTree.tree, 'packet.pdf')).toMatchObject({
		path: 'packet.pdf',
		type: 'file',
		fileKind: 'unsupported'
	});

	const raw = await request.get(`/api/vaults/${vault.id}/raw/packet.pdf`);
	expect(raw.ok(), await raw.text()).toBe(true);
	expect(raw.headers()['content-type']).toContain('application/pdf');

	await page.goto(`/vault/${vault.id}`, { waitUntil: 'domcontentloaded' });
	const assetLink = page.getByRole('link', { name: /packet\.pdf/ });
	await expect(assetLink).toBeVisible({ timeout: 10_000 });
	await expect(assetLink).toHaveAttribute('href', `/api/vaults/${vault.id}/raw/packet.pdf`);
	await expect(assetLink).toHaveAttribute('target', '_blank');
	await expect(assetLink).toHaveAttribute('rel', 'noopener noreferrer');
});

test('search rail icon opens a search tab; results fire on input', async ({ page }) => {
	await openVault(page);
	await page.locator('.rail .r-btn[aria-label="Search"]').click();
	const search = page.locator('.search-view');
	await expect(search).toBeVisible({ timeout: 3_000 });
	await search.locator('input[type="text"]').first().fill('Frontmatter');
	// Wait out the 120ms debounce + network round trip.
	await expect(search.locator('.result').first()).toBeVisible({ timeout: 4_000 });
	await expect(search.locator('.result').first()).toContainText(/Frontmatter/i);
	await expect(search.locator('.result').first().locator('mark').filter({ hasText: /Frontmatter/i })).toHaveCount(2);
});

test('search tab saves, restores, and deletes vault-local saved searches', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'saved-search-ui-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Solar.md'), '# Solar\n\nIllinois Shines roof survey steps.\n');
	fs.writeFileSync(path.join(vaultDir, 'Water.md'), '# Water\n\nWater quality survey archive.\n');

	const created = await request.post('/api/vaults', {
		data: { name: 'Saved Search UI Vault', path: vaultDir }
	});
	expect(created.ok(), await created.text()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	await page.goto(`/vault/${vault.id}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
	await page.locator('.rail .r-btn[aria-label="Search"]').click();
	const search = page.locator('.search-view');
	await expect(search).toBeVisible({ timeout: 3_000 });

	await search.getByRole('button', { name: 'Title' }).click();
	await search.locator('input[type="text"]').first().fill('Illinois Shines');
	await expect(search.locator('.result').first()).toBeVisible({ timeout: 4_000 });
	await search.getByLabel('Saved search name').fill('Solar followups');
	await search.getByRole('button', { name: 'Save current search' }).click();
	await expect(page.getByText('Saved search saved')).toBeVisible({ timeout: 5_000 });
	const saved = search.getByRole('button', { name: 'Run saved search Notes Solar followups' });
	await expect(saved).toBeVisible();
	await expect(search.locator('.result').first()).toContainText('Solar');

	const savedFile = path.join(vaultDir, '.diamondmd', 'searches.json');
	await expect.poll(() => fs.existsSync(savedFile)).toBe(true);
	const savedBody = JSON.parse(fs.readFileSync(savedFile, 'utf-8')) as { searches: { name: string; query: string; mode: string }[] };
	expect(savedBody.searches).toEqual([
		expect.objectContaining({ name: 'Solar followups', query: 'Illinois Shines', mode: 'full' })
	]);
	await expect.poll(() => git(vaultDir, ['status', '--short'])).toBe('');

	await search.locator('input[type="text"]').first().fill('Water');
	await expect(search.locator('.result').first()).toContainText('Water');
	await saved.click();
	await expect(search.locator('input[type="text"]').first()).toHaveValue('Illinois Shines');
	await expect(search.getByRole('button', { name: 'Notes', exact: true })).toBeVisible();
	await expect(search.locator('.result').first()).toContainText('Solar');

	await search.getByRole('button', { name: 'Delete saved search Solar followups' }).click();
	const deleteDialog = page.getByRole('alertdialog', { name: 'Delete saved search' });
	await expect(deleteDialog).toBeVisible();
	await expect(deleteDialog).toContainText('Delete saved search "Solar followups"?');
	await deleteDialog.getByRole('button', { name: 'Cancel' }).click();
	await expect(deleteDialog).toBeHidden();
	await expect(saved).toBeVisible();
	await search.getByRole('button', { name: 'Delete saved search Solar followups' }).click();
	await expect(deleteDialog).toBeVisible();
	await deleteDialog.getByRole('button', { name: 'Delete' }).click();
	await expect(saved).toHaveCount(0);
	await expect.poll(() => {
		const body = JSON.parse(fs.readFileSync(savedFile, 'utf-8')) as { searches: unknown[] };
		return body.searches.length;
	}).toBe(0);
	await expect.poll(() => git(vaultDir, ['status', '--short'])).toBe('');
});

test('bookmarks are vault-local and follow git-backed note and folder moves', async ({ request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'bookmarks-sync-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(path.join(vaultDir, 'Notes', 'Archive'), { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Notes', 'Solar.md'), '# Solar\n\nIllinois Shines survey.\n');
	fs.writeFileSync(path.join(vaultDir, 'Notes', 'Archive', 'Old.md'), '# Old\n\nArchive note.\n');

	const created = await request.post('/api/vaults', {
		data: { name: 'Bookmarks Sync Vault', path: vaultDir }
	});
	expect(created.ok(), await created.text()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	const saved = await request.post(`/api/vaults/${vault.id}/bookmarks`, {
		data: { path: 'Notes/Solar.md', title: 'Solar' }
	});
	expect(saved.ok(), await saved.text()).toBe(true);
	expect(await saved.json()).toMatchObject({
		created: true,
		bookmark: { path: 'Notes/Solar.md', title: 'Solar' }
	});
	const bookmarksFile = path.join(vaultDir, '.diamondmd', 'bookmarks.json');
	await expect.poll(() => fs.existsSync(bookmarksFile)).toBe(true);
	expect(JSON.parse(fs.readFileSync(bookmarksFile, 'utf-8'))).toMatchObject({
		bookmarks: [expect.objectContaining({ path: 'Notes/Solar.md', title: 'Solar' })]
	});
	await expect.poll(() => git(vaultDir, ['status', '--short'])).toBe('');

	const renamedNote = await request.patch(`/api/vaults/${vault.id}/note`, {
		data: { from: 'Notes/Solar.md', to: 'Notes/Solar Visit.md' }
	});
	expect(renamedNote.ok(), await renamedNote.text()).toBe(true);
	expect(JSON.parse(fs.readFileSync(bookmarksFile, 'utf-8'))).toMatchObject({
		bookmarks: [expect.objectContaining({ path: 'Notes/Solar Visit.md', title: 'Solar Visit' })]
	});
	await expect.poll(() => git(vaultDir, ['status', '--short'])).toBe('');

	const savedNested = await request.post(`/api/vaults/${vault.id}/bookmarks`, {
		data: { path: 'Notes/Archive/Old.md', title: 'Old' }
	});
	expect(savedNested.ok(), await savedNested.text()).toBe(true);
	const renamedFolder = await request.patch(`/api/vaults/${vault.id}/folder`, {
		data: { from: 'Notes/Archive', to: 'Projects/Archive' }
	});
	expect(renamedFolder.ok(), await renamedFolder.text()).toBe(true);
	const afterFolderRename = JSON.parse(fs.readFileSync(bookmarksFile, 'utf-8')) as { bookmarks: { path: string }[] };
	expect(afterFolderRename.bookmarks.map((bookmark) => bookmark.path)).toContain('Projects/Archive/Old.md');
	await expect.poll(() => git(vaultDir, ['status', '--short'])).toBe('');

	const deletedNote = await request.delete(`/api/vaults/${vault.id}/note?path=${encodeURIComponent('Notes/Solar Visit.md')}`);
	expect(deletedNote.ok(), await deletedNote.text()).toBe(true);
	const afterDelete = JSON.parse(fs.readFileSync(bookmarksFile, 'utf-8')) as { bookmarks: { path: string }[] };
	expect(afterDelete.bookmarks.map((bookmark) => bookmark.path)).toEqual(['Projects/Archive/Old.md']);
	await expect.poll(() => git(vaultDir, ['status', '--short'])).toBe('');
});

test('vault registration seeds Obsidian bookmarks into git-backed Diamond bookmarks', async ({ request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'obsidian-bookmark-import-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(path.join(vaultDir, '.obsidian'), { recursive: true });
	fs.mkdirSync(path.join(vaultDir, 'Projects'), { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n');
	fs.writeFileSync(path.join(vaultDir, 'Projects', 'Solar.md'), '# Solar\n');
	fs.writeFileSync(path.join(vaultDir, 'Board.canvas'), '{"nodes":[],"edges":[]}\n');
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'bookmarks.json'), JSON.stringify({
		items: [
			{
				type: 'group',
				title: 'Pinned',
				items: [
					{ type: 'file', path: 'Home.md', title: 'Home bookmark', ctime: 1_700_000_000_000 },
					{ type: 'file', path: 'Projects/Solar.md', title: 'Solar bookmark' },
					{ type: 'search', title: 'Solar saved search', query: 'tag:#client/solar content:"roof photos"' },
					{ type: 'file', path: 'Board.canvas', title: 'Board' },
					{ type: 'file', path: 'Missing.md', title: 'Missing' }
				]
			}
		]
	}));
	git(vaultDir, ['init']);
	git(vaultDir, ['config', 'user.email', 'test@example.com']);
	git(vaultDir, ['config', 'user.name', 'Diamond Test']);
	git(vaultDir, ['add', '.']);
	git(vaultDir, ['commit', '-m', 'init fixture']);

	const created = await request.post('/api/vaults', {
		data: { name: 'Obsidian Bookmark Import', path: vaultDir }
	});
	expect(created.ok(), await created.text()).toBe(true);
	const createdBody = await created.json() as {
		vault: { id: string };
		obsidianBookmarks: {
			imported: number;
			importedSearches: number;
			created: boolean;
			sha: string | null;
			paths: string[];
			searchQueries: string[];
		};
	};
	expect(createdBody.obsidianBookmarks).toMatchObject({
		created: true,
		imported: 2,
		importedSearches: 1,
		paths: ['Projects/Solar.md', 'Home.md'],
		searchQueries: ['tag:#client/solar content:"roof photos"']
	});
	expect(createdBody.obsidianBookmarks.sha).toMatch(/^[a-f0-9]{40}$/);

	const bookmarksFile = path.join(vaultDir, '.diamondmd', 'bookmarks.json');
	expect(JSON.parse(fs.readFileSync(bookmarksFile, 'utf-8'))).toMatchObject({
		bookmarks: [
			expect.objectContaining({ path: 'Projects/Solar.md', title: 'Solar bookmark' }),
			expect.objectContaining({ path: 'Home.md', title: 'Home bookmark' })
		]
	});
	const listed = await request.get(`/api/vaults/${createdBody.vault.id}/bookmarks`);
	expect(listed.ok(), await listed.text()).toBe(true);
	const listedBody = await listed.json() as { bookmarks: { path: string }[] };
	expect(listedBody.bookmarks.map((bookmark) => bookmark.path)).toEqual(['Projects/Solar.md', 'Home.md']);
	expect(git(vaultDir, ['log', '--oneline', '--', '.diamondmd/bookmarks.json'])).toContain('create: imported Obsidian bookmarks and searches');
	const searchesFile = path.join(vaultDir, SAVED_SEARCHES_REL_PATH);
	expect(JSON.parse(fs.readFileSync(searchesFile, 'utf-8'))).toMatchObject({
		searches: [
			expect.objectContaining({
				name: 'Solar saved search',
				query: 'tag:#client/solar content:"roof photos"',
				mode: 'full'
			})
		]
	});
	const listedSearches = await request.get(`/api/vaults/${createdBody.vault.id}/searches`);
	expect(listedSearches.ok(), await listedSearches.text()).toBe(true);
	const listedSearchesBody = await listedSearches.json() as { searches: { query: string; mode: string }[] };
	expect(listedSearchesBody.searches).toEqual([
		expect.objectContaining({ query: 'tag:#client/solar content:"roof photos"', mode: 'full' })
	]);
	expect(git(vaultDir, ['log', '--oneline', '--', SAVED_SEARCHES_REL_PATH])).toContain('create: imported Obsidian bookmarks and searches');
	await expect.poll(() => git(vaultDir, ['status', '--short'])).toBe('');

	const second = await request.post('/api/vaults', {
		data: { name: 'Obsidian Bookmark Import Again', path: vaultDir }
	});
	expect(second.ok(), await second.text()).toBe(true);
	const secondBody = await second.json() as { obsidianBookmarks: { imported: number; importedSearches: number; created: boolean; reason?: string } };
	expect(secondBody.obsidianBookmarks).toMatchObject({
		created: false,
		imported: 0,
		importedSearches: 0,
		reason: 'diamond-bookmarks-and-searches-exist'
	});
	await expect.poll(() => git(vaultDir, ['status', '--short'])).toBe('');
});

test('search tab virtualizes large full-text result sets while preserving scroll access', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'search-virtual-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	for (let i = 0; i < 240; i += 1) {
		const padded = String(i).padStart(3, '0');
		fs.writeFileSync(
			path.join(vaultDir, `Virtual ${padded}.md`),
			`# Virtual ${padded}\n\nvirtualneedle result ${padded}\n`
		);
	}

	const created = await request.post('/api/vaults', {
		data: { name: 'Search Virtual Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	await page.goto(`/vault/${vault.id}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
	await page.locator('.rail .r-btn[aria-label="Search"]').click();
	const search = page.locator('.search-view');
	await search.getByRole('button', { name: 'Title' }).click();
	await search.locator('input[type="text"]').first().fill('virtualneedle');
	await expect(search.locator('.hint')).toContainText('Showing 200 of 240 matches', { timeout: 5_000 });
	await expect(search.locator('.result').first()).toContainText('Virtual 000');

	const rendered = await search.locator('.result').count();
	expect(rendered).toBeLessThan(60);
	await expect(search.getByRole('button', { name: 'Load more (200/240)' })).toBeVisible();
	await search.getByRole('button', { name: 'Load more (200/240)' }).click();
	await expect(search.locator('.hint')).toContainText('240 results', { timeout: 5_000 });

	await search.locator('.results').evaluate((el) => {
		el.scrollTop = el.scrollHeight;
		el.dispatchEvent(new Event('scroll'));
	});
	await expect(search.locator('.result').filter({ hasText: 'Virtual 239' })).toBeVisible({ timeout: 4_000 });
});

test('search tab groups results by folder without breaking virtualized result rows', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'search-grouped-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(path.join(vaultDir, 'Projects'), { recursive: true });
	fs.mkdirSync(path.join(vaultDir, 'Archive'), { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Inbox.md'), '# Inbox\n\nsearchgroupneedle root note.\n');
	fs.writeFileSync(path.join(vaultDir, 'Projects', 'Solar.md'), '# Solar\n\nsearchgroupneedle project note.\n');
	fs.writeFileSync(path.join(vaultDir, 'Projects', 'Water.md'), '# Water\n\nsearchgroupneedle second project note.\n');
	fs.writeFileSync(path.join(vaultDir, 'Archive', 'Old.md'), '# Old\n\nsearchgroupneedle archived note.\n');

	const created = await request.post('/api/vaults', {
		data: { name: 'Search Grouped Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	await page.goto(`/vault/${vault.id}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
	await page.locator('.rail .r-btn[aria-label="Search"]').click();
	const search = page.locator('.search-view');
	await search.getByRole('button', { name: 'Title' }).click();
	await search.locator('input[type="text"]').first().fill('searchgroupneedle');
	await expect(search.locator('.hint')).toContainText('4 results', { timeout: 5_000 });
	await expect(search.locator('.result-group')).toHaveCount(0);

	await search.getByRole('button', { name: 'Folder' }).click();
	await expect(search.locator('.result-group')).toHaveCount(3);
	await expect(search.locator('.result-group').filter({ hasText: 'Projects' })).toContainText('2');
	await expect(search.locator('.result-group').filter({ hasText: 'Archive' })).toContainText('1');
	await expect(search.locator('.result-group').filter({ hasText: 'Vault root' })).toContainText('1');
	await expect(search.locator('.result').filter({ hasText: 'Projects/Solar.md' })).toBeVisible();

	await search.getByRole('button', { name: 'Off' }).click();
	await expect(search.locator('.result-group')).toHaveCount(0);
	await expect(search.locator('.result')).toHaveCount(4);

	await expect(search.getByLabel('Search result folders')).toContainText('Projects');
	await search.getByRole('button', { name: 'Narrow search to Projects' }).click();
	await expect(search.locator('input[type="text"]').first()).toHaveValue('searchgroupneedle path:"Projects"');
	await expect(search.locator('.hint')).toContainText('2 results', { timeout: 5_000 });
	await expect(search.locator('.result')).toHaveCount(2);
	await expect(search.locator('.result').filter({ hasText: 'Projects/Solar.md' })).toBeVisible();
	await expect(search.locator('.result').filter({ hasText: 'Archive/Old.md' })).toHaveCount(0);
	await expect(search.getByLabel('Search result folders')).toHaveCount(0);
});

test('right panel shows unlinked note mentions beside backlinks', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'unlinked-mentions-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n\nTarget note.\n');
	fs.writeFileSync(path.join(vaultDir, 'Linked.md'), '# Linked\n\nSee [[Home]].\n');
	fs.writeFileSync(path.join(vaultDir, 'Mentioner.md'), '# Mentioner\n\nHome came up in conversation without a wikilink.\n');

	const created = await request.post('/api/vaults', {
		data: { name: 'Unlinked Mentions Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	const loaded = await request.get(`/api/vaults/${vault.id}/note?path=${encodeURIComponent('Home.md')}`);
	expect(loaded.ok()).toBe(true);
	const body = await loaded.json() as {
		backlinks: { path: string; title: string }[];
		unlinkedMentions: { path: string; title: string }[];
	};
	expect(body.backlinks).toEqual([{ path: 'Linked.md', title: 'Linked' }]);
	expect(body.unlinkedMentions).toEqual([{ path: 'Mentioner.md', title: 'Mentioner' }]);

	await page.goto(`/vault/${vault.id}/note/Home.md`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.right-col')).toContainText('Unlinked mentions');
	await expect(page.locator('.right-col')).toContainText('Mentioner');
});

test('new note command uses an in-app name dialog', async ({ page, request }) => {
	const notePath = 'Dialog Created Note.md';
	const abs = path.join(FIXTURE_PATHS.VAULT_DIR, notePath);
	if (fs.existsSync(abs)) fs.unlinkSync(abs);

	await openVault(page);
	const dialog = page.getByRole('dialog', { name: 'New note' });
	await clickUntilVisible(page.getByLabel('File tree controls').getByRole('button', { name: 'New note' }), dialog);
	await dialog.getByLabel('Name in vault root').fill('Dialog Created Note');
	await dialog.getByRole('button', { name: 'Create note' }).click();
	await expect(dialog).toBeHidden();
	await expect.poll(() => fs.existsSync(abs)).toBe(true);

	const loaded = await request.get(`/api/vaults/default/note?path=${encodeURIComponent(notePath)}`);
	expect(loaded.ok()).toBe(true);
	await request.delete(`/api/vaults/default/note?path=${encodeURIComponent(notePath)}`).catch(() => undefined);
});

test('generic new note command honors safe Obsidian configured folder', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'obsidian-new-note-folder-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(path.join(vaultDir, '.obsidian'), { recursive: true });
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'app.json'), JSON.stringify({
		newFileLocation: 'folder',
		newFileFolderPath: 'Notes/Inbox'
	}, null, 2));
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n\nSeed note.\n');

	const created = await request.post('/api/vaults', {
		data: { name: 'Obsidian New Note Folder', path: vaultDir }
	});
	expect(created.ok(), await created.text()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };
	const location = await request.get(`/api/vaults/${vault.id}/new-note-location`);
	expect(location.ok()).toBe(true);
	const locationBody = await location.json() as { folder: string | null; source: string };
	expect(locationBody).toEqual({
		folder: 'Notes/Inbox',
		source: 'obsidian-app-config'
	});

	await page.goto(`/vault/${vault.id}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
	const dialog = page.getByRole('dialog', { name: 'New note' });
	await clickUntilVisible(page.getByLabel('File tree controls').getByRole('button', { name: 'New note' }), dialog);
	await dialog.getByLabel('Name in Notes/Inbox').fill('Configured Folder Note');
	await dialog.getByRole('button', { name: 'Create note' }).click();
	await expect(dialog).toBeHidden();

	const notePath = 'Notes/Inbox/Configured Folder Note.md';
	await expect.poll(() => fs.existsSync(path.join(vaultDir, notePath))).toBe(true);
	const loaded = await request.get(`/api/vaults/${vault.id}/note?path=${encodeURIComponent(notePath)}`);
	expect(loaded.ok()).toBe(true);
	await expect.poll(() => git(vaultDir, ['status', '--short'])).toBe('');
});

test('daily note command honors safe Obsidian daily-note settings', async ({ request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'obsidian-daily-notes-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(path.join(vaultDir, '.obsidian'), { recursive: true });
	fs.mkdirSync(path.join(vaultDir, 'Templates'), { recursive: true });
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'daily-notes.json'), JSON.stringify({
		folder: 'Journal',
		template: 'Templates/Daily Template',
		format: 'YYYY/MMMM/YYYY-MM-DD-ddd'
	}, null, 2));
	fs.writeFileSync(
		path.join(vaultDir, 'Templates', 'Daily Template.md'),
		'# {{title}}\n\nDate={{date:YYYY-MM-DD}}\nTomorrow={{date+1d:YYYY-MM-DD}}\n{{cursor}}\n'
	);
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n\nSeed note.\n');

	const created = await request.post('/api/vaults', {
		data: { name: 'Obsidian Daily Notes Vault', path: vaultDir }
	});
	expect(created.ok(), await created.text()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	const today = new Date();
	const datedNoon = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0);
	const expectedDatePath = formatDate(datedNoon, 'YYYY/MMMM/YYYY-MM-DD-ddd');
	const expectedPath = `Journal/${expectedDatePath}.md`;
	const expectedTitle = path.basename(expectedPath, '.md');

	const opened = await request.post(`/api/vaults/${vault.id}/daily`);
	expect(opened.ok(), await opened.text()).toBe(true);
	const openedBody = await opened.json() as { path: string; created: boolean; sha: string | null };
	expect(openedBody.path).toBe(expectedPath);
	expect(openedBody.created).toBe(true);
	expect(openedBody.sha).toMatch(/^[a-f0-9]{7,}$/);

	const content = fs.readFileSync(path.join(vaultDir, expectedPath), 'utf-8');
	expect(content).toContain(`# ${expectedTitle}`);
	expect(content).toContain(`Date=${formatDate(datedNoon, 'YYYY-MM-DD')}`);
	expect(content).toContain(`Tomorrow=${formatDate(new Date(datedNoon.getFullYear(), datedNoon.getMonth(), datedNoon.getDate() + 1, 12, 0, 0), 'YYYY-MM-DD')}`);
	expect(content).not.toContain('{{cursor}}');

	const reopened = await request.post(`/api/vaults/${vault.id}/daily`);
	expect(reopened.ok(), await reopened.text()).toBe(true);
	expect(await reopened.json()).toMatchObject({ path: expectedPath, created: false });
	await expect.poll(() => git(vaultDir, ['status', '--short'])).toBe('');
});

test('template command honors safe Obsidian Templates settings', async ({ request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'obsidian-templates-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(path.join(vaultDir, '.obsidian'), { recursive: true });
	fs.mkdirSync(path.join(vaultDir, 'Snippet Bank', 'Meetings'), { recursive: true });
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'templates.json'), JSON.stringify({
		folder: 'Snippet Bank/',
		dateFormat: '[Template date default]',
		timeFormat: '[Template time default]'
	}, null, 2));
	fs.writeFileSync(
		path.join(vaultDir, 'Snippet Bank', 'Meeting.md'),
		'---\nkind: template\n---\n# {{title}}\nDate={{date}}\nTime={{time}}\nExplicit={{date:YYYY-MM-DD}}\n{{cursor}}\n'
	);
	fs.writeFileSync(
		path.join(vaultDir, 'Snippet Bank', 'Meetings', 'Weekly.md'),
		'# Weekly\n'
	);
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n\nSeed note.\n');

	const created = await request.post('/api/vaults', {
		data: { name: 'Obsidian Templates Vault', path: vaultDir }
	});
	expect(created.ok(), await created.text()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	const listed = await request.get(`/api/vaults/${vault.id}/templates`);
	expect(listed.ok(), await listed.text()).toBe(true);
	const listedBody = await listed.json() as { folder: string; templates: { name: string; path: string }[] };
	expect(listedBody.folder).toBe('Snippet Bank');
	expect(listedBody.templates).toEqual([
		{ name: 'Meeting', path: 'Snippet Bank/Meeting.md' },
		{ name: 'Meetings/Weekly', path: 'Snippet Bank/Meetings/Weekly.md' }
	]);

	const loaded = await request.get(`/api/vaults/${vault.id}/templates?path=${encodeURIComponent('Snippet Bank/Meeting.md')}&title=${encodeURIComponent('Kickoff')}`);
	expect(loaded.ok(), await loaded.text()).toBe(true);
	const loadedBody = await loaded.json() as { name: string; path: string; content: string };
	const now = new Date();
	expect(loadedBody).toMatchObject({
		name: 'Meeting',
		path: 'Snippet Bank/Meeting.md'
	});
	expect(loadedBody.content).toContain('# Kickoff');
	expect(loadedBody.content).toContain('Date=Template date default');
	expect(loadedBody.content).toContain('Time=Template time default');
	expect(loadedBody.content).toContain(`Explicit=${formatDate(now, 'YYYY-MM-DD')}`);
	expect(loadedBody.content).toContain('{{cursor}}');
	expect(loadedBody.content).not.toContain('kind: template');

	const legacyLoaded = await request.get(`/api/vaults/${vault.id}/templates?name=${encodeURIComponent('Meeting')}&title=${encodeURIComponent('Legacy')}`);
	expect(legacyLoaded.ok(), await legacyLoaded.text()).toBe(true);
	const legacyBody = await legacyLoaded.json() as { path: string; content: string };
	expect(legacyBody.path).toBe('Snippet Bank/Meeting.md');
	expect(legacyBody.content).toContain('# Legacy');

	const outside = await request.get(`/api/vaults/${vault.id}/templates?path=${encodeURIComponent('Templates/Meeting.md')}`);
	expect(outside.status()).toBe(400);
});

test('editor link button honors Obsidian Markdown-link preference', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'obsidian-markdown-link-style-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(path.join(vaultDir, '.obsidian'), { recursive: true });
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'app.json'), JSON.stringify({
		useMarkdownLinks: true,
		newLinkFormat: 'relative'
	}));
	fs.mkdirSync(path.join(vaultDir, 'Notes'), { recursive: true });
	fs.mkdirSync(path.join(vaultDir, 'Projects'), { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Notes', 'Home.md'), '# Home\n\nLink style test.\n');
	fs.writeFileSync(path.join(vaultDir, 'Projects', 'Solar Plan.md'), '# Solar Plan\n');

	const created = await request.post('/api/vaults', {
		data: { name: 'Obsidian Markdown Link Style', path: vaultDir }
	});
	expect(created.ok(), await created.text()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	const preference = await request.get(`/api/vaults/${vault.id}/link-style`);
	expect(preference.ok(), await preference.text()).toBe(true);
	expect(await preference.json()).toMatchObject({
		style: 'markdown',
		newLinkFormat: 'relative',
		source: 'obsidian-app-config'
	});

	await page.goto(`/vault/${vault.id}/note/${encodeURIComponent('Notes/Home.md')}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });
	await page.getByRole('tab', { name: 'Source' }).click();
	await expect(page.getByRole('button', { name: 'Markdown link' })).toBeVisible();
	const editor = page.locator('.cm-content').first();
	await editor.click();
	await page.keyboard.press('Meta+End');
	await page.keyboard.press('Enter');
	await page.keyboard.type('MARK:');
	await page.getByRole('button', { name: 'Markdown link' }).click();
	const text = await editor.innerText();
	expect(text).toContain('MARK:[]()');
	expect(text).not.toContain('MARK:[[]]');

	await page.keyboard.press('Meta+End');
	await page.keyboard.press('Enter');
	await page.keyboard.type('TARGET:Solar Plan');
	await page.keyboard.down('Shift');
	for (let i = 0; i < 'Solar Plan'.length; i += 1) {
		await page.keyboard.press('ArrowLeft');
	}
	await page.keyboard.up('Shift');
	await page.getByRole('button', { name: 'Markdown link' }).click();
	const linkedText = await editor.innerText();
	expect(linkedText).toContain('TARGET:[Solar Plan](../Projects/Solar%20Plan.md)');
});

test('editor display honors Obsidian app preferences', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'obsidian-editor-display-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(path.join(vaultDir, '.obsidian'), { recursive: true });
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'app.json'), JSON.stringify({
		showLineNumber: false,
		showInlineTitle: true,
		spellcheck: true,
		tabSize: 8,
		readableLineLength: true,
		autoPairBrackets: true,
		autoPairMarkdown: true,
		foldHeading: true,
		foldIndent: true
	}));
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n\nLine one.\nLine two.\n');

	const created = await request.post('/api/vaults', {
		data: { name: 'Obsidian Editor Display', path: vaultDir }
	});
	expect(created.ok(), await created.text()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	const preference = await request.get(`/api/vaults/${vault.id}/editor-preferences`);
	expect(preference.ok(), await preference.text()).toBe(true);
	expect(await preference.json()).toEqual({
		lineNumbers: false,
		showInlineTitle: true,
		spellcheck: true,
		tabSize: 8,
		readableLineLength: true,
		autoPairBrackets: true,
		autoPairMarkdown: true,
		folding: true,
		propertiesInDocument: 'source',
		defaultMode: 'live',
		source: 'obsidian-app-config'
	});

	await page.goto(`/vault/${vault.id}/note/${encodeURIComponent('Home.md')}`, { waitUntil: 'domcontentloaded' });
	const inlineTitle = page.locator('.inline-title').first();
	await expect(inlineTitle).toBeVisible({ timeout: 10_000 });
	await expect(inlineTitle).toHaveText('Home');
	const editorHost = page.locator('.editor').first();
	await expect(editorHost).toHaveClass(/readable-line-length/, { timeout: 10_000 });
	const editor = editorHost.locator('.cm-editor').first();
	await expect(editor).toBeVisible({ timeout: 10_000 });
	await expect(editor.locator('.cm-lineNumbers')).toHaveCount(0);
	await expect(editor.locator('.cm-content')).toHaveAttribute('spellcheck', 'true');
	await expect(editor.locator('.cm-content')).toHaveCSS('tab-size', '8');
	await expect(editor.locator('.cm-content')).toHaveCSS('max-width', '820px');
	await expect(editor.locator('.cm-foldGutter')).toHaveCount(1);
	await page.getByRole('tab', { name: 'Source' }).click();
	await editor.locator('.cm-content').click();
	await page.keyboard.press('Meta+End');
	await page.keyboard.press('Enter');
	await page.keyboard.type('BRACKET:(');
	const editorText = async () => editor.locator('.cm-content').innerText();
	await expect.poll(editorText).toContain('BRACKET:()');
	await page.keyboard.type(')');
	await page.keyboard.press('Enter');
	await page.keyboard.type('PAIR:(ok)');
	await page.keyboard.press('Enter');
	await page.keyboard.type('STAR:*');
	await expect.poll(editorText).toContain('STAR:**');
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('Enter');
	await page.keyboard.type('MARK:*ok*');
	await page.keyboard.press('Enter');
	await page.keyboard.type('HIGHLIGHT:==');
	await expect.poll(editorText).toContain('PAIR:(ok)');
	await expect.poll(editorText).toContain('STAR:**');
	await expect.poll(editorText).toContain('MARK:*ok*');
	await expect.poll(editorText).toContain('HIGHLIGHT:====');
});

test('live preview honors Obsidian hidden properties preference', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'obsidian-hidden-properties-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(path.join(vaultDir, '.obsidian'), { recursive: true });
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'app.json'), JSON.stringify({
		propertiesInDocument: 'hidden'
	}));
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), [
		'---',
		'title: Hidden Properties',
		'tags:',
		'  - private',
		'---',
		'# Hidden Properties',
		'',
		'Visible body.'
	].join('\n'));

	const created = await request.post('/api/vaults', {
		data: { name: 'Obsidian Hidden Properties', path: vaultDir }
	});
	expect(created.ok(), await created.text()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	const preference = await request.get(`/api/vaults/${vault.id}/editor-preferences`);
	expect(preference.ok(), await preference.text()).toBe(true);
	expect(await preference.json()).toEqual({
		lineNumbers: true,
		showInlineTitle: false,
		spellcheck: false,
		tabSize: 4,
		readableLineLength: false,
		autoPairBrackets: true,
		autoPairMarkdown: true,
		folding: false,
		propertiesInDocument: 'hidden',
		defaultMode: 'live',
		source: 'obsidian-app-config'
	});

	await page.goto(`/vault/${vault.id}/note/${encodeURIComponent('Home.md')}`, { waitUntil: 'domcontentloaded' });
	const editor = page.locator('.cm-content').first();
	await expect(editor).toBeVisible({ timeout: 10_000 });
	const renderedEditorText = async () => editor.evaluate((element) => (element as HTMLElement).innerText);
	await expect.poll(renderedEditorText).toContain('Visible body.');
	expect(await renderedEditorText()).not.toContain('title: Hidden Properties');
	expect(await renderedEditorText()).not.toContain('private');
	expect(await editor.locator('.cm-hidden-frontmatter').count()).toBeGreaterThan(0);

	await page.getByRole('tab', { name: 'Source' }).click();
	await expect.poll(renderedEditorText).toContain('title: Hidden Properties');
	await expect.poll(renderedEditorText).toContain('private');
	await expect(editor.locator('.cm-hidden-frontmatter')).toHaveCount(0);
});

test('vault shell applies safe Obsidian appearance preferences', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'obsidian-appearance-applied-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(path.join(vaultDir, '.obsidian'), { recursive: true });
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'appearance.json'), JSON.stringify({
		theme: 'moonstone',
		cssTheme: 'Minimal',
		baseFontSize: 18,
		accentColor: '#0f766e',
		enabledCssSnippets: ['cards']
	}));
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n\nAppearance settings apply safely.\n');

	const created = await request.post('/api/vaults', {
		data: { name: 'Obsidian Appearance Applied', path: vaultDir }
	});
	expect(created.ok(), await created.text()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	const preference = await request.get(`/api/vaults/${vault.id}/appearance-preferences`);
	expect(preference.ok(), await preference.text()).toBe(true);
	expect(await preference.json()).toEqual({
		baseFontSize: 18,
		accentColor: '#0f766e',
		source: 'obsidian-appearance'
	});

	await page.goto(`/vault/${vault.id}/note/${encodeURIComponent('Home.md')}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
	await expect.poll(async () => page.evaluate(() => document.documentElement.style.getPropertyValue('--vault-base-font-size'))).toBe('18px');
	await expect.poll(async () => page.evaluate(() => document.documentElement.style.getPropertyValue('--accent'))).toBe('#0f766e');
	await expect.poll(async () => page.evaluate(() => document.documentElement.style.getPropertyValue('--accent-soft'))).toBe('rgba(15, 118, 110, 0.14)');
	await expect.poll(async () => page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('18px');

	await page.goto('/', { waitUntil: 'domcontentloaded' });
	await expect.poll(async () => page.evaluate(() => document.documentElement.style.getPropertyValue('--vault-base-font-size'))).toBe('');
	await expect.poll(async () => page.evaluate(() => document.documentElement.style.getPropertyValue('--accent'))).toBe('');
	await expect.poll(async () => page.evaluate(() => document.documentElement.style.getPropertyValue('--accent-soft'))).toBe('');
});

test('note panes honor Obsidian default view mode preference', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'obsidian-default-view-mode-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(path.join(vaultDir, '.obsidian'), { recursive: true });
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'app.json'), JSON.stringify({
		defaultViewMode: 'preview',
		readableLineLength: true
	}));
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n\nReading view by default.\n');

	const created = await request.post('/api/vaults', {
		data: { name: 'Obsidian Default View Mode', path: vaultDir }
	});
	expect(created.ok(), await created.text()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	const preference = await request.get(`/api/vaults/${vault.id}/editor-preferences`);
	expect(preference.ok(), await preference.text()).toBe(true);
	expect(await preference.json()).toEqual({
		lineNumbers: true,
		showInlineTitle: false,
		spellcheck: false,
		tabSize: 4,
		readableLineLength: true,
		autoPairBrackets: true,
		autoPairMarkdown: true,
		folding: false,
		propertiesInDocument: 'source',
		defaultMode: 'read',
		source: 'obsidian-app-config'
	});

	await page.goto(`/vault/${vault.id}/note/${encodeURIComponent('Home.md')}`, { waitUntil: 'domcontentloaded' });
	await expect(page.getByRole('tab', { name: 'Read' })).toHaveClass(/active/, { timeout: 10_000 });
	const preview = page.locator('.preview').first();
	await expect(preview).toHaveClass(/readable-line-length/, { timeout: 10_000 });
	await expect(preview).toContainText('Reading view by default.');
	await expect.poll(async () => Math.round(await preview.evaluate((element) => element.getBoundingClientRect().width))).toBeLessThanOrEqual(860);
	await expect(page.locator('.cm-editor')).toHaveCount(0);
});

test('delete note command uses an in-app confirmation dialog', async ({ page, request }) => {
	const notePath = 'Delete Dialog Note.md';
	const abs = path.join(FIXTURE_PATHS.VAULT_DIR, notePath);
	if (fs.existsSync(abs)) fs.unlinkSync(abs);
	const created = await request.post('/api/vaults/default/note', {
		data: { path: notePath, content: '# Delete Dialog Note\n\nTemporary note.\n', commitNow: false }
	});
	expect(created.ok()).toBe(true);

	await openVault(page);
	const file = page.locator('.file-link').filter({ hasText: 'Delete Dialog Note' });
	await expect(file).toBeVisible();
	await file.click({ button: 'right' });
	await page.getByRole('menuitem', { name: 'Delete' }).click();
	const dialog = page.getByRole('alertdialog', { name: 'Delete note' });
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: 'Cancel' }).click();
	await expect(dialog).toBeHidden();
	expect(fs.existsSync(abs)).toBe(true);

	await file.click({ button: 'right' });
	await page.getByRole('menuitem', { name: 'Delete' }).click();
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: 'Delete' }).click();
	await expect.poll(() => fs.existsSync(abs)).toBe(false);
});

test('note deletes honor Obsidian promptDelete false', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'obsidian-prompt-delete-note-vault');
	const notePath = 'Skip Delete Prompt.md';
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(path.join(vaultDir, '.obsidian'), { recursive: true });
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'app.json'), JSON.stringify({ promptDelete: false }));
	fs.writeFileSync(path.join(vaultDir, notePath), '# Skip Delete Prompt\n\nTemporary note.\n');

	const registered = await request.post('/api/vaults', {
		data: { name: 'Obsidian Prompt Delete Note Vault', path: vaultDir }
	});
	expect(registered.ok(), await registered.text()).toBe(true);
	const { vault } = await registered.json() as { vault: { id: string } };
	const preference = await request.get(`/api/vaults/${vault.id}/delete-preferences`);
	expect(preference.ok(), await preference.text()).toBe(true);
	expect(await preference.json()).toEqual({
		confirmDeletes: false,
		source: 'obsidian-app-config'
	});

	await page.goto(`/vault/${vault.id}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
	const file = page.locator('.file-link').filter({ hasText: 'Skip Delete Prompt' }).first();
	await expect(file).toBeVisible();
	await file.click({ button: 'right' });
	const deleteResponse = page.waitForResponse((response) =>
		response.url().includes(`/api/vaults/${vault.id}/note`) &&
		response.request().method() === 'DELETE'
	);
	await page.getByRole('menuitem', { name: 'Delete' }).click();
	const deleted = await deleteResponse;
	expect(deleted.ok(), await deleted.text()).toBe(true);
	await expect(page.getByRole('alertdialog', { name: 'Delete note' })).toHaveCount(0);
	await expect.poll(() => fs.existsSync(path.join(vaultDir, notePath))).toBe(false);
});

test('delete folder command confirms before removing non-empty folders', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'folder-delete-dialog-vault');
	const folder = 'Delete Dialog Folder';
	const notePath = `${folder}/Inside.md`;
	const absFolder = path.join(vaultDir, folder);
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n');

	const registered = await request.post('/api/vaults', {
		data: { name: 'Folder Delete Dialog Vault', path: vaultDir }
	});
	expect(registered.ok(), await registered.text()).toBe(true);
	const { vault } = await registered.json() as { vault: { id: string } };

	const created = await request.post(`/api/vaults/${vault.id}/note`, {
		data: { path: notePath, content: '# Inside\n\nTemporary folder note.\n' }
	});
	expect(created.ok(), await created.text()).toBe(true);
	expect(fs.existsSync(path.join(vaultDir, notePath))).toBe(true);

	await page.goto(`/vault/${vault.id}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
	const folderRow = page.locator('.dir-head').filter({ hasText: folder }).first();
	await expect(folderRow).toBeVisible();
	await folderRow.click({ button: 'right' });
	await page.getByRole('menuitem', { name: 'Delete folder + contents' }).click();
	const dialog = page.getByRole('alertdialog', { name: 'Delete folder and contents' });
	await expect(dialog).toBeVisible();
	await expect(dialog).toContainText(`Delete folder "${folder}" and everything inside it?`);
	await dialog.getByRole('button', { name: 'Cancel' }).click();
	await expect(dialog).toBeHidden();
	expect(fs.existsSync(path.join(vaultDir, notePath))).toBe(true);

	await folderRow.click({ button: 'right' });
	await page.getByRole('menuitem', { name: 'Delete folder + contents' }).click();
	await expect(dialog).toBeVisible();
	const deleteResponse = page.waitForResponse((response) =>
		response.url().includes(`/api/vaults/${vault.id}/folder`) &&
		response.request().method() === 'DELETE'
	);
	await dialog.getByRole('button', { name: 'Delete' }).click();
	const deleted = await deleteResponse;
	expect(deleted.ok(), await deleted.text()).toBe(true);
	await expect.poll(() => fs.existsSync(absFolder)).toBe(false);
	const missing = await request.get(`/api/vaults/${vault.id}/note?path=${encodeURIComponent(notePath)}`);
	expect(missing.status()).toBe(404);
	await expect.poll(() => git(vaultDir, ['status', '--short'])).toBe('');
});

test('broken wikilinks use an in-app create confirmation dialog', async ({ page, request }) => {
	const sourcePath = 'Broken Wikilink Dialog.md';
	const target = 'Confirm Created Target';
	await request.delete(`/api/vaults/default/note?path=${encodeURIComponent(sourcePath)}`).catch(() => undefined);
	await request.delete(`/api/vaults/default/note?path=${encodeURIComponent(`${target}.md`)}`).catch(() => undefined);

	const saved = await request.post('/api/vaults/default/note', {
		data: { path: sourcePath, content: `# Broken Wikilink Dialog\n\n[[${target}]]\n` }
	});
	expect(saved.ok()).toBe(true);

	await page.goto(`/vault/default/note/${encodeURIComponent(sourcePath)}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });
	await page.locator('.cm-line').filter({ hasText: 'Broken Wikilink Dialog' }).first().click();
	const link = page.locator('.cm-wikilink--broken').filter({ hasText: target }).first();
	await expect(link).toBeVisible();
	await link.click();
	const dialog = page.getByRole('alertdialog', { name: 'Create note' });
	await expect(dialog).toBeVisible();
	await expect(dialog).toContainText(`Create note "${target}"?`);
	await dialog.getByRole('button', { name: 'Cancel' }).click();
	await expect(dialog).toBeHidden();
	await expect(page).toHaveURL(new RegExp(`/vault/default/note/${encodeURIComponent(sourcePath)}$`));

	await link.click();
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: 'Create note' }).click();
	await expect(page).toHaveURL(/\/vault\/default\/note\/Confirm%20Created%20Target\.md$/);

	await request.delete(`/api/vaults/default/note?path=${encodeURIComponent(sourcePath)}`).catch(() => undefined);
	await request.delete(`/api/vaults/default/note?path=${encodeURIComponent(`${target}.md`)}`).catch(() => undefined);
});

test('vault plugins are discovered and register boot commands', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'plugin-vault');
	const pluginDir = path.join(vaultDir, '.diamondmd', 'plugins', 'boot-test');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(pluginDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n');
	fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
		id: 'boot-test',
		name: 'Boot Test Plugin',
		version: '0.1.0',
		description: 'Registers a command during vault boot.',
		entry: 'main.js',
		commands: [{ id: 'mark-booted', title: 'Plugin Boot Test', category: 'plugin' }]
	}, null, 2));
	fs.writeFileSync(path.join(pluginDir, 'main.js'), `
export function activate(api) {
  window.__diamondPluginActivated = api.pluginId;
  api.registerCommand({
    id: 'mark-booted',
    title: 'Plugin Boot Test',
    icon: '◆',
    category: 'plugin',
    exec() {
      window.__diamondPluginRan = api.vaultId;
    }
  });
  api.registerEditorCommand({
    id: 'insert-marker',
    title: 'Plugin Editor Insert',
    icon: '✎',
    category: 'plugin',
    exec(context) {
      context.editor.insert('Plugin editor command: ' + context.doc.path);
      window.__diamondPluginEditorRan = context.notePath;
    }
  });
  api.registerSettingsPanel({
    id: 'general',
    title: 'Boot Test Settings',
    description: 'Settings registered by a vault plugin.',
    render(container, context) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Run plugin settings';
      button.dataset.testid = 'plugin-settings-button';
      const marker = document.createElement('span');
      marker.dataset.testid = 'plugin-settings-marker';
      marker.textContent = context.vaultId;
      const run = () => {
        window.__diamondPluginSettingsRan = context.pluginId;
      };
      button.addEventListener('click', run);
      container.append(button, marker);
      return () => button.removeEventListener('click', run);
    }
  });
  api.registerRightPanel({
    id: 'note-context',
    title: 'Boot Test Right Panel',
    description: 'Right panel registered by a vault plugin.',
    render(container, context) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Run plugin right panel';
      button.dataset.testid = 'plugin-right-panel-button';
      const marker = document.createElement('span');
      marker.dataset.testid = 'plugin-right-panel-marker';
      marker.textContent = context.doc.path;
      const run = () => {
        window.__diamondPluginRightPanelRan = context.doc.path;
      };
      button.addEventListener('click', run);
      container.append(button, marker);
      return () => button.removeEventListener('click', run);
    }
  });
  api.registerMarkdownPostprocessor({
    id: 'preview-marker',
    process(root, context) {
      const marker = document.createElement('span');
      marker.dataset.testid = 'plugin-markdown-marker';
      marker.textContent = context.doc.path;
      root.append(marker);
      window.__diamondPluginMarkdownRan = root.querySelector('h1')?.textContent ?? '';
      return () => marker.remove();
    }
  });
}
`);

	const created = await request.post('/api/vaults', {
		data: { name: 'Plugin Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	const listed = await request.get(`/api/vaults/${vault.id}/plugins`);
	expect(listed.ok()).toBe(true);
	const listBody = await listed.json() as { plugins: { id: string; name: string; commands: { title: string }[] }[] };
	expect(listBody.plugins[0]?.id).toBe('boot-test');
	expect(listBody.plugins[0]?.commands[0]?.title).toBe('Plugin Boot Test');

	const moduleRes = await request.get(`/api/vaults/${vault.id}/plugins/boot-test/module`);
	expect(moduleRes.ok()).toBe(true);
	expect(moduleRes.headers()['content-type']).toContain('application/javascript');

	await page.goto(`/vault/${vault.id}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
	await expect.poll(() => page.evaluate(() => (window as unknown as Record<string, string>).__diamondPluginActivated)).toBe('boot-test');
	await page.locator('.tree .file-link').filter({ hasText: 'Home' }).click();
	await expect(page.getByLabel('Editor pane').getByText('Home', { exact: true })).toBeVisible();
	await expect(page.getByText('Boot Test Right Panel')).toBeVisible();
	await expect(page.getByText('Right panel registered by a vault plugin.')).toBeVisible();
	await expect(page.getByTestId('plugin-right-panel-marker')).toHaveText('Home.md');
	await page.getByTestId('plugin-right-panel-button').click();
	await expect.poll(() => page.evaluate(() => (window as unknown as Record<string, string>).__diamondPluginRightPanelRan)).toBe('Home.md');
	await page.getByRole('tab', { name: 'Read' }).click();
	await expect(page.getByTestId('plugin-markdown-marker')).toHaveText('Home.md');
	await expect.poll(() => page.evaluate(() => (window as unknown as Record<string, string>).__diamondPluginMarkdownRan)).toBe('Home');
	await page.getByRole('tab', { name: 'Live' }).click();
	const editor = page.locator('.cm-content').first();
	await expect(editor).toBeVisible();
	await page.keyboard.press('Meta+P');
	await page.locator('input[placeholder="Run a command…"]').fill('Plugin Editor Insert');
	await page.getByRole('button', { name: /Plugin Editor Insert/ }).click();
	await expect.poll(() => page.evaluate(() => (window as unknown as Record<string, string>).__diamondPluginEditorRan)).toBe('Home.md');
	await expect(editor).toContainText('Plugin editor command: Home.md');

	await page.keyboard.press('Meta+P');
	await page.locator('input[placeholder="Run a command…"]').fill('Plugin Boot Test');
	await page.getByRole('button', { name: /Plugin Boot Test/ }).click();
	await expect.poll(() => page.evaluate(() => (window as unknown as Record<string, string>).__diamondPluginRan)).toBe(vault.id);

	await openSettingsSection(page, 'Plugins');
	await expect(page.getByText('Boot Test Plugin')).toBeVisible();
	await expect(page.getByText('Plugin Boot Test')).toBeVisible();
	await expect(page.getByText('Boot Test Settings')).toBeVisible();
	await expect(page.getByText('Settings registered by a vault plugin.')).toBeVisible();
	await expect(page.getByTestId('plugin-settings-marker')).toHaveText(vault.id);
	await page.getByTestId('plugin-settings-button').click();
	await expect.poll(() => page.evaluate(() => (window as unknown as Record<string, string>).__diamondPluginSettingsRan)).toBe('boot-test');
});

test('plugin install UI fetches manifest URLs and reloads runtime', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'plugin-install-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n');
	const remote = await servePluginFiles({
		'/plugin.json': JSON.stringify({
			id: 'remote-test',
			name: 'Remote Test Plugin',
			version: '0.1.0',
			description: 'Installed from a remote manifest.',
			entry: 'main.js',
			commands: [{ id: 'ping', title: 'Remote Plugin Ping', category: 'plugin' }]
		}),
		'/main.js': `
export function activate(api) {
  window.__diamondRemotePluginActivated = api.pluginId;
  api.registerCommand({
    id: 'ping',
    title: 'Remote Plugin Ping',
    category: 'plugin',
    exec() {
      window.__diamondRemotePluginRan = api.vaultId;
    }
  });
}
`
	});
	try {
		const created = await request.post('/api/vaults', {
			data: { name: 'Plugin Install Vault', path: vaultDir }
		});
		expect(created.ok()).toBe(true);
		const { vault } = await created.json() as { vault: { id: string } };

		await page.goto(`/vault/${vault.id}`, { waitUntil: 'domcontentloaded' });
		await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
		await openPluginInstaller(page);
		await page.getByLabel('Install from manifest URL').fill(remote.url('/plugin.json'));
		await page.getByRole('button', { name: 'Install', exact: true }).click();
		await expect(page.getByText('Installed Remote Test Plugin. Plugin runtime reload requested.')).toBeVisible();
		await expect(page.locator('.plugin-card').filter({ hasText: 'remote-test' }).getByText(/Remote Test Plugin/)).toBeVisible();
		await expect(page.getByText('Installed from a remote manifest.')).toBeVisible();
		expect(fs.existsSync(path.join(vaultDir, '.diamondmd', 'plugins', 'remote-test', 'plugin.json'))).toBe(true);
		expect(fs.existsSync(path.join(vaultDir, '.diamondmd', 'plugins', 'remote-test', 'main.js'))).toBe(true);
		await expect.poll(() => page.evaluate(() => (window as unknown as Record<string, string>).__diamondRemotePluginActivated)).toBe('remote-test');

		const sync = await request.get(`/api/vaults/${vault.id}/sync`);
		expect(sync.ok()).toBe(true);
		const syncBody = await sync.json() as { clean: boolean; files: unknown[] };
		expect(syncBody.clean).toBe(true);
		expect(syncBody.files).toHaveLength(0);

		await page.keyboard.press('Meta+P');
		await page.locator('input[placeholder="Run a command…"]').fill('Remote Plugin Ping');
		await page.getByRole('button', { name: /Remote Plugin Ping/ }).click();
		await expect.poll(() => page.evaluate(() => (window as unknown as Record<string, string>).__diamondRemotePluginRan)).toBe(vault.id);

		const duplicate = await request.post(`/api/vaults/${vault.id}/plugins`, {
			data: { manifestUrl: remote.url('/plugin.json') }
		});
		expect(duplicate.status()).toBe(400);
		expect(await duplicate.text()).toContain('plugin already installed');
	} finally {
		await remote.close();
	}
});

test('plugin install replacement overwrites files and commits a clean edit', async ({ page, request }) => {
	const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diamondmd-plugin-replace-'));
	fs.mkdirSync(vaultDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n');
	const pluginFiles = {
		'/plugin.json': JSON.stringify({
			id: 'replace-test',
			name: 'Replace Test Plugin',
			version: '0.1.0',
			description: 'First installed version.',
			entry: 'main.js',
			commands: [{ id: 'replace-ping', title: 'Replace Test Ping', category: 'plugin' }]
		}),
		'/main.js': 'export function activate(api) { window.__diamondReplaceVersion = "0.1.0"; }\n'
	};
	const remote = await servePluginFiles(pluginFiles);
	try {
		const created = await request.post('/api/vaults', {
			data: { name: 'Plugin Replace Vault', path: vaultDir }
		});
		expect(created.ok()).toBe(true);
		const { vault } = await created.json() as { vault: { id: string } };

		await page.goto(`/vault/${vault.id}`, { waitUntil: 'domcontentloaded' });
		await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
		await openPluginInstaller(page);
		await page.getByLabel('Install from manifest URL').fill(remote.url('/plugin.json'));
		await page.getByRole('button', { name: 'Install', exact: true }).click();
		await expect(page.getByText('Installed Replace Test Plugin. Plugin runtime reload requested.')).toBeVisible();
		const card = page.locator('.plugin-card').filter({ hasText: 'replace-test' });
		await expect(card).toContainText('0.1.0');
		await expect(card).toContainText('First installed version.');

		pluginFiles['/plugin.json'] = JSON.stringify({
			id: 'replace-test',
			name: 'Replace Test Plugin',
			version: '0.2.0',
			description: 'Replacement version from the same manifest URL.',
			entry: 'main.js',
			commands: [{ id: 'replace-ping', title: 'Replace Test Ping', category: 'plugin' }]
		});
		pluginFiles['/main.js'] = 'export function activate(api) { window.__diamondReplaceVersion = "0.2.0"; }\n';

		await page.getByLabel('Install from manifest URL').fill(remote.url('/plugin.json'));
		await page.getByLabel('Replace existing plugin with the same id').check();
		await page.getByRole('button', { name: 'Install', exact: true }).click();
		await expect(page.getByText('Installed Replace Test Plugin. Plugin runtime reload requested.')).toBeVisible();
		await expect(card).toContainText('0.2.0');
		await expect(card).toContainText('Replacement version from the same manifest URL.');
		await expect(page.getByLabel('Replace existing plugin with the same id')).not.toBeChecked();

		const manifestPath = path.join(vaultDir, '.diamondmd', 'plugins', 'replace-test', 'plugin.json');
		const entryPath = path.join(vaultDir, '.diamondmd', 'plugins', 'replace-test', 'main.js');
		const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as { version: string; description: string };
		expect(manifest.version).toBe('0.2.0');
		expect(manifest.description).toBe('Replacement version from the same manifest URL.');
		expect(fs.readFileSync(entryPath, 'utf-8')).toContain('0.2.0');
		expect(git(vaultDir, ['log', '--oneline', '--', '.diamondmd/plugins/replace-test'])).toContain('edit: plugin replace-test');

		const sync = await request.get(`/api/vaults/${vault.id}/sync`);
		expect(sync.ok()).toBe(true);
		const syncBody = await sync.json() as { clean: boolean; files: unknown[] };
		expect(syncBody.clean).toBe(true);
		expect(syncBody.files).toHaveLength(0);
	} finally {
		await remote.close();
		fs.rmSync(vaultDir, { recursive: true, force: true });
	}
});

test('concurrent sync status and plugin install share fresh git initialization', async ({ request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'concurrent-git-init-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n');
	const remote = await servePluginFiles({
		'/plugin.json': JSON.stringify({
			id: 'concurrent-test',
			name: 'Concurrent Test Plugin',
			version: '0.1.0',
			description: 'Installed while sync initializes git.',
			entry: 'main.js'
		}),
		'/main.js': 'export function activate() {}\n'
	});
	try {
		const created = await request.post('/api/vaults', {
			data: { name: 'Concurrent Git Init Vault', path: vaultDir }
		});
		expect(created.ok()).toBe(true);
		const { vault } = await created.json() as { vault: { id: string } };

		const [sync, installed] = await Promise.all([
			request.get(`/api/vaults/${vault.id}/sync`),
			request.post(`/api/vaults/${vault.id}/plugins`, {
				data: { manifestUrl: remote.url('/plugin.json') }
			})
		]);
		expect(sync.ok()).toBe(true);
		expect(installed.ok()).toBe(true);
		const installBody = await installed.json() as { sha: string | null };
		expect(installBody.sha).toMatch(/^[a-f0-9]{7,}$/);
		expect(fs.existsSync(path.join(vaultDir, '.git', 'index.lock'))).toBe(false);

		const finalSync = await request.get(`/api/vaults/${vault.id}/sync`);
		expect(finalSync.ok()).toBe(true);
		const finalStatus = await finalSync.json() as { clean: boolean; files: unknown[] };
		expect(finalStatus.clean).toBe(true);
		expect(finalStatus.files).toHaveLength(0);
		expect(git(vaultDir, ['log', '--oneline', '--', '.diamondmd/plugins/concurrent-test'])).toContain('create: plugin concurrent-test');
	} finally {
		await remote.close();
	}
});

test('plugin catalog installs curated worker plugins', async ({ page, request }) => {
	const logs: string[] = [];
	page.on('console', (msg) => logs.push(msg.text()));
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'plugin-catalog-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n');

	const created = await request.post('/api/vaults', {
		data: { name: 'Plugin Catalog Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	await page.goto(`/vault/${vault.id}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
	await openSettingsSection(page, 'Plugins');
	await expect(page.getByRole('heading', { name: 'Plugin catalog' })).toBeVisible();
	const card = page.locator('.catalog-card').filter({ hasText: 'scratchpad-helper' });
	await expect(card.getByText(/Scratchpad Helper/)).toBeVisible();
	await expect(card.locator('.plugin-state').getByText('Worker', { exact: true })).toBeVisible();
	await card.getByRole('button', { name: 'Install Scratchpad Helper' }).click();

	await expect(page.getByText('Installed Scratchpad Helper. Plugin runtime reload requested.')).toBeVisible();
	await expect(card.getByRole('button', { name: 'Installed Scratchpad Helper' })).toBeDisabled();
	await expect(page.locator('.plugin-card').filter({ hasText: 'scratchpad-helper' }).getByText(/Scratchpad Helper/)).toBeVisible();
	expect(fs.existsSync(path.join(vaultDir, '.diamondmd', 'plugins', 'scratchpad-helper', 'plugin.json'))).toBe(true);
	expect(fs.existsSync(path.join(vaultDir, '.diamondmd', 'plugins', 'scratchpad-helper', 'main.js'))).toBe(true);
	await expect.poll(() => logs.some((line) => line.includes('[plugin:scratchpad-helper] Scratchpad helper ready'))).toBe(true);

	await page.keyboard.press('Meta+P');
	await page.locator('input[placeholder="Run a command…"]').fill('Catalog Scratchpad Status');
	await page.getByRole('button', { name: /Catalog Scratchpad Status/ }).click();
	await expect.poll(() => logs.some((line) => line.includes('[plugin:scratchpad-helper] Scratchpad helper sees no active note'))).toBe(true);
});

test('worker plugins register command logic without main-window access', async ({ page, request }) => {
	const logs: string[] = [];
	page.on('console', (msg) => logs.push(msg.text()));
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'worker-plugin-vault');
	const pluginDir = path.join(vaultDir, '.diamondmd', 'plugins', 'worker-test');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(pluginDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n');
	fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
		id: 'worker-test',
		name: 'Worker Test Plugin',
		version: '0.1.0',
		description: 'Runs command logic in a Worker.',
		entry: 'main.js',
		execution: 'worker',
		commands: [{ id: 'worker-ping', title: 'Worker Plugin Ping', category: 'plugin' }]
	}, null, 2));
	fs.writeFileSync(path.join(pluginDir, 'main.js'), `
export function activate(api) {
  api.notify('worker activated ' + api.pluginId);
  api.registerCommand({
    id: 'worker-ping',
    title: 'Worker Plugin Ping',
    category: 'plugin',
    exec(context) {
      api.notify('worker ran ' + context.vaultId + ' window=' + String(typeof window));
      return { notify: 'worker returned ' + (context.notePath ?? 'no-note') };
    }
  });
}
`);

	const created = await request.post('/api/vaults', {
		data: { name: 'Worker Plugin Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	await page.goto(`/vault/${vault.id}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
	await expect.poll(() => logs.some((line) => line.includes('[plugin:worker-test] worker activated worker-test'))).toBe(true);
	await openSettingsSection(page, 'Plugins');
	const card = page.locator('.plugin-card').filter({ hasText: 'worker-test' });
	await expect(card.getByText(/Worker Test Plugin/)).toBeVisible();
	await expect(card.locator('.plugin-state').getByText('Worker', { exact: true })).toBeVisible();

	await page.keyboard.press('Meta+P');
	await page.locator('input[placeholder="Run a command…"]').fill('Worker Plugin Ping');
	await page.getByRole('button', { name: /Worker Plugin Ping/ }).click();
	await expect.poll(() => logs.some((line) => line.includes(`[plugin:worker-test] worker ran ${vault.id} window=undefined`))).toBe(true);
	await expect.poll(() => logs.some((line) => line.includes('[plugin:worker-test] worker returned no-note'))).toBe(true);
});

test('worker plugins use file capability proxy for note reads and writes', async ({ page, request }) => {
	const logs: string[] = [];
	page.on('console', (msg) => logs.push(msg.text()));
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'worker-file-plugin-vault');
	const pluginDir = path.join(vaultDir, '.diamondmd', 'plugins', 'worker-files');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(pluginDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n');
	fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
		id: 'worker-files',
		name: 'Worker Files Plugin',
		version: '0.1.0',
		description: 'Uses host-mediated note file capabilities.',
		entry: 'main.js',
		execution: 'worker',
		commands: [{ id: 'worker-file-write', title: 'Worker File Write', category: 'plugin' }]
	}, null, 2));
	fs.writeFileSync(path.join(pluginDir, 'main.js'), `
export function activate(api) {
  api.notify('worker files ready');
  api.registerCommand({
    id: 'worker-file-write',
    title: 'Worker File Write',
    category: 'plugin',
    async exec() {
      const home = await api.files.readNote('Home');
      const write = await api.files.writeNote('Generated/Worker Note', home.content + '\\nwritten by worker\\n');
      const generated = await api.files.readNote(write.path);
      let blocked = false;
      try {
        await api.files.writeNote('.diamondmd/plugins/pwned', 'bad');
      } catch {
        blocked = true;
      }
      api.notify('file capability ' + home.path + ' -> ' + generated.path + ' blocked=' + blocked + ' revision=' + Boolean(generated.revision));
    }
  });
}
`);

	const created = await request.post('/api/vaults', {
		data: { name: 'Worker File Plugin Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	await page.goto(`/vault/${vault.id}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
	await expect.poll(() => logs.some((line) => line.includes('[plugin:worker-files] worker files ready'))).toBe(true);
	await page.keyboard.press('Meta+P');
	await page.locator('input[placeholder="Run a command…"]').fill('Worker File Write');
	await page.getByRole('button', { name: /Worker File Write/ }).click();
	await expect.poll(() => logs.join('\n')).toContain(
		'[plugin:worker-files] file capability Home.md -> Generated/Worker Note.md blocked=true revision=true'
	);
	expect(fs.readFileSync(path.join(vaultDir, 'Generated', 'Worker Note.md'), 'utf-8')).toContain('written by worker');
	expect(fs.existsSync(path.join(vaultDir, '.diamondmd', 'plugins', 'pwned.md'))).toBe(false);
});

test('worker plugins mutate the active editor through a capability proxy', async ({ page, request }) => {
	const logs: string[] = [];
	page.on('console', (msg) => logs.push(msg.text()));
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'worker-editor-plugin-vault');
	const pluginDir = path.join(vaultDir, '.diamondmd', 'plugins', 'worker-editor');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(pluginDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n');
	fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
		id: 'worker-editor',
		name: 'Worker Editor Plugin',
		version: '0.1.0',
		description: 'Uses host-mediated editor mutations.',
		entry: 'main.js',
		execution: 'worker',
		commands: []
	}, null, 2));
	fs.writeFileSync(path.join(pluginDir, 'main.js'), `
export function activate(api) {
  api.notify('worker editor ready');
  api.registerEditorCommand({
    id: 'worker-editor-insert',
    title: 'Worker Editor Insert',
    category: 'plugin',
    async exec(context) {
      await context.editor.insert('Worker editor command: ' + context.doc.path + '\\n');
      await context.editor.insertTemplate('Template cursor {{cursor}}done\\n');
      api.notify('worker editor mutated ' + context.notePath);
    }
  });
}
`);

	const created = await request.post('/api/vaults', {
		data: { name: 'Worker Editor Plugin Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	await page.goto(`/vault/${vault.id}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
	await expect.poll(
		() => logs.some((line) => line.includes('[plugin:worker-editor] worker editor ready')),
		{ timeout: 10_000 }
	).toBe(true);
	await page.locator('.tree .file-link').filter({ hasText: 'Home' }).click();
	await expect.poll(() => page.url(), { timeout: 10_000 }).toContain('/note/Home.md');
	const editor = page.locator('.cm-content').first();
	await expect(editor).toBeVisible({ timeout: 10_000 });

	await page.keyboard.press('Meta+P');
	await page.locator('input[placeholder="Run a command…"]').fill('Worker Editor Insert');
	await page.getByRole('button', { name: /Worker Editor Insert/ }).click();
	await expect(editor).toContainText('Worker editor command: Home.md');
	await expect(editor).toContainText('Template cursor done');
	await expect.poll(() => logs.join('\n')).toContain('[plugin:worker-editor] worker editor mutated Home.md');
});

test('worker plugins register sandboxed iframe panels', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'worker-frame-plugin-vault');
	const pluginDir = path.join(vaultDir, '.diamondmd', 'plugins', 'worker-frames');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(pluginDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n');
	fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
		id: 'worker-frames',
		name: 'Worker Frames Plugin',
		version: '0.1.0',
		description: 'Registers sandboxed iframe panels from a Worker.',
		entry: 'main.js',
		execution: 'worker',
		commands: []
	}, null, 2));
	fs.writeFileSync(path.join(pluginDir, 'main.js'), `
const settingsHtml = '<!doctype html><meta charset="utf-8"><button data-testid="settings-value">waiting</button><script>window.addEventListener("message", (event) => { if (event.data?.type !== "diamond:panel-context") return; let parentAccess = "open"; try { parent.document.body; } catch { parentAccess = "blocked"; } const ctx = event.data.context; document.querySelector("[data-testid=settings-value]").textContent = ctx.pluginId + ":" + ctx.vaultId + ":" + parentAccess; });<\\/script>';
const rightHtml = '<!doctype html><meta charset="utf-8"><div data-testid="right-value">waiting</div><script>window.addEventListener("message", (event) => { if (event.data?.type !== "diamond:panel-context") return; let parentAccess = "open"; try { parent.document.body; } catch { parentAccess = "blocked"; } const ctx = event.data.context; document.querySelector("[data-testid=right-value]").textContent = ctx.doc.path + ":" + parentAccess; });<\\/script>';

export function activate(api) {
  api.registerSettingsPanel({
    id: 'frame-settings',
    title: 'Worker Frame Settings',
    description: 'Settings UI rendered in a sandboxed iframe.',
    html: settingsHtml,
    height: 90
  });
  api.registerRightPanel({
    id: 'frame-right',
    title: 'Worker Frame Right',
    description: 'Right panel UI rendered in a sandboxed iframe.',
    html: rightHtml,
    height: 90
  });
}
`);

	const created = await request.post('/api/vaults', {
		data: { name: 'Worker Frame Plugin Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	await page.goto(`/vault/${vault.id}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
	await openSettingsSection(page, 'Plugin settings');
	await expect(page.getByText('Worker Frames Plugin')).toBeVisible();
	const settingsFrame = page.frameLocator('iframe[title="Worker Frame Settings"]');
	await expect(settingsFrame.getByTestId('settings-value')).toHaveText(`worker-frames:${vault.id}:blocked`);

	await page.locator('.tree .file-link').filter({ hasText: 'Home' }).click();
	await expect(page.getByText('Worker Frame Right')).toBeVisible();
	const rightFrame = page.frameLocator('iframe[title="Worker Frame Right"]');
	await expect(rightFrame.getByTestId('right-value')).toHaveText('Home.md:blocked');
});

test('sort menu in file-tree toolbar layers above the editor', async ({ page }) => {
	await openVault(page);
	const sortButton = page.getByRole('button', { name: 'Change sort order' });
	await expect(sortButton).toBeVisible({ timeout: 10_000 });
	await expect(async () => {
		await sortButton.click();
		await expect(sortButton).toHaveAttribute('aria-expanded', 'true', { timeout: 1_000 });
	}).toPass({ timeout: 10_000 });
	const menu = page.getByRole('menu').filter({ has: page.locator('.sort-item') });
	await expect(menu).toBeVisible();
	// position:fixed + z-index:1000 lifts the menu out of the sidebar's
	// overflow:hidden clip. If the editor pane covered the menu, the
	// click below would land on the editor instead — Playwright would
	// fail with an intercepted-click error.
	await menu.getByRole('menuitemradio', { name: /Modified time \(new → old\)/ }).click();
	await expect(menu).toBeHidden();
});

test('file tree virtualizes large vaults while preserving scroll access', async ({ page, request }) => {
	const noteCount = 240;
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'large-tree-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	for (let i = 0; i < noteCount; i += 1) {
		fs.writeFileSync(path.join(vaultDir, `Note ${String(i).padStart(4, '0')}.md`), `# Note ${i}\n`);
	}
	const lastNote = `Note ${String(noteCount - 1).padStart(4, '0')}`;

	const created = await request.post('/api/vaults', {
		data: { name: 'Large Tree Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	await page.goto(`/vault/${vault.id}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
	await expect(page.locator('.tree .file-link').first()).toBeVisible({ timeout: 10_000 });
	const renderedAtTop = await page.locator('.tree .file-link').count();
	expect(renderedAtTop).toBeGreaterThan(0);
	expect(renderedAtTop).toBeLessThan(80);

	await page.locator('.tree-viewport').evaluate((el) => {
		el.scrollTop = el.scrollHeight;
		el.dispatchEvent(new Event('scroll'));
	});
	await expect(page.locator('.tree .file-link').filter({ hasText: lastNote })).toBeVisible();
	await page.locator('.tree .file-link').filter({ hasText: lastNote }).click();
	await expect(page.getByLabel('Editor pane').getByText(`Note ${noteCount - 1}`)).toBeVisible();
});

test('large graph opens with the scale simulation path', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'large-graph-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	for (let i = 0; i < 220; i += 1) {
		const title = `Graph Note ${String(i).padStart(4, '0')}`;
		const next = i < 219 ? `\n\nNext: [[Graph Note ${String(i + 1).padStart(4, '0')}]]\n` : '\n';
		fs.writeFileSync(path.join(vaultDir, `${title}.md`), `# ${title}${next}`);
	}

	const created = await request.post('/api/vaults', {
		data: { name: 'Large Graph Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	await page.goto(`/vault/${vault.id}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
	await page.getByLabel('Graph').click();
	await expect(page.locator('text=/220 nodes · 219 edges/').first()).toBeVisible({ timeout: 5_000 });
	await expect(page.locator('.canvas')).toBeVisible();
});

test('wikilinks render as just the link text, not [Note]', async ({ page }) => {
	await openVault(page);
	// Features Overview has real wikilinks at line 8 — comfortably inside
	// the editor viewport, so the live-preview decorator picks them up
	// even before any scrolling.
	await page.locator('.tree .file-link').filter({ hasText: 'Features Overview' }).first().click();
	await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

	// Move focus out of the editor before scanning — when the caret sits
	// on a wikilink line, live-preview leaves it raw on purpose.
	await page.locator('.rail').first().click({ force: true });

	const pill = page.locator('a.cm-wikilink').first();
	await expect(pill).toBeVisible({ timeout: 6_000 });
	const text = await pill.innerText();
	// Must NOT contain literal brackets — the bug was rendering `[Note]`.
	expect(text).not.toMatch(/[\[\]]/);
	expect(text.length).toBeGreaterThan(0);
});

test('wikilink fragments render cleanly from live preview and navigate in read mode', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'live-block-fragment-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	fs.writeFileSync(
		path.join(vaultDir, 'Source.md'),
		'# Source\n\nJump to [[Target#^install-steps|install steps]] and [[Target#Details|details heading]].\n'
	);
	fs.writeFileSync(
		path.join(vaultDir, 'Target.md'),
		'# Target\n\nImportant install step ^install-steps\n\n## Details\n\nMore target text.\n'
	);

	const created = await request.post('/api/vaults', {
		data: { name: 'Live Block Fragment Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	await page.goto(`/vault/${vault.id}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
	await page.locator('.tree .file-link').filter({ hasText: 'Source' }).click();
	await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });
	await page.locator('.cm-line').filter({ hasText: 'Source' }).first().click();

	const pill = page.locator('a.cm-wikilink').filter({ hasText: 'install steps' }).first();
	await expect(pill).toBeVisible({ timeout: 6_000 });
	const href = await pill.evaluate((node) => (node as HTMLAnchorElement).href);
	const url = new URL(href);
	expect(url.pathname).toBe(`/vault/${vault.id}/note/Target.md`);
	expect(decodeURIComponent(url.hash)).toBe('#^install-steps');

	await page.goto(`/vault/${vault.id}/note/${encodeURIComponent('Source.md')}`, { waitUntil: 'domcontentloaded' });
	await page.getByRole('tab', { name: 'Read' }).click();
	const readLink = page.locator('.preview a.wikilink').filter({ hasText: 'details heading' }).first();
	await expect(readLink).toHaveAttribute('href', /\/vault\/.+\/note\/Target\.md#details$/);
	await readLink.click();
	await expect.poll(() => page.evaluate(() => window.location.pathname)).toContain(`/vault/${vault.id}/note/Target.md`);
	await expect.poll(() => page.evaluate(() => window.location.pathname)).not.toContain('%23');
	await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#details');
	await expect(page.locator('.preview h2#details')).toHaveText('Details');
});

test('live preview hides Obsidian comments outside code', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'live-preview-comment-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	fs.writeFileSync(
		path.join(vaultDir, 'Comment Check.md'),
		[
			'# Comment Check',
			'',
			'Visible before %%hidden inline [[Hidden]] #private%% after.',
			'',
			'Code `%%kept-inline%%` stays visible.',
			'',
			'```txt',
			'%% kept fence %%',
			'```',
			''
		].join('\n')
	);

	const created = await request.post('/api/vaults', {
		data: { name: 'Live Preview Comment Vault', path: vaultDir }
	});
	expect(created.ok(), await created.text()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	await page.goto(`/vault/${vault.id}/note/${encodeURIComponent('Comment Check.md')}`, { waitUntil: 'domcontentloaded' });
	const editor = page.locator('.cm-content').first();
	await expect(editor).toBeVisible({ timeout: 5_000 });
	await page.locator('.rail').first().click({ force: true });

	await expect(editor).toContainText('Visible before');
	await expect(editor).toContainText('after.');
	await expect(editor).not.toContainText('hidden inline');
	await expect(editor).not.toContainText('#private');
	await expect(page.locator('a.cm-wikilink').filter({ hasText: 'Hidden' })).toHaveCount(0);
	await expect(editor).toContainText('%%kept-inline%%');
	await expect(editor).toContainText('%% kept fence %%');

	await page.getByRole('tab', { name: 'Source' }).click();
	await expect(editor).toContainText('hidden inline [[Hidden]] #private');
});

test('live preview renders Obsidian highlights outside code', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'live-preview-highlight-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Target.md'), '# Target\n');
	fs.writeFileSync(
		path.join(vaultDir, 'Highlight Check.md'),
		[
			'# Highlight Check',
			'',
			'Live ==priority **now**== and ==[[Target|target]]==.',
			'',
			'Code `==literal==` stays visible.',
			'',
			'```txt',
			'== kept fence ==',
			'```',
			''
		].join('\n')
	);

	const created = await request.post('/api/vaults', {
		data: { name: 'Live Preview Highlight Vault', path: vaultDir }
	});
	expect(created.ok(), await created.text()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	await page.goto(`/vault/${vault.id}/note/${encodeURIComponent('Highlight Check.md')}`, { waitUntil: 'domcontentloaded' });
	const editor = page.locator('.cm-content').first();
	await expect(editor).toBeVisible({ timeout: 5_000 });
	await page.locator('.rail').first().click({ force: true });

	await expect(editor).toContainText('Live priority now and target.');
	await expect(editor).not.toContainText('==priority');
	await expect(editor).not.toContainText('target==');
	await expect(page.locator('.cm-obsidian-highlight').filter({ hasText: 'priority now' })).toBeVisible();
	await expect(page.locator('.cm-obsidian-highlight').filter({ hasText: 'target' })).toBeVisible();
	await expect(page.locator('a.cm-wikilink').filter({ hasText: 'target' })).toBeVisible();
	await expect(editor).toContainText('==literal==');
	await expect(editor).toContainText('== kept fence ==');

	await page.getByRole('tab', { name: 'Source' }).click();
	await expect(editor).toContainText('==priority **now**==');
	await expect(editor).toContainText('==[[Target|target]]==');
});

test('search rail icon dedupes — clicking twice activates the same tab', async ({ page }) => {
	await openVault(page);
	const railSearch = page.locator('.rail .r-btn[aria-label="Search"]');
	await railSearch.click();
	await expect(page.locator('.search-view')).toBeVisible();
	const tabs = page.locator('.tabbar .tab, .tab-bar .tab');
	const initialCount = await tabs.count();
	await railSearch.click();
	// No second search tab should appear.
	expect(await tabs.count()).toBe(initialCount);
});

test('settings exposes GitHub sync status and controls', async ({ page }) => {
	await openVault(page);
	await page.getByLabel('Settings').click();
	await expect(page.getByRole('heading', { name: 'GitHub sync' })).toBeVisible();
	await expect(page.getByPlaceholder('https://github.com/owner/repo.git')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Sync now' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Check remote' })).toBeVisible();
	await expect(page.getByText(/Add a GitHub remote|Vault is clean|Commit or discard/)).toBeVisible({ timeout: 5_000 });
});

test('settings shows local git changes recovery guidance before sync actions', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'dirty-sync-vault');
	const bareDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'dirty-sync-origin.git');
	for (const dir of [vaultDir, bareDir]) fs.rmSync(dir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n\nBase.\n');

	const created = await request.post('/api/vaults', {
		data: { name: 'Dirty Sync Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	const initialized = await request.get(`/api/vaults/${vault.id}/sync`);
	expect(initialized.ok()).toBe(true);
	const branch = git(vaultDir, ['rev-parse', '--abbrev-ref', 'HEAD']);
	execFileSync('git', ['init', '--bare', bareDir], { stdio: 'ignore' });
	git(vaultDir, ['remote', 'add', 'origin', bareDir]);
	git(vaultDir, ['push', '-u', 'origin', branch]);

	fs.writeFileSync(path.join(vaultDir, 'Dirty.md'), '# Dirty\n\nExternal edit.\n');

	await page.goto(`/vault/${vault.id}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
	await page.getByLabel('Settings').click();
	const recovery = page.locator('.sync-block').filter({ hasText: 'Uncommitted files' });
	await expect(recovery.getByText('Local vault changes', { exact: true })).toBeVisible();
	await expect(recovery.getByText('Uncommitted files')).toBeVisible();
	await expect(recovery.getByText('Dirty.md')).toBeVisible();
	await expect(recovery).toContainText("git commit -m 'sync: save local vault changes'");
	await expect(page.getByRole('button', { name: 'Pull' })).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Push' })).toBeDisabled();
});

test('sync status initializes a clean vault git repo with an initial commit', async ({ request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'clean-sync-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n\nReady.\n');

	const created = await request.post('/api/vaults', {
		data: { name: 'Clean Sync Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	const res = await request.get(`/api/vaults/${vault.id}/sync`);
	expect(res.ok()).toBe(true);
	const status = await res.json() as {
		clean: boolean;
		files: unknown[];
		sha: string | null;
		needsRemote: boolean;
		message: string;
	};
	expect(fs.existsSync(path.join(vaultDir, '.git'))).toBe(true);
	expect(status.clean).toBe(true);
	expect(status.files).toHaveLength(0);
	expect(status.sha).toMatch(/^[a-f0-9]{7,}$/);
	expect(status.needsRemote).toBe(true);
	expect(status.message).toContain('Add a GitHub remote');
});

test('sync status reports missing registered vault directories without crashing', async ({ request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'missing-sync-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n');

	const created = await request.post('/api/vaults', {
		data: { name: 'Missing Sync Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	fs.rmSync(vaultDir, { recursive: true, force: true });

	const res = await request.get(`/api/vaults/${vault.id}/sync`);
	expect(res.ok()).toBe(true);
	const status = await res.json() as {
		initialized: boolean;
		clean: boolean;
		canPull: boolean;
		canPush: boolean;
		message: string;
	};
	expect(status.initialized).toBe(false);
	expect(status.clean).toBe(false);
	expect(status.canPull).toBe(false);
	expect(status.canPush).toBe(false);
	expect(status.message).toContain('Vault directory is unavailable');
});

test('sync API rejects non-GitHub remotes', async ({ request }) => {
	const res = await request.post('/api/vaults/default/sync', {
		data: { action: 'set-remote', remoteUrl: 'https://example.com/owner/repo.git' }
	});
	expect(res.status()).toBe(409);
	expect(await res.text()).toContain('only GitHub HTTPS or SSH remotes are supported');
});

test('sync API checks configured remote reachability without mutating the vault', async ({ request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'remote-health-vault');
	const bareDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'remote-health-origin.git');
	for (const dir of [vaultDir, bareDir]) fs.rmSync(dir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n\nHealth check.\n');

	const created = await request.post('/api/vaults', {
		data: { name: 'Remote Health Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	const initialized = await request.get(`/api/vaults/${vault.id}/sync`);
	expect(initialized.ok()).toBe(true);
	execFileSync('git', ['init', '--bare', bareDir], { stdio: 'ignore' });
	git(vaultDir, ['remote', 'add', 'origin', bareDir]);

	const checked = await request.post(`/api/vaults/${vault.id}/sync`, { data: { action: 'check' } });
	expect(checked.ok()).toBe(true);
	const body = await checked.json() as {
		message: string;
		status: { clean: boolean; files: unknown[]; needsRemote: boolean; remoteUrl: string | null };
	};
	expect(body.message).toContain('GitHub remote is reachable');
	expect(body.status.remoteUrl).toBe(bareDir);
	expect(body.status.needsRemote).toBe(false);
	expect(body.status.clean).toBe(true);
	expect(body.status.files).toHaveLength(0);
});

test('sync status surfaces diverged histories with overlapping file candidates', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'diverged-vault');
	const bareDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'diverged-origin.git');
	const cloneDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'diverged-remote-worktree');
	for (const dir of [vaultDir, bareDir, cloneDir]) fs.rmSync(dir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Shared.md'), '# Shared\n\nBase.\n');

	const created = await request.post('/api/vaults', {
		data: { name: 'Sync Divergence Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	const initialized = await request.get(`/api/vaults/${vault.id}/sync`);
	expect(initialized.ok()).toBe(true);
	const branch = git(vaultDir, ['rev-parse', '--abbrev-ref', 'HEAD']);

	execFileSync('git', ['init', '--bare', bareDir], { stdio: 'ignore' });
	git(vaultDir, ['remote', 'add', 'origin', bareDir]);
	git(vaultDir, ['push', '-u', 'origin', branch]);
	execFileSync('git', ['--git-dir', bareDir, 'symbolic-ref', 'HEAD', `refs/heads/${branch}`]);

	fs.writeFileSync(path.join(vaultDir, 'Shared.md'), '# Shared\n\nLocal edit.\n');
	fs.writeFileSync(path.join(vaultDir, 'LocalOnly.md'), '# Local only\n');
	git(vaultDir, ['add', 'Shared.md', 'LocalOnly.md']);
	git(vaultDir, ['commit', '-m', 'local: edit shared']);

	execFileSync('git', ['clone', '--branch', branch, bareDir, cloneDir], { stdio: 'ignore' });
	git(cloneDir, ['config', 'user.email', 'remote@example.test']);
	git(cloneDir, ['config', 'user.name', 'Remote Test']);
	fs.writeFileSync(path.join(cloneDir, 'Shared.md'), '# Shared\n\nRemote edit.\n');
	fs.writeFileSync(path.join(cloneDir, 'RemoteOnly.md'), '# Remote only\n');
	git(cloneDir, ['add', 'Shared.md', 'RemoteOnly.md']);
	git(cloneDir, ['commit', '-m', 'remote: edit shared']);
	git(cloneDir, ['push', 'origin', branch]);

	const fetched = await request.post(`/api/vaults/${vault.id}/sync`, { data: { action: 'fetch' } });
	expect(fetched.ok()).toBe(true);
	const statusRes = await request.get(`/api/vaults/${vault.id}/sync`);
	expect(statusRes.ok()).toBe(true);
	const status = await statusRes.json() as {
		diverged: boolean;
		ahead: number;
		behind: number;
		canPull: boolean;
		canPush: boolean;
		localChanges: string[];
		remoteChanges: string[];
		conflictCandidates: string[];
		message: string;
	};
	expect(status.diverged).toBe(true);
	expect(status.ahead).toBe(1);
	expect(status.behind).toBe(1);
	expect(status.canPull).toBe(false);
	expect(status.canPush).toBe(false);
	expect(status.localChanges).toEqual(['LocalOnly.md']);
	expect(status.remoteChanges).toEqual(['RemoteOnly.md']);
	expect(status.conflictCandidates).toEqual(['Shared.md']);
	expect(status.message).toContain('overlapping file');

	const blockedSave = await request.post(`/api/vaults/${vault.id}/note`, {
		data: { path: 'After Divergence.md', content: '# After divergence\n' }
	});
	expect(blockedSave.status()).toBe(409);
	expect(await blockedSave.text()).toContain('resolve sync before editing vault files');
	expect(fs.existsSync(path.join(vaultDir, 'After Divergence.md'))).toBe(false);

	await page.goto(`/vault/${vault.id}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
	await page.getByLabel('Settings').click();
	await expect(page.getByText('Diverged history')).toBeVisible();
	await expect(page.getByText('Overlapping files')).toBeVisible();
	await expect(page.locator('.change-box.local').getByText('LocalOnly.md')).toBeVisible();
	await expect(page.locator('.change-box.remote').getByText('RemoteOnly.md')).toBeVisible();
	await expect(page.locator('.change-box.overlap').getByText('Shared.md')).toBeVisible();
});

test('vault writes are blocked until fetched remote commits are pulled', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'behind-vault');
	const bareDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'behind-origin.git');
	const cloneDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'behind-remote-worktree');
	for (const dir of [vaultDir, bareDir, cloneDir]) fs.rmSync(dir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n\nBase.\n');

	const created = await request.post('/api/vaults', {
		data: { name: 'Sync Behind Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	const initialized = await request.get(`/api/vaults/${vault.id}/sync`);
	expect(initialized.ok()).toBe(true);
	const branch = git(vaultDir, ['rev-parse', '--abbrev-ref', 'HEAD']);

	execFileSync('git', ['init', '--bare', bareDir], { stdio: 'ignore' });
	git(vaultDir, ['remote', 'add', 'origin', bareDir]);
	git(vaultDir, ['push', '-u', 'origin', branch]);
	execFileSync('git', ['--git-dir', bareDir, 'symbolic-ref', 'HEAD', `refs/heads/${branch}`]);

	execFileSync('git', ['clone', '--branch', branch, bareDir, cloneDir], { stdio: 'ignore' });
	git(cloneDir, ['config', 'user.email', 'remote@example.test']);
	git(cloneDir, ['config', 'user.name', 'Remote Test']);
	fs.writeFileSync(path.join(cloneDir, 'RemoteOnly.md'), '# Remote only\n');
	git(cloneDir, ['add', 'RemoteOnly.md']);
	git(cloneDir, ['commit', '-m', 'remote: add note']);
	git(cloneDir, ['push', 'origin', branch]);

	const fetched = await request.post(`/api/vaults/${vault.id}/sync`, { data: { action: 'fetch' } });
	expect(fetched.ok()).toBe(true);
	const statusRes = await request.get(`/api/vaults/${vault.id}/sync`);
	expect(statusRes.ok()).toBe(true);
	const status = await statusRes.json() as {
		ahead: number;
		behind: number;
		diverged: boolean;
		canPull: boolean;
		canPush: boolean;
		remoteChanges: string[];
	};
	expect(status.ahead).toBe(0);
	expect(status.behind).toBe(1);
	expect(status.diverged).toBe(false);
	expect(status.canPull).toBe(true);
	expect(status.canPush).toBe(false);
	expect(status.remoteChanges).toEqual(['RemoteOnly.md']);

	await page.goto(`/vault/${vault.id}`, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
	await page.getByLabel('Settings').click();
	const recovery = page.locator('.sync-block').filter({ hasText: 'Remote changes waiting' });
	await expect(recovery.getByText('Incoming files')).toBeVisible();
	await expect(recovery.getByText('RemoteOnly.md')).toBeVisible();
	await expect(recovery.getByRole('button', { name: 'Sync now' })).toBeEnabled();
	await expect(recovery.getByRole('button', { name: 'Pull only' })).toBeEnabled();

	const blockedSave = await request.post(`/api/vaults/${vault.id}/note`, {
		data: { path: 'Local While Behind.md', content: '# Should not save\n' }
	});
	expect(blockedSave.status()).toBe(409);
	expect(await blockedSave.text()).toContain('pull remote changes before editing vault files');
	expect(fs.existsSync(path.join(vaultDir, 'Local While Behind.md'))).toBe(false);

	await recovery.getByRole('button', { name: 'Sync now' }).click();
	await expect(page.getByText('Fetched origin Pulled 1 commit.')).toBeVisible({ timeout: 10_000 });
	await expect(page.locator('.sync-block').filter({ hasText: 'Remote changes waiting' })).toHaveCount(0);
	expect(fs.existsSync(path.join(vaultDir, 'RemoteOnly.md'))).toBe(true);
	await expect(page.getByRole('treeitem', { name: 'RemoteOnly' })).toBeVisible({ timeout: 10_000 });

	const unblockedSave = await request.post(`/api/vaults/${vault.id}/note`, {
		data: { path: 'Local After Pull.md', content: '# Local after pull\n' }
	});
	expect(unblockedSave.ok()).toBe(true);
	expect(fs.existsSync(path.join(vaultDir, 'Local After Pull.md'))).toBe(true);
});

test('sync push fetches first and refuses unseen remote commits', async ({ request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'stale-push-vault');
	const bareDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'stale-push-origin.git');
	const cloneDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'stale-push-remote-worktree');
	for (const dir of [vaultDir, bareDir, cloneDir]) fs.rmSync(dir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n\nBase.\n');

	const created = await request.post('/api/vaults', {
		data: { name: 'Stale Push Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	const initialized = await request.get(`/api/vaults/${vault.id}/sync`);
	expect(initialized.ok()).toBe(true);
	const branch = git(vaultDir, ['rev-parse', '--abbrev-ref', 'HEAD']);

	execFileSync('git', ['init', '--bare', bareDir], { stdio: 'ignore' });
	git(vaultDir, ['remote', 'add', 'origin', bareDir]);
	git(vaultDir, ['push', '-u', 'origin', branch]);
	execFileSync('git', ['--git-dir', bareDir, 'symbolic-ref', 'HEAD', `refs/heads/${branch}`]);

	execFileSync('git', ['clone', '--branch', branch, bareDir, cloneDir], { stdio: 'ignore' });
	git(cloneDir, ['config', 'user.email', 'remote@example.test']);
	git(cloneDir, ['config', 'user.name', 'Remote Test']);
	fs.writeFileSync(path.join(cloneDir, 'RemoteOnly.md'), '# Remote only\n');
	git(cloneDir, ['add', 'RemoteOnly.md']);
	git(cloneDir, ['commit', '-m', 'remote: add unseen note']);
	git(cloneDir, ['push', 'origin', branch]);

	const staleStatus = await request.get(`/api/vaults/${vault.id}/sync`);
	expect(staleStatus.ok()).toBe(true);
	const staleBody = await staleStatus.json() as { behind: number; canPush: boolean };
	expect(staleBody.behind).toBe(0);
	expect(staleBody.canPush).toBe(true);

	const pushed = await request.post(`/api/vaults/${vault.id}/sync`, { data: { action: 'push' } });
	expect(pushed.status()).toBe(409);
	expect(await pushed.text()).toContain('pull remote changes before pushing');

	const refreshedStatus = await request.get(`/api/vaults/${vault.id}/sync`);
	expect(refreshedStatus.ok()).toBe(true);
	const refreshed = await refreshedStatus.json() as { behind: number; canPush: boolean; canPull: boolean };
	expect(refreshed.behind).toBe(1);
	expect(refreshed.canPush).toBe(false);
	expect(refreshed.canPull).toBe(true);
	expect(fs.existsSync(path.join(vaultDir, 'RemoteOnly.md'))).toBe(false);
});

test('sync now pushes local commits and pulls fast-forward remote commits', async ({ request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'sync-now-vault');
	const bareDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'sync-now-origin.git');
	const cloneDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'sync-now-remote-worktree');
	for (const dir of [vaultDir, bareDir, cloneDir]) fs.rmSync(dir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n\nBase.\n');

	const created = await request.post('/api/vaults', {
		data: { name: 'Sync Now Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	const initialized = await request.get(`/api/vaults/${vault.id}/sync`);
	expect(initialized.ok()).toBe(true);
	const branch = git(vaultDir, ['rev-parse', '--abbrev-ref', 'HEAD']);
	execFileSync('git', ['init', '--bare', bareDir], { stdio: 'ignore' });
	git(vaultDir, ['remote', 'add', 'origin', bareDir]);

	const firstSync = await request.post(`/api/vaults/${vault.id}/sync`, { data: { action: 'sync' } });
	expect(firstSync.ok(), await firstSync.text()).toBe(true);
	const firstBody = await firstSync.json() as { message: string; status: { ahead: number; behind: number; remoteBranch: string | null } };
	expect(firstBody.message).toContain('Pushed vault to GitHub');
	expect(firstBody.status).toMatchObject({ ahead: 0, behind: 0, remoteBranch: `origin/${branch}` });
	expect(git(vaultDir, ['rev-parse', 'HEAD'])).toBe(git(bareDir, ['rev-parse', branch]));

	execFileSync('git', ['--git-dir', bareDir, 'symbolic-ref', 'HEAD', `refs/heads/${branch}`]);
	execFileSync('git', ['clone', '--branch', branch, bareDir, cloneDir], { stdio: 'ignore' });
	git(cloneDir, ['config', 'user.email', 'remote@example.test']);
	git(cloneDir, ['config', 'user.name', 'Remote Test']);
	fs.writeFileSync(path.join(cloneDir, 'RemoteOnly.md'), '# Remote only\n');
	git(cloneDir, ['add', 'RemoteOnly.md']);
	git(cloneDir, ['commit', '-m', 'remote: add note']);
	git(cloneDir, ['push', 'origin', branch]);

	const secondSync = await request.post(`/api/vaults/${vault.id}/sync`, { data: { action: 'sync' } });
	expect(secondSync.ok(), await secondSync.text()).toBe(true);
	const secondBody = await secondSync.json() as { message: string; status: { ahead: number; behind: number } };
	expect(secondBody.message).toContain('Pulled 1 commit');
	expect(secondBody.status).toMatchObject({ ahead: 0, behind: 0 });
	expect(fs.existsSync(path.join(vaultDir, 'RemoteOnly.md'))).toBe(true);
});

test('Obsidian local trash keeps deleted notes, Canvas files, and folders inside vault trash', async ({ request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'obsidian-local-trash-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(path.join(vaultDir, '.obsidian'), { recursive: true });
	fs.mkdirSync(path.join(vaultDir, 'Folder Trash Test'), { recursive: true });
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'app.json'), JSON.stringify({ trashOption: 'local' }));
	fs.writeFileSync(path.join(vaultDir, 'Loose.md'), '# Loose\n\nTrash me.\n');
	fs.writeFileSync(path.join(vaultDir, 'Board.canvas'), '{"nodes":[],"edges":[]}\n');
	fs.writeFileSync(path.join(vaultDir, 'Folder Trash Test', 'Inside.md'), '# Inside\n\nTrash folder.\n');

	const created = await request.post('/api/vaults', {
		data: { name: 'Obsidian Local Trash Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	const deletedNote = await request.delete(`/api/vaults/${vault.id}/note?path=${encodeURIComponent('Loose.md')}`);
	expect(deletedNote.ok(), await deletedNote.text()).toBe(true);
	expect(fs.existsSync(path.join(vaultDir, 'Loose.md'))).toBe(false);
	expect(fs.readFileSync(path.join(vaultDir, '.trash', 'Loose.md'), 'utf-8')).toContain('Trash me.');
	const missingNote = await request.get(`/api/vaults/${vault.id}/note?path=${encodeURIComponent('Loose.md')}`);
	expect(missingNote.status()).toBe(404);

	const deletedCanvas = await request.delete(`/api/vaults/${vault.id}/canvas?path=${encodeURIComponent('Board.canvas')}`);
	expect(deletedCanvas.ok(), await deletedCanvas.text()).toBe(true);
	expect(fs.existsSync(path.join(vaultDir, 'Board.canvas'))).toBe(false);
	expect(fs.existsSync(path.join(vaultDir, '.trash', 'Board.canvas'))).toBe(true);

	const deletedFolder = await request.delete(`/api/vaults/${vault.id}/folder?path=${encodeURIComponent('Folder Trash Test')}&force=1`);
	expect(deletedFolder.ok(), await deletedFolder.text()).toBe(true);
	const body = await deletedFolder.json() as { removedNotes: number; sha: string | null };
	expect(body.removedNotes).toBe(1);
	expect(body.sha).toMatch(/^[a-f0-9]{7,}$/);
	expect(fs.existsSync(path.join(vaultDir, 'Folder Trash Test'))).toBe(false);
	expect(fs.readFileSync(path.join(vaultDir, '.trash', 'Folder Trash Test', 'Inside.md'), 'utf-8')).toContain('Trash folder.');

	const tree = await request.get(`/api/vaults/${vault.id}/tree`);
	expect(tree.ok()).toBe(true);
	const treeText = await tree.text();
	expect(treeText).not.toContain('.trash');
	await expect.poll(() => git(vaultDir, ['status', '--short'])).toBe('');
	expect(git(vaultDir, ['log', '--oneline', '--', '.trash'])).toContain('delete: Folder Trash Test/');
});

test('service worker is built with app-shell caching and API bypass', async ({ request }) => {
	const res = await request.get('/service-worker.js');
	expect(res.ok()).toBe(true);
	const source = await res.text();
	expect(source).toContain('diamondmd');
	expect(source).toContain('-static-');
	expect(source).toContain('-runtime-');
	expect(source).toContain('/api/');
	expect(source).toContain('respondWith');
	expect(source).toContain('caches.open');
});

test('note API rejects path traversal reads and writes', async ({ request }) => {
	const read = await request.get(`/api/vaults/default/note?path=${encodeURIComponent('../package.json')}`);
	expect(read.status()).toBe(400);
	expect(await read.text()).toContain('path escapes vault');

	const write = await request.post('/api/vaults/default/note', {
		data: { path: '../escape.md', content: '# should not write\n' }
	});
	expect(write.status()).toBe(400);
	expect(await write.text()).toContain('path escapes vault');
	expect(fs.existsSync(path.join(FIXTURE_PATHS.VAULT_DIR, '..', 'escape.md'))).toBe(false);
});

test('folder API rejects path traversal creates and deletes', async ({ request }) => {
	const create = await request.post('/api/vaults/default/folder', {
		data: { path: '../outside-folder' }
	});
	expect(create.status()).toBe(400);
	expect(await create.text()).toContain('path escapes vault');

	const del = await request.delete(`/api/vaults/default/folder?path=${encodeURIComponent('../outside-folder')}&force=1`);
	expect(del.status()).toBe(400);
	expect(await del.text()).toContain('path escapes vault');
	expect(fs.existsSync(path.join(FIXTURE_PATHS.VAULT_DIR, '..', 'outside-folder'))).toBe(false);
});

test('folder API force-deletes tracked notes and leaves git clean', async ({ request }) => {
	const folder = 'Folder Delete Test';
	const notePath = `${folder}/Inside.md`;
	const absFolder = path.join(FIXTURE_PATHS.VAULT_DIR, folder);

	try {
		const saved = await request.post('/api/vaults/default/note', {
			data: { path: notePath, content: '# Inside\n\nDelete me.\n' }
		});
		expect(saved.ok()).toBe(true);
		expect(fs.existsSync(path.join(FIXTURE_PATHS.VAULT_DIR, notePath))).toBe(true);

		const blocked = await request.delete(`/api/vaults/default/folder?path=${encodeURIComponent(folder)}`);
		expect(blocked.status()).toBe(409);
		expect(await blocked.text()).toContain('folder not empty');

		const removed = await request.delete(`/api/vaults/default/folder?path=${encodeURIComponent(folder)}&force=1`);
		expect(removed.ok()).toBe(true);
		const body = await removed.json() as { removedNotes: number; sha: string | null };
		expect(body.removedNotes).toBe(1);
		expect(body.sha).toMatch(/^[a-f0-9]{7,}$/);
		expect(fs.existsSync(absFolder)).toBe(false);

		const missing = await request.get(`/api/vaults/default/note?path=${encodeURIComponent(notePath)}`);
		expect(missing.status()).toBe(404);

		const sync = await request.get('/api/vaults/default/sync');
		const status = await sync.json() as { clean: boolean; files: unknown[] };
		expect(status.clean).toBe(true);
		expect(status.files).toHaveLength(0);
	} finally {
		if (fs.existsSync(absFolder)) fs.rmSync(absFolder, { recursive: true, force: true });
	}
});

test('folder API rename moves notes and rewrites path-style wikilinks', async ({ request }) => {
	const from = 'Folder Rename A';
	const to = 'Folder Rename B';
	const notePath = `${from}/Target.md`;
	const movedPath = `${to}/Target.md`;
	const linkPath = 'Folder Rename Links.md';

	try {
		const target = await request.post('/api/vaults/default/note', {
			data: { path: notePath, content: '# Target\n\nRename me.\n' }
		});
		expect(target.ok()).toBe(true);
		const linker = await request.post('/api/vaults/default/note', {
			data: { path: linkPath, content: '# Links\n\nSee [[Folder Rename A/Target]].\n' }
		});
		expect(linker.ok()).toBe(true);

		const renamed = await request.patch('/api/vaults/default/folder', {
			data: { from, to }
		});
		expect(renamed.ok()).toBe(true);
		const body = await renamed.json() as { movedNotes: number; linksUpdated: number; sha: string | null };
		expect(body.movedNotes).toBe(1);
		expect(body.linksUpdated).toBe(1);
		expect(body.sha).toMatch(/^[a-f0-9]{7,}$/);

		expect(fs.existsSync(path.join(FIXTURE_PATHS.VAULT_DIR, notePath))).toBe(false);
		expect(fs.existsSync(path.join(FIXTURE_PATHS.VAULT_DIR, movedPath))).toBe(true);
		expect(fs.readFileSync(path.join(FIXTURE_PATHS.VAULT_DIR, linkPath), 'utf-8')).toContain('[[Folder Rename B/Target]]');

		const moved = await request.get(`/api/vaults/default/note?path=${encodeURIComponent(movedPath)}`);
		expect(moved.ok()).toBe(true);
	} finally {
		await request.delete(`/api/vaults/default/folder?path=${encodeURIComponent(to)}&force=1`).catch(() => undefined);
		await request.delete(`/api/vaults/default/folder?path=${encodeURIComponent(from)}&force=1`).catch(() => undefined);
		await request.delete(`/api/vaults/default/note?path=${encodeURIComponent(linkPath)}`).catch(() => undefined);
	}
});

test('note and folder rename honor Obsidian disabled automatic link updates', async ({ request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'obsidian-link-update-disabled-vault');
	const obsidianDir = path.join(vaultDir, '.obsidian');
	const folderFrom = 'Folder Link Update A';
	const folderTo = 'Folder Link Update B';
	const folderTarget = `${folderFrom}/Target.md`;
	const folderMoved = `${folderTo}/Target.md`;

	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(obsidianDir, { recursive: true });
	fs.mkdirSync(path.join(vaultDir, folderFrom), { recursive: true });
	fs.writeFileSync(path.join(obsidianDir, 'app.json'), JSON.stringify({ alwaysUpdateLinks: false }, null, 2));
	fs.writeFileSync(path.join(vaultDir, 'Target.md'), '# Target\n\nRename me.\n');
	fs.writeFileSync(path.join(vaultDir, 'Note Linker.md'), '# Links\n\nSee [[Target]].\n');
	fs.writeFileSync(path.join(vaultDir, folderTarget), '# Folder Target\n\nRename my folder.\n');
	fs.writeFileSync(path.join(vaultDir, 'Folder Linker.md'), '# Links\n\nSee [[Folder Link Update A/Target]].\n');

	const registered = await request.post('/api/vaults', {
		data: { name: 'Obsidian Link Update Disabled Vault', path: vaultDir }
	});
	expect(registered.ok(), await registered.text()).toBe(true);
	const { vault } = await registered.json() as { vault: { id: string } };

	const renamedNote = await request.patch(`/api/vaults/${vault.id}/note`, {
		data: { from: 'Target.md', to: 'Renamed Target.md' }
	});
	expect(renamedNote.ok(), await renamedNote.text()).toBe(true);
	const renamedNoteBody = await renamedNote.json() as { linksUpdated: number; touched: string[]; sha: string | null };
	expect(renamedNoteBody.linksUpdated).toBe(0);
	expect(renamedNoteBody.touched).toEqual([]);
	expect(renamedNoteBody.sha).toMatch(/^[a-f0-9]{7,}$/);
	expect(fs.existsSync(path.join(vaultDir, 'Renamed Target.md'))).toBe(true);
	expect(fs.readFileSync(path.join(vaultDir, 'Note Linker.md'), 'utf-8')).toContain('[[Target]]');

	const renamedFolder = await request.patch(`/api/vaults/${vault.id}/folder`, {
		data: { from: folderFrom, to: folderTo }
	});
	expect(renamedFolder.ok(), await renamedFolder.text()).toBe(true);
	const renamedFolderBody = await renamedFolder.json() as { movedNotes: number; linksUpdated: number; touched: string[]; sha: string | null };
	expect(renamedFolderBody.movedNotes).toBe(1);
	expect(renamedFolderBody.linksUpdated).toBe(0);
	expect(renamedFolderBody.touched).toEqual([]);
	expect(renamedFolderBody.sha).toMatch(/^[a-f0-9]{7,}$/);
	expect(fs.existsSync(path.join(vaultDir, folderMoved))).toBe(true);
	expect(fs.readFileSync(path.join(vaultDir, 'Folder Linker.md'), 'utf-8')).toContain('[[Folder Link Update A/Target]]');

	expect(git(vaultDir, ['status', '--short'])).toBe('');
});

test('raw asset API serves safe headers and blocks symlink escapes', async ({ request }) => {
	const assetDir = path.join(FIXTURE_PATHS.VAULT_DIR, 'assets');
	const assetPath = path.join(assetDir, 'tiny.svg');
	const outsidePath = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'outside-secret.txt');
	const symlinkPath = path.join(assetDir, 'outside-secret.txt');
	fs.mkdirSync(assetDir, { recursive: true });
	fs.writeFileSync(assetPath, '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');
	fs.writeFileSync(outsidePath, 'outside vault');
	try {
		fs.symlinkSync(outsidePath, symlinkPath);
	} catch {
		// If the filesystem disallows symlinks, the rest of the test still
		// verifies headers for normal raw assets.
	}

	try {
		const ok = await request.get('/api/vaults/default/raw/assets/tiny.svg');
		expect(ok.status()).toBe(200);
		expect(ok.headers()['content-type']).toContain('image/svg+xml');
		expect(ok.headers()['x-content-type-options']).toBe('nosniff');
		expect(ok.headers()['content-security-policy']).toContain('sandbox');
		expect(await ok.text()).toContain('<svg');

		if (fs.existsSync(symlinkPath)) {
			const escape = await request.get('/api/vaults/default/raw/assets/outside-secret.txt');
			expect(escape.status()).toBe(400);
			expect(await escape.text()).toContain('path escapes vault');
		}
	} finally {
		if (fs.existsSync(assetPath)) fs.unlinkSync(assetPath);
		if (fs.existsSync(symlinkPath)) fs.unlinkSync(symlinkPath);
		if (fs.existsSync(outsidePath)) fs.unlinkSync(outsidePath);
	}
});

test('note save rejects stale revisions instead of overwriting disk changes', async ({ request }) => {
	const notePath = 'Stale Save Test.md';
	const abs = path.join(FIXTURE_PATHS.VAULT_DIR, notePath);
	fs.writeFileSync(abs, '# Stale Save Test\n\nOriginal body.\n');

	try {
		const loaded = await request.get(`/api/vaults/default/note?path=${encodeURIComponent(notePath)}`);
		expect(loaded.ok()).toBe(true);
		const doc = await loaded.json() as { revision: string };
		expect(doc.revision).toMatch(/^[a-f0-9]{64}$/);

		fs.writeFileSync(abs, '# Stale Save Test\n\nExternal disk change.\n');
		const stale = await request.post('/api/vaults/default/note', {
			data: {
				path: notePath,
				content: '# Stale Save Test\n\nStale browser edit.\n',
				expectedRevision: doc.revision
			}
		});

		expect(stale.status()).toBe(409);
		expect(await stale.text()).toContain('note changed on disk; reload before saving');
		expect(fs.readFileSync(abs, 'utf-8')).toContain('External disk change.');
	} finally {
		if (fs.existsSync(abs)) fs.unlinkSync(abs);
	}
});
