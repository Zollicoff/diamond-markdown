import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
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

	const cacheFiles = fs.readdirSync(cacheDir).filter((name) => name.endsWith('.json'));
	expect(cacheFiles).toHaveLength(1);
	const cachePath = path.join(cacheDir, cacheFiles[0]);
	const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as {
		version: number;
		vaultId: string;
		vaultPath: string;
		files: { rel: string }[];
		notes: { notePath: string }[];
		linksOutRaw: { notePath: string; targets: string[] }[];
	};
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
	const updated = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as {
		files: { rel: string }[];
		notes: { notePath: string }[];
	};
	expect(updated.files.map((f) => f.rel)).toContain('Cache Added.md');
	expect(updated.notes.map((n) => n.notePath)).toContain('Cache Added.md');
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
	await expect(page.getByText(/Add a GitHub remote|Vault is clean|Commit or discard/)).toBeVisible({ timeout: 5_000 });
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

	await page.goto(`/vault/${vault.id}`);
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
	await page.getByLabel('Settings').click();
	await expect(page.getByText('Diverged history')).toBeVisible();
	await expect(page.getByText('Overlapping files')).toBeVisible();
	await expect(page.locator('.change-box.local').getByText('LocalOnly.md')).toBeVisible();
	await expect(page.locator('.change-box.remote').getByText('RemoteOnly.md')).toBeVisible();
	await expect(page.locator('.change-box.overlap').getByText('Shared.md')).toBeVisible();
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
