import { expect, test } from '@playwright/test';
import type { CanvasNotePreview } from '../src/lib/types';
import { CanvasNotePreviewRequestQueue } from '../src/lib/canvas/note-previews';

function preview(path: string): CanvasNotePreview {
	return {
		path,
		title: path.replace(/\.md$/i, ''),
		body: `Preview for ${path}`,
		status: 'ok',
		truncated: false
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

test.describe('canvas note preview loading', () => {
	test('keeps only the newest note-preview request current', async () => {
		const queue = new CanvasNotePreviewRequestQueue();
		const older = deferred<CanvasNotePreview[]>();
		const newer = deferred<CanvasNotePreview[]>();
		const seen: { vaultId: string; paths: string[] }[] = [];

		const olderResult = queue.load('vault-a', ['Old.md'], async (vaultId, paths) => {
			seen.push({ vaultId, paths });
			return older.promise;
		});
		const newerResult = queue.load('vault-a', ['New.md'], async (vaultId, paths) => {
			seen.push({ vaultId, paths });
			return newer.promise;
		});

		newer.resolve([preview('New.md')]);
		const newest = await newerResult;
		expect(newest.previews).toEqual([preview('New.md')]);
		expect(queue.isCurrent(newest)).toBe(true);

		older.resolve([preview('Old.md')]);
		const stale = await olderResult;
		expect(stale.previews).toEqual([preview('Old.md')]);
		expect(queue.isCurrent(stale)).toBe(false);
		expect(seen).toEqual([
			{ vaultId: 'vault-a', paths: ['Old.md'] },
			{ vaultId: 'vault-a', paths: ['New.md'] }
		]);
	});

	test('returns an empty current result without fetching when there are no note paths', async () => {
		const queue = new CanvasNotePreviewRequestQueue();
		let called = false;
		const result = await queue.load('vault-a', [], async () => {
			called = true;
			return [preview('Unexpected.md')];
		});

		expect(called).toBe(false);
		expect(result.previews).toEqual([]);
		expect(queue.isCurrent(result)).toBe(true);
	});

	test('turns note-preview load failures into empty current preview lists', async () => {
		const queue = new CanvasNotePreviewRequestQueue();
		const result = await queue.load('vault-a', ['Home.md'], async () => {
			throw new Error('preview unavailable');
		});

		expect(result.previews).toEqual([]);
		expect(queue.isCurrent(result)).toBe(true);
	});
});
