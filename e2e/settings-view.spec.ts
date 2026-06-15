import { expect, test } from '@playwright/test';
import { vaultAppearanceStyle } from '../src/lib/appearance';
import { buildSettingsSections, themeModeOptions } from '../src/lib/settings/view';

test.describe('settings view helpers', () => {
	test('keeps built-in settings sections stable without plugin panels', () => {
		expect(buildSettingsSections(0)).toEqual([
			{ id: 'appearance', label: 'Appearance' },
			{ id: 'vault', label: 'Vault' },
			{ id: 'sync', label: 'Sync' },
			{ id: 'plugins', label: 'Plugins' },
			{ id: 'excluded', label: 'Folders' },
			{ id: 'about', label: 'About' }
		]);
	});

	test('inserts plugin settings navigation only when plugins provide panels', () => {
		expect(buildSettingsSections(2).map((section) => section.id)).toEqual([
			'appearance',
			'vault',
			'sync',
			'plugins',
			'plugin-settings',
			'excluded',
			'about'
		]);
	});

	test('lists the supported theme modes in display order', () => {
		expect(themeModeOptions.map((mode) => mode.id)).toEqual(['auto', 'light', 'dark']);
		expect(themeModeOptions.map((mode) => mode.label)).toEqual(['Auto', 'Light', 'Dark']);
	});

	test('builds safe vault appearance CSS variables from imported preferences', () => {
		expect(vaultAppearanceStyle(null)).toBe('');
		expect(vaultAppearanceStyle({
			baseFontSize: 18,
			accentColor: '#0f766e',
			source: 'obsidian-appearance'
		})).toBe('--vault-base-font-size: 18px; --accent: #0f766e; --accent-soft: rgba(15, 118, 110, 0.14)');
	});
});
