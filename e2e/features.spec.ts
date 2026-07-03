import { test, expect, type Page } from '@playwright/test';

/**
 * Feature spec — covers surfaces that don't fit the smoke or hotkey
 * suites: search rail icon, sort-menu z-index, wikilink rendering, and
 * the templates picker.
 */

async function openVault(page: Page): Promise<void> {
	await page.goto('/vault/default');
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
}

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
