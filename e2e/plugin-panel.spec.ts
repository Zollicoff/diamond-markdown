import { expect, test } from '@playwright/test';
import {
	catalogInstallAction,
	installedPluginIds,
	manifestInstallDisabled,
	pluginExecutionLabel,
	pluginInstallMessage,
	pluginValidityLabel
} from '../src/lib/plugins/panel';
import type { PluginCatalogItem, PluginDescriptor } from '../src/lib/plugins/types';

const installedPlugin: PluginDescriptor = {
	id: 'scratchpad-helper',
	name: 'Scratchpad Helper',
	version: '0.1.0',
	description: 'Installed plugin',
	author: 'Diamond Markdown',
	entry: 'main.js',
	execution: 'worker',
	commands: [],
	moduleUrl: '/module.js',
	enabled: true
};

const catalogPlugin: PluginCatalogItem = {
	id: 'scratchpad-helper',
	name: 'Scratchpad Helper',
	version: '0.1.0',
	description: 'Catalog plugin',
	author: 'Diamond Markdown',
	execution: 'worker',
	tags: ['commands'],
	commands: [],
	manifestUrl: '/plugin.json'
};

test.describe('plugin panel helpers', () => {
	test('formats plugin install status and badges', () => {
		expect(pluginInstallMessage('Installed scratchpad-helper.')).toBe(
			'Installed scratchpad-helper. Plugin runtime reload requested.'
		);
		expect(pluginExecutionLabel('worker')).toBe('Worker');
		expect(pluginExecutionLabel('trusted')).toBe('Trusted');
		expect(pluginValidityLabel(true)).toBe('Valid');
		expect(pluginValidityLabel(false)).toBe('Invalid');
		expect(manifestInstallDisabled('', false)).toBe(true);
		expect(manifestInstallDisabled('   ', false)).toBe(true);
		expect(manifestInstallDisabled('https://example.com/plugin.json', false)).toBe(false);
		expect(manifestInstallDisabled('https://example.com/plugin.json', true)).toBe(true);
	});

	test('keeps catalog install gating explicit for installed and replacement states', () => {
		const installedIds = installedPluginIds([installedPlugin]);
		expect(installedIds.has('scratchpad-helper')).toBe(true);

		expect(catalogInstallAction(catalogPlugin, installedIds, false, false, null)).toEqual({
			installed: true,
			busy: false,
			actionLabel: 'Installed',
			buttonText: 'Installed',
			ariaLabel: 'Installed Scratchpad Helper',
			disabled: true
		});

		expect(catalogInstallAction(catalogPlugin, installedIds, true, false, null)).toEqual({
			installed: true,
			busy: false,
			actionLabel: 'Replace',
			buttonText: 'Replace',
			ariaLabel: 'Replace Scratchpad Helper',
			disabled: false
		});

		expect(catalogInstallAction(catalogPlugin, new Set(), false, true, 'scratchpad-helper')).toEqual({
			installed: false,
			busy: true,
			actionLabel: 'Install',
			buttonText: 'Installing...',
			ariaLabel: 'Install Scratchpad Helper',
			disabled: true
		});
	});
});
