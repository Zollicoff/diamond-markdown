import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { FIXTURE_PATHS } from './setup-fixture';

/**
 * Feature spec — covers surfaces that don't fit the smoke or hotkey
 * suites: search rail icon, sort-menu z-index, wikilink rendering, and
 * the templates picker.
 */

async function openVault(page: Page): Promise<void> {
	await page.goto('/vault/default');
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
}

function git(cwd: string, args: string[]): string {
	return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
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
		'---\ntitle: Cache Seed\ntags: [cache]\n---\n# Cache Seed\n\nLinks to [[Second Note]].\n'
	);
	fs.writeFileSync(path.join(vaultDir, 'Second Note.md'), '# Second Note\n\nTarget.\n');

	const created = await request.post('/api/vaults', {
		data: { name: 'Cache Test Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string; path: string } };

	const search = await request.get(`/api/vaults/${vault.id}/search?q=Cache`);
	expect(search.ok()).toBe(true);
	const searchBody = await search.json() as { results: { path: string }[] };
	expect(searchBody.results.some((r) => r.path === 'Cache Seed.md')).toBe(true);

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
	};

	const cacheEntries = cacheFiles.map((cachePath) => ({
		cachePath,
		body: JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as CacheEntry
	}));
	const matchingCaches = cacheEntries.filter((entry) => entry.body.vaultId === vault.id);
	expect(matchingCaches).toHaveLength(1);
	const { cachePath, body: cache } = matchingCaches[0];
	const updatedCache = (): CacheEntry => JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as CacheEntry;
	expect(cache.version).toBe(1);
	expect(cache.vaultId).toBe(vault.id);
	expect(cache.vaultPath).toBe(path.resolve(vaultDir));
	expect(cache.files.map((f) => f.rel)).toContain('Cache Seed.md');
	expect(cache.notes.map((n) => n.notePath)).toContain('Cache Seed.md');
	expect(cache.linksOutRaw.find((row) => row.notePath === 'Cache Seed.md')?.targets).toContain('Second Note');

	const saved = await request.post(`/api/vaults/${vault.id}/note`, {
		data: { path: 'Cache Added.md', content: '# Cache Added\n\nMore cache text.\n', commitNow: false }
	});
	expect(saved.ok()).toBe(true);
	const updated = updatedCache();
	expect(updated.files.map((f) => f.rel)).toContain('Cache Added.md');
	expect(updated.notes.map((n) => n.notePath)).toContain('Cache Added.md');
});

test('Obsidian import check reports vault readiness without changing files', async ({ request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'obsidian-import-vault');
	const notePath = path.join(vaultDir, 'Notes', 'Home.md');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(path.join(vaultDir, '.obsidian'), { recursive: true });
	fs.mkdirSync(path.join(vaultDir, '.obsidian', 'plugins', 'dataview'), { recursive: true });
	fs.mkdirSync(path.join(vaultDir, 'Notes'), { recursive: true });
	fs.mkdirSync(path.join(vaultDir, 'Attachments'), { recursive: true });
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'app.json'), JSON.stringify({ legacyEditor: false }));
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'plugins', 'dataview', 'data.json'), '{}\n');
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
		obsidianPluginFolders: string[];
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
	expect(body.obsidianPluginFolders).toContain('.obsidian/plugins/dataview');
	expect(body.recommendedExcludedFolders).toContain('.obsidian');
	expect(body.markdownExamples).toContain('Daily.md');
	expect(body.canvasExamples).toContain('Board.canvas');
	expect(body.checklist.find((row) => row.id === 'obsidian-plugins')?.level).toBe('info');
	expect(body.checklist.find((row) => row.id === 'canvas')?.detail).toContain('opens read-only Canvas previews');
	expect(body.checklist.find((row) => row.id === 'preserve')?.level).toBe('ok');
	expect(body.checklist.find((row) => row.id === 'preserve')?.detail).toContain('do not rewrite markdown content');
	expect(fs.readFileSync(notePath, 'utf-8')).toBe(before);
});

test('home add vault form previews Obsidian import checklist', async ({ page }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'obsidian-ui-import-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(path.join(vaultDir, '.obsidian', 'plugins', 'kanban'), { recursive: true });
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'app.json'), '{}\n');
	fs.writeFileSync(path.join(vaultDir, '.obsidian', 'plugins', 'kanban', 'manifest.json'), '{}\n');
	fs.writeFileSync(path.join(vaultDir, 'Board.canvas'), '{"nodes":[],"edges":[]}\n');
	fs.writeFileSync(path.join(vaultDir, 'Home.md'), '# Home\n\n![[roof.png]]\n');
	fs.writeFileSync(path.join(vaultDir, 'roof.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

	await page.goto('/');
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
	await expect(page.locator('.import-card')).toContainText('Recommended excludes');
	await expect(page.locator('.import-card')).toContainText('.obsidian');

	await page.getByRole('button', { name: 'Add vault', exact: true }).click();
	await expect(page).toHaveURL(/\/vault\/obsidian-ui-import$/);
});

test('search rail icon opens a search tab; results fire on input', async ({ page }) => {
	await openVault(page);
	await page.locator('.rail .r-btn[aria-label="Search"]').click();
	const search = page.locator('.search-view');
	await expect(search).toBeVisible({ timeout: 3_000 });
	await search.locator('input[type="text"]').fill('Frontmatter');
	// Wait out the 120ms debounce + network round trip.
	await expect(search.locator('.result').first()).toBeVisible({ timeout: 4_000 });
	await expect(search.locator('.result').first()).toContainText(/Frontmatter/i);
});

test('new note command uses an in-app name dialog', async ({ page, request }) => {
	const notePath = 'Dialog Created Note.md';
	const abs = path.join(FIXTURE_PATHS.VAULT_DIR, notePath);
	if (fs.existsSync(abs)) fs.unlinkSync(abs);

	await openVault(page);
	await page.getByLabel('File tree controls').getByRole('button', { name: 'New note' }).click();
	const dialog = page.getByRole('dialog', { name: 'New note' });
	await expect(dialog).toBeVisible();
	await dialog.getByLabel('Name in vault root').fill('Dialog Created Note');
	await dialog.getByRole('button', { name: 'Create note' }).click();
	await expect(dialog).toBeHidden();
	await expect.poll(() => fs.existsSync(abs)).toBe(true);

	const loaded = await request.get(`/api/vaults/default/note?path=${encodeURIComponent(notePath)}`);
	expect(loaded.ok()).toBe(true);
	await request.delete(`/api/vaults/default/note?path=${encodeURIComponent(notePath)}`).catch(() => undefined);
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

test('broken wikilinks use an in-app create confirmation dialog', async ({ page, request }) => {
	const sourcePath = 'Broken Wikilink Dialog.md';
	const target = 'Confirm Created Target';
	await request.delete(`/api/vaults/default/note?path=${encodeURIComponent(sourcePath)}`).catch(() => undefined);
	await request.delete(`/api/vaults/default/note?path=${encodeURIComponent(`${target}.md`)}`).catch(() => undefined);

	const saved = await request.post('/api/vaults/default/note', {
		data: { path: sourcePath, content: `# Broken Wikilink Dialog\n\n[[${target}]]\n` }
	});
	expect(saved.ok()).toBe(true);

	await page.goto(`/vault/default/note/${encodeURIComponent(sourcePath)}`);
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

	await page.goto(`/vault/${vault.id}`);
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

	await page.getByLabel('Settings').click();
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

		await page.goto(`/vault/${vault.id}`);
		await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
		await page.getByLabel('Settings').click();
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

		await page.goto(`/vault/${vault.id}`);
		await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
		await page.getByLabel('Settings').click();
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

	await page.goto(`/vault/${vault.id}`);
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
	await page.getByLabel('Settings').click();
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

	await page.goto(`/vault/${vault.id}`);
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
	await expect.poll(() => logs.some((line) => line.includes('[plugin:worker-test] worker activated worker-test'))).toBe(true);
	await page.getByLabel('Settings').click();
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

	await page.goto(`/vault/${vault.id}`);
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

	await page.goto(`/vault/${vault.id}`);
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
	await expect.poll(() => logs.some((line) => line.includes('[plugin:worker-editor] worker editor ready'))).toBe(true);
	await page.locator('.tree .file-link').filter({ hasText: 'Home' }).click();
	const editor = page.locator('.cm-content').first();
	await expect(editor).toBeVisible();

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

	await page.goto(`/vault/${vault.id}`);
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
	await page.getByLabel('Settings').click();
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
	await page.locator('.toolbar-btn.sort').click();
	const menu = page.locator('.sort-menu');
	await expect(menu).toBeVisible();
	// position:fixed + z-index:1000 lifts the menu out of the sidebar's
	// overflow:hidden clip. If the editor pane covered the menu, the
	// click below would land on the editor instead — Playwright would
	// fail with an intercepted-click error.
	await menu.getByRole('menuitemradio', { name: /Modified time \(new → old\)/ }).click();
	await expect(menu).toBeHidden();
});

test('file tree virtualizes large vaults while preserving scroll access', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'large-tree-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	for (let i = 0; i < 600; i += 1) {
		fs.writeFileSync(path.join(vaultDir, `Note ${String(i).padStart(4, '0')}.md`), `# Note ${i}\n`);
	}

	const created = await request.post('/api/vaults', {
		data: { name: 'Large Tree Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	await page.goto(`/vault/${vault.id}`);
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
	const renderedAtTop = await page.locator('.tree .file-link').count();
	expect(renderedAtTop).toBeGreaterThan(0);
	expect(renderedAtTop).toBeLessThan(80);

	await page.locator('.tree-viewport').evaluate((el) => {
		el.scrollTop = el.scrollHeight;
		el.dispatchEvent(new Event('scroll'));
	});
	await expect(page.locator('.tree .file-link').filter({ hasText: 'Note 0599' })).toBeVisible();
	await page.locator('.tree .file-link').filter({ hasText: 'Note 0599' }).click();
	await expect(page.getByLabel('Editor pane').getByText('Note 599')).toBeVisible();
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

	await page.goto(`/vault/${vault.id}`);
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

	await page.goto(`/vault/${vault.id}`);
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
	const res = await request.get('/api/vaults/default/sync');
	expect(res.ok()).toBe(true);
	const status = await res.json() as {
		clean: boolean;
		files: unknown[];
		sha: string | null;
		needsRemote: boolean;
		message: string;
	};
	expect(fs.existsSync(path.join(FIXTURE_PATHS.VAULT_DIR, '.git'))).toBe(true);
	expect(status.clean).toBe(true);
	expect(status.files).toHaveLength(0);
	expect(status.sha).toMatch(/^[a-f0-9]{7,}$/);
	expect(status.needsRemote).toBe(true);
	expect(status.message).toContain('Add a GitHub remote');
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

	await page.goto(`/vault/${vault.id}`);
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
	await page.getByLabel('Settings').click();
	await expect(page.getByText('Diverged history')).toBeVisible();
	await expect(page.getByText('Overlapping files')).toBeVisible();
	await expect(page.locator('.change-box.local').getByText('LocalOnly.md')).toBeVisible();
	await expect(page.locator('.change-box.remote').getByText('RemoteOnly.md')).toBeVisible();
	await expect(page.locator('.change-box.overlap').getByText('Shared.md')).toBeVisible();
});

test('vault writes are blocked until fetched remote commits are pulled', async ({ request }) => {
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
	};
	expect(status.ahead).toBe(0);
	expect(status.behind).toBe(1);
	expect(status.diverged).toBe(false);
	expect(status.canPull).toBe(true);
	expect(status.canPush).toBe(false);

	const blockedSave = await request.post(`/api/vaults/${vault.id}/note`, {
		data: { path: 'Local While Behind.md', content: '# Should not save\n' }
	});
	expect(blockedSave.status()).toBe(409);
	expect(await blockedSave.text()).toContain('pull remote changes before editing vault files');
	expect(fs.existsSync(path.join(vaultDir, 'Local While Behind.md'))).toBe(false);

	const pulled = await request.post(`/api/vaults/${vault.id}/sync`, { data: { action: 'pull' } });
	expect(pulled.ok()).toBe(true);
	expect(fs.existsSync(path.join(vaultDir, 'RemoteOnly.md'))).toBe(true);

	const unblockedSave = await request.post(`/api/vaults/${vault.id}/note`, {
		data: { path: 'Local After Pull.md', content: '# Local after pull\n' }
	});
	expect(unblockedSave.ok()).toBe(true);
	expect(fs.existsSync(path.join(vaultDir, 'Local After Pull.md'))).toBe(true);
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
