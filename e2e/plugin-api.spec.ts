import { expect, test } from '@playwright/test';
import { pluginCatalogInstallPayload, pluginManifestInstallPayload } from '../src/lib/api/plugins';

test.describe('plugin API client helpers', () => {
	test('builds explicit manifest and catalog install payloads', () => {
		expect(pluginManifestInstallPayload('https://example.com/plugin.json')).toEqual({
			manifestUrl: 'https://example.com/plugin.json',
			replace: false
		});
		expect(pluginManifestInstallPayload('https://example.com/plugin.json', true)).toEqual({
			manifestUrl: 'https://example.com/plugin.json',
			replace: true
		});
		expect(pluginCatalogInstallPayload('scratchpad-helper')).toEqual({
			catalogId: 'scratchpad-helper',
			replace: false
		});
		expect(pluginCatalogInstallPayload('scratchpad-helper', true)).toEqual({
			catalogId: 'scratchpad-helper',
			replace: true
		});
	});
});
