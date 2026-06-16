import { test, expect } from '@playwright/test';
import { gitSyncActionPayload } from '../src/lib/api/sync';

test.describe('git sync API client helpers', () => {
	test('builds sync action payloads without leaking remote URLs into non-remote actions', () => {
		expect(gitSyncActionPayload('set-remote', 'https://github.com/owner/vault.git')).toEqual({
			action: 'set-remote',
			remoteUrl: 'https://github.com/owner/vault.git'
		});
		expect(gitSyncActionPayload('set-remote')).toEqual({
			action: 'set-remote',
			remoteUrl: ''
		});
		expect(gitSyncActionPayload('check', 'https://github.com/owner/vault.git')).toEqual({ action: 'check' });
		expect(gitSyncActionPayload('fetch')).toEqual({ action: 'fetch' });
		expect(gitSyncActionPayload('pull')).toEqual({ action: 'pull' });
		expect(gitSyncActionPayload('push')).toEqual({ action: 'push' });
		expect(gitSyncActionPayload('sync')).toEqual({ action: 'sync' });
	});
});
