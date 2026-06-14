import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURE_PATHS } from './setup-fixture';
import { bindings, comboFromEvent, comboToDisplay } from '../src/lib/commands/keymap';
import { diamondCommandForObsidian } from '../src/lib/shortcuts/obsidian';
import { buildShortcutRows, groupShortcutRows } from '../src/lib/shortcuts/view';
import type { CommandDef } from '../src/lib/commands/registry';

/**
 * Hotkey spec — every shortcut in the global keymap fires its actual
 * effect. Catches drift between what the Shortcuts tab claims and what
 * really works (which is how F2 ended up listed-but-broken before).
 */

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

const commandFixtures: CommandDef[] = [
	{ id: 'switcher.open', title: 'Quick switcher', shortcut: '⌘K', category: 'view', exec() {} },
	{ id: 'search.quick-open', title: 'Full-text search', shortcut: '⌘⇧F', category: 'view', exec() {} },
	{ id: 'palette.open', title: 'Open command palette', shortcut: '⌘P', category: 'view', exec() {} },
	{ id: 'daily.open', title: "Open today's daily note", shortcut: '⌘⇧D', category: 'file', exec() {} },
	{ id: 'tabs.close', title: 'Close tab', shortcut: '⌘W', category: 'tabs', exec() {} }
];

test('shortcut helpers expose global keymap rows and Obsidian command aliases', () => {
	const rows = buildShortcutRows(commandFixtures, bindings).map((row) => ({
		...row,
		shortcut: row.source === 'global' ? comboToDisplay(row.shortcut) : row.shortcut
	}));
	const switcher = rows.find((row) => row.commandId === 'switcher.open');
	expect(switcher).toMatchObject({
		title: 'Quick switcher',
		shortcut: '⌘K',
		category: 'view',
		source: 'global',
		obsidianCommandIds: ['switcher:open']
	});
	expect(rows.find((row) => row.commandId === 'search.quick-open')).toMatchObject({
		title: 'Full-text search',
		shortcut: '⌘⇧F',
		obsidianCommandIds: ['global-search:open']
	});
	expect(diamondCommandForObsidian('command-palette:open')).toMatchObject({
		diamondCommandId: 'palette.open',
		diamondTitle: 'Open command palette'
	});
	expect(groupShortcutRows(rows).get('view')?.map((row) => row.title)).toContain('Quick switcher');
	expect(comboFromEvent({
		altKey: false,
		code: 'KeyK',
		ctrlKey: true,
		key: 'K',
		metaKey: false,
		shiftKey: false
	})).toBe('mod+k');
	expect(comboFromEvent({
		altKey: false,
		code: 'Backslash',
		ctrlKey: false,
		key: 'Dead',
		metaKey: true,
		shiftKey: false
	})).toBe('mod+\\');
});

async function openVault(page: Page): Promise<void> {
	await page.goto('/vault/default');
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
}

async function openFirstNote(page: Page): Promise<void> {
	await page.goto(`/vault/default/note/${encodeURIComponent('Getting Started.md')}`);
	await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 10_000 });
}

async function dispatchModKey(page: Page, key: string, options: { shift?: boolean } = {}): Promise<void> {
	await page.evaluate(({ key, mod, shift }) => {
		window.dispatchEvent(new KeyboardEvent('keydown', {
			key,
			code: `Key${key.toUpperCase()}`,
			metaKey: mod === 'Meta',
			ctrlKey: mod === 'Control',
			shiftKey: shift,
			bubbles: true,
			cancelable: true
		}));
	}, { key, mod: MOD, shift: options.shift ?? false });
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
	await dispatchModKey(page, 'k');
	await expect(page.locator('input[placeholder*="jump" i], input[placeholder*="title" i]').first()).toBeVisible({ timeout: 2_000 });
});

test('⌘⇧F opens full-text search', async ({ page }) => {
	await openVault(page);
	await dispatchModKey(page, 'f', { shift: true });
	const search = page.locator('.search-view');
	await expect(search).toBeVisible({ timeout: 2_000 });
	await expect(search.locator('.input-row input').first()).toHaveAttribute('placeholder', /contents/i);
	await expect(search.getByRole('button', { name: 'Notes' })).toBeVisible();
});

test('⌘⇧D opens today\'s daily note', async ({ page }) => {
	await openVault(page);
	// Chrome/Linux reserves Ctrl+Shift+D for browser bookmarks, so dispatch
	// the same app-level keydown shape directly to Diamond's keymap listener.
	await dispatchModKey(page, 'd', { shift: true });
	const activeDailyTab = page.locator('.tabs .tab.active').filter({ hasText: /\d{4}-\d{2}-\d{2}/ });
	await expect(activeDailyTab).toBeVisible({ timeout: 5_000 });
	await expect.poll(() => {
		const dailyDir = path.join(FIXTURE_PATHS.VAULT_DIR, 'Daily Notes');
		if (!fs.existsSync(dailyDir)) return '';
		return fs.readdirSync(dailyDir).find((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name)) ?? '';
	}, { timeout: 5_000 }).toMatch(/^\d{4}-\d{2}-\d{2}\.md$/);
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
