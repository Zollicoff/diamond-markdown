import { test, expect, type Page } from '@playwright/test';

// Fixture is built once by playwright.config.ts before the webServer starts.

/** Open the test vault directly — fixture is registered as id 'default'. */
async function openFirstVault(page: Page): Promise<void> {
	await page.goto('/vault/default');
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
}

/** Open the first markdown file in the tree. */
async function openFirstNote(page: Page): Promise<void> {
	const fileLink = page.locator('.tree .file-link').first();
	await expect(fileLink).toBeVisible({ timeout: 5_000 });
	await fileLink.click();
	// Editor mounts when a note tab activates.
	await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });
}

test('app boots and lists vaults on the picker', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveTitle(/Diamond Markdown|DiamondMD/i);
	await expect(page.locator('.vault-card').first()).toBeVisible({ timeout: 10_000 });
});

test('opening a vault renders the workspace shell', async ({ page }) => {
	await openFirstVault(page);
	// Activity rail icons.
	await expect(page.getByLabel('Today\'s daily note')).toBeVisible();
	await expect(page.getByLabel('Tags')).toBeVisible();
	await expect(page.getByLabel('Graph')).toBeVisible();
	await expect(page.getByLabel('Settings')).toBeVisible();
	// Top bar wordmark visible (full text in the side-left zone).
	await expect(page.locator('.brand-text')).toBeVisible();
});

test('graph tab opens beside the active note (does not replace)', async ({ page }) => {
	await openFirstVault(page);
	await openFirstNote(page);
	// Count workspace tabs only (the topbar TabBar's .tab elements), not
	// the mode buttons or panel tabs that share role="tab".
	const workspaceTabs = page.locator('.tabs > .tab');
	const tabsBefore = await workspaceTabs.count();
	await page.getByLabel('Graph').click();
	await expect(page.locator('text=/\\d+ nodes? · \\d+ edges?/').first()).toBeVisible({ timeout: 5_000 });
	const tabsAfter = await workspaceTabs.count();
	expect(tabsAfter).toBeGreaterThan(tabsBefore);
});

test('settings tab opens with theme + vault info', async ({ page }) => {
	await openFirstVault(page);
	await page.getByLabel('Settings').click();
	await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
	await expect(page.getByText('Theme', { exact: true })).toBeVisible();
	await expect(page.getByText('Excluded folders')).toBeVisible();
});

test('left sidebar collapses and re-expands via the topbar chevron', async ({ page }) => {
	await openFirstVault(page);
	const sidebar = page.locator('.sidebar').first();
	await expect(sidebar).toBeVisible();
	const leftChev = page.getByLabel(/toggle left sidebar/i).first();
	await leftChev.click();
	// Sidebar zone shrinks to 0 — visibility:hidden hides content.
	await expect(sidebar).toBeHidden({ timeout: 2_000 });
	await page.getByLabel(/toggle left sidebar/i).first().click();
	await expect(sidebar).toBeVisible({ timeout: 2_000 });
});

test('mode buttons (Live / Source / Read) are inline in the note topbar', async ({ page }) => {
	await openFirstVault(page);
	await openFirstNote(page);
	const liveBtn = page.getByRole('tab', { name: 'Live' });
	const sourceBtn = page.getByRole('tab', { name: 'Source' });
	const readBtn = page.getByRole('tab', { name: 'Read' });
	await expect(liveBtn).toBeVisible();
	await expect(sourceBtn).toBeVisible();
	await expect(readBtn).toBeVisible();
	await expect(liveBtn).toHaveClass(/active/);
	await sourceBtn.click();
	await expect(sourceBtn).toHaveClass(/active/);
});

test('wikilink toolbar button inserts double-bracket [[]] syntax', async ({ page }) => {
	await openFirstVault(page);
	await openFirstNote(page);
	// Switch to Source mode for deterministic raw-markdown reads.
	await page.getByRole('tab', { name: 'Source' }).click();
	const editor = page.locator('.cm-content').first();
	await editor.click();
	// Move to end and append a marker, then insert wikilink.
	await page.keyboard.press('Meta+End');
	await page.keyboard.press('Enter');
	await page.keyboard.type('MARK:');
	await page.getByRole('button', { name: 'Wikilink' }).click();
	const text = await editor.innerText();
	// With no selection, button should produce `[[]]` directly after MARK:.
	expect(text).toContain('MARK:[[]]');
	expect(text).not.toMatch(/MARK:\[\][^\[]/); // no single-bracket variant
});
