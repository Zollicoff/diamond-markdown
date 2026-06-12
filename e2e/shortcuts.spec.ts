import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURE_PATHS } from './setup-fixture';

/**
 * Hotkey spec — every shortcut in the global keymap fires its actual
 * effect. Catches drift between what the Shortcuts tab claims and what
 * really works (which is how F2 ended up listed-but-broken before).
 */

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

async function openVault(page: Page): Promise<void> {
	await page.goto('/vault/default');
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
}

async function openFirstNote(page: Page): Promise<void> {
	const fileLink = page.locator('.tree .file-link').first();
	await expect(fileLink).toBeVisible({ timeout: 5_000 });
	await fileLink.click();
	await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });
}

test('⌘\\ toggles the left sidebar', async ({ page }) => {
	await openVault(page);
	const sidebar = page.locator('.sidebar').first();
	await expect(sidebar).toBeVisible();
	await page.keyboard.press(`${MOD}+\\`);
	await expect(sidebar).toBeHidden({ timeout: 2_000 });
	await page.keyboard.press(`${MOD}+\\`);
	await expect(sidebar).toBeVisible({ timeout: 2_000 });
});

test('⌘⇧\\ toggles the right sidebar', async ({ page }) => {
	await openVault(page);
	// Right sidebar = .right-col content (RightPanel). It's hidden via
	// visibility:hidden when collapsed.
	const right = page.locator('.right-col').first();
	const initiallyVisible = await right.isVisible();
	await page.keyboard.press(`${MOD}+Shift+\\`);
	await page.waitForTimeout(300);
	const afterToggle = await right.isVisible();
	expect(afterToggle).not.toBe(initiallyVisible);
});

test('⌘P opens the command palette', async ({ page }) => {
	await openVault(page);
	await page.keyboard.press(`${MOD}+KeyP`);
	// CommandPalette is a global modal; placeholder text or input visible.
	await expect(page.locator('input[placeholder*="command" i], [role="dialog"]').first()).toBeVisible({ timeout: 2_000 });
});

test('⌘P still opens the palette while the editor is focused', async ({ page }) => {
	// Regression: keymap used to skip ALL bindings when a text input had
	// focus, so ⌘P fell through to the browser's print dialog. Mod chords
	// must work even while typing in the CodeMirror editor.
	await openVault(page);
	await openFirstNote(page);
	await page.locator('.cm-content').first().click();
	await page.keyboard.press(`${MOD}+KeyP`);
	await expect(page.locator('input[placeholder*="command" i], [role="dialog"]').first()).toBeVisible({ timeout: 2_000 });
});

test('⌘K opens the quick switcher', async ({ page }) => {
	await openVault(page);
	await page.keyboard.press(`${MOD}+KeyK`);
	await expect(page.locator('input[placeholder*="jump" i], input[placeholder*="title" i]').first()).toBeVisible({ timeout: 2_000 });
});

test('⌘⇧F opens full-text search', async ({ page }) => {
	await openVault(page);
	await page.keyboard.press(`${MOD}+Shift+KeyF`);
	await expect(page.locator('input[placeholder*="full-text" i], input[placeholder*="search" i]').first()).toBeVisible({ timeout: 2_000 });
});

test('⌘⇧D opens today\'s daily note', async ({ page }) => {
	await openVault(page);
	const tabsBefore = await page.locator('.tabs > .tab, [role="tab"][aria-selected]').count();
	await page.keyboard.press(`${MOD}+Shift+KeyD`);
	// Daily note becomes a new tab; either a new tab appears or the
	// active tab title changes to a YYYY-MM-DD pattern.
	await expect.poll(() => page.url(), { timeout: 5_000 }).toMatch(/Daily Notes\/\d{4}-\d{2}-\d{2}|note\/Daily/);
});

test('⌘⇧L cycles theme', async ({ page }) => {
	await openVault(page);
	const initialTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
	await page.keyboard.press(`${MOD}+Shift+KeyL`);
	await page.waitForTimeout(200);
	const afterTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
	expect(afterTheme).not.toBe(initialTheme);
});

test('⌘⇧B toggles bookmark on the active note', async ({ page }) => {
	await openVault(page);
	await openFirstNote(page);
	const notePath = decodeURIComponent(page.url().split('/note/')[1] ?? '');
	const bookmarksFile = path.join(FIXTURE_PATHS.VAULT_DIR, '.diamondmd', 'bookmarks.json');
	await page.keyboard.press(`${MOD}+Shift+KeyB`);
	await expect.poll(() => fs.existsSync(bookmarksFile), { timeout: 5_000 }).toBe(true);
	await expect.poll(() => {
		const body = JSON.parse(fs.readFileSync(bookmarksFile, 'utf-8')) as { bookmarks: { path: string }[] };
		return body.bookmarks.some((b) => b.path === notePath);
	}).toBe(true);
	await expect(page.locator('.bookmarks')).toContainText(notePath.replace(/\.md$/i, '').split('/').pop() ?? notePath);
});

test('⌘W closes the active tab', async ({ page }) => {
	await openVault(page);
	await openFirstNote(page);
	const tabsBefore = await page.locator('.tabs > .tab').count();
	await page.keyboard.press(`${MOD}+KeyW`);
	await page.waitForTimeout(200);
	const tabsAfter = await page.locator('.tabs > .tab').count();
	expect(tabsAfter).toBeLessThan(tabsBefore);
});

test('F2 begins rename on the active note in the tree', async ({ page }) => {
	await openVault(page);
	await openFirstNote(page);
	// Move focus out of the editor (CodeMirror would swallow F2).
	await page.locator('.sidebar').first().click();
	await page.keyboard.press('F2');
	// Rename input appears with the current name pre-filled.
	await expect(page.locator('.tree input.rename-input').first()).toBeVisible({ timeout: 2_000 });
	await page.keyboard.press('Escape');
});

test('⌘⇧T opens the template picker', async ({ page }) => {
	await openVault(page);
	await openFirstNote(page);
	// Focus the editor first — exercises the keymap path that previously
	// dropped mod-chord shortcuts when a contentEditable was focused.
	await page.locator('.cm-content').first().click();
	await page.keyboard.press(`${MOD}+Shift+KeyT`);
	const modal = page.getByRole('dialog', { name: 'Insert template' });
	await expect(modal).toBeVisible();
	// Fixture vault has no Templates/ — picker shows the empty-state hint.
	await expect(modal).toContainText('Templates/');
	await page.keyboard.press('Escape');
	await expect(modal).toBeHidden();
});
