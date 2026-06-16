import { expect, test } from '@playwright/test';
import type { NoteLinkTarget } from '../src/lib/types';
import {
	CanvasLinkTargetRequestQueue,
	isCanvasLinkTargetRefreshEvent,
	refreshCanvasLinkTargets,
	refreshCanvasLinkTargetsForVaultEvent
} from '../src/lib/canvas/link-targets';

function target(path: string, title: string): NoteLinkTarget {
	return {
		path,
		title,
		aliases: [],
		stem: title.toLowerCase()
	};
}

function deferred<T>(): {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (reason?: unknown) => void;
} {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

test.describe('canvas link target loading', () => {
	test('keeps only the newest link-target request current', async () => {
		const queue = new CanvasLinkTargetRequestQueue();
		const older = deferred<NoteLinkTarget[]>();
		const newer = deferred<NoteLinkTarget[]>();
		const seenVaults: string[] = [];

		const olderResult = queue.load('vault-a', async (vaultId) => {
			seenVaults.push(vaultId);
			return older.promise;
		});
		const newerResult = queue.load('vault-a', async (vaultId) => {
			seenVaults.push(vaultId);
			return newer.promise;
		});

		newer.resolve([target('New.md', 'New')]);
		const newest = await newerResult;
		expect(newest.targets).toEqual([target('New.md', 'New')]);
		expect(queue.isCurrent(newest)).toBe(true);

		older.resolve([target('Old.md', 'Old')]);
		const stale = await olderResult;
		expect(stale.targets).toEqual([target('Old.md', 'Old')]);
		expect(queue.isCurrent(stale)).toBe(false);
		expect(seenVaults).toEqual(['vault-a', 'vault-a']);
	});

	test('turns load failures into empty current target lists', async () => {
		const queue = new CanvasLinkTargetRequestQueue();
		const result = await queue.load('vault-a', async () => {
			throw new Error('index unavailable');
		});

		expect(result.targets).toEqual([]);
		expect(queue.isCurrent(result)).toBe(true);
	});

	test('applies only current helper refresh results', async () => {
		const queue = new CanvasLinkTargetRequestQueue();
		const older = deferred<NoteLinkTarget[]>();
		const newer = deferred<NoteLinkTarget[]>();
		const applied: NoteLinkTarget[][] = [];

		const olderRefresh = refreshCanvasLinkTargets(
			queue,
			'vault-a',
			async () => older.promise,
			(targets) => applied.push(targets)
		);
		const newerRefresh = refreshCanvasLinkTargets(
			queue,
			'vault-a',
			async () => newer.promise,
			(targets) => applied.push(targets)
		);

		newer.resolve([target('New.md', 'New')]);
		await expect(newerRefresh).resolves.toMatchObject({ targets: [target('New.md', 'New')] });
		expect(applied).toEqual([[target('New.md', 'New')]]);

		older.resolve([target('Old.md', 'Old')]);
		await expect(olderRefresh).resolves.toMatchObject({ targets: [target('Old.md', 'Old')] });
		expect(applied).toEqual([[target('New.md', 'New')]]);
	});

	test('applies empty targets for current helper refresh failures', async () => {
		const queue = new CanvasLinkTargetRequestQueue();
		const applied: NoteLinkTarget[][] = [];

		const result = await refreshCanvasLinkTargets(
			queue,
			'vault-a',
			async () => {
				throw new Error('index unavailable');
			},
			(targets) => applied.push(targets)
		);

		expect(result.targets).toEqual([]);
		expect(applied).toEqual([[]]);
	});

	test('refreshes only for the active vault', () => {
		expect(isCanvasLinkTargetRefreshEvent('vault-a', { vaultId: 'vault-a' })).toBe(true);
		expect(isCanvasLinkTargetRefreshEvent('vault-a', { vaultId: 'vault-b' })).toBe(false);
	});

	test('runs helper refresh loaders only for active-vault events', () => {
		const loaded: string[] = [];

		expect(refreshCanvasLinkTargetsForVaultEvent('vault-a', { vaultId: 'vault-b' }, () => {
			loaded.push('wrong');
		})).toBe(false);
		expect(refreshCanvasLinkTargetsForVaultEvent('vault-a', { vaultId: 'vault-a' }, () => {
			loaded.push('active');
		})).toBe(true);
		expect(loaded).toEqual(['active']);
	});
});
