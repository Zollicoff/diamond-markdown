import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { buildHistoryLineDiff, splitHistoryLines, summarizeHistoryDiff } from '../src/lib/history/diff';
import { FIXTURE_PATHS } from './setup-fixture';

function git(cwd: string, args: string[]): string {
	return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

async function openVault(page: Page, vaultId: string): Promise<void> {
	await page.goto(`/vault/${vaultId}`);
	await expect(page.locator('.tree').first()).toBeVisible({ timeout: 10_000 });
}

test.describe('history diff helpers', () => {
	test('builds a readable selected-vs-current line diff', () => {
		expect(splitHistoryLines('one\r\ntwo\n')).toEqual(['one', 'two']);

		const rows = buildHistoryLineDiff(
			'# Note\n\nOld line\nKeep me\n',
			'# Note\n\nNew line\nKeep me\nAdded line\n'
		);
		expect(rows.map((row) => [row.kind, row.beforeLine, row.afterLine, row.text])).toEqual([
			['same', 1, 1, '# Note'],
			['same', 2, 2, ''],
			['removed', 3, null, 'Old line'],
			['added', null, 3, 'New line'],
			['same', 4, 4, 'Keep me'],
			['added', null, 5, 'Added line']
		]);
		expect(summarizeHistoryDiff(rows)).toEqual({
			added: 2,
			removed: 1,
			unchanged: 3,
			changed: true
		});
	});
});

test('history viewer shows a line diff between a selected commit and the current note', async ({ page, request }) => {
	const vaultDir = path.join(FIXTURE_PATHS.FIXTURE_ROOT, 'history-diff-vault');
	fs.rmSync(vaultDir, { recursive: true, force: true });
	fs.mkdirSync(vaultDir, { recursive: true });
	const notePath = path.join(vaultDir, 'History Diff.md');
	fs.writeFileSync(notePath, '# History Diff\n\nOld line\nKeep me\n');
	git(vaultDir, ['init']);
	git(vaultDir, ['config', 'user.email', 'diamond@example.test']);
	git(vaultDir, ['config', 'user.name', 'Diamond Test']);
	git(vaultDir, ['add', 'History Diff.md']);
	git(vaultDir, ['commit', '-m', 'create history note']);
	fs.writeFileSync(notePath, '# History Diff\n\nNew line\nKeep me\nAdded line\n');
	git(vaultDir, ['add', 'History Diff.md']);
	git(vaultDir, ['commit', '-m', 'edit history note']);

	const created = await request.post('/api/vaults', {
		data: { name: 'History Diff Vault', path: vaultDir }
	});
	expect(created.ok()).toBe(true);
	const { vault } = await created.json() as { vault: { id: string } };

	await openVault(page, vault.id);
	await page.getByRole('link', { name: 'History Diff' }).click();
	await expect(page.locator('.cm-content').first()).toContainText('New line');
	await page.getByLabel('Show version history').click();

	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole('tab', { name: 'Diff' })).toHaveAttribute('aria-selected', 'true');
	await expect(dialog.getByRole('button', { name: /create history note/ })).toBeVisible();
	await dialog.getByRole('button', { name: /create history note/ }).click();

	await expect(dialog.locator('.diff-row.removed').filter({ hasText: 'Old line' })).toBeVisible();
	await expect(dialog.locator('.diff-row.added').filter({ hasText: 'New line' })).toBeVisible();
	await expect(dialog.locator('.diff-row.added').filter({ hasText: 'Added line' })).toBeVisible();
	await expect(dialog.locator('.diff-summary')).toContainText('+2 / -1');

	await dialog.getByRole('tab', { name: 'Snapshot' }).click();
	await expect(dialog.locator('.viewer')).toContainText('Old line');
	await expect(dialog.locator('.viewer')).not.toContainText('Added line');
});
