import { test, expect } from '@playwright/test';
import {
	ensureMarkdownPath,
	formatSavedAt,
	markdownWordCount,
	notePathFromVaultHref,
	noteTargetFromVaultHref,
	noteTitleFromPath,
	readingTimeLabel
} from '../src/lib/note/view';
import { openModeForPointer } from '../src/lib/workspace/open-mode';

test.describe('note view helpers', () => {
	test('keeps note path, title, and pointer behavior aligned with NoteView', () => {
		expect(ensureMarkdownPath('Daily Plan')).toBe('Daily Plan.md');
		expect(ensureMarkdownPath('Daily Plan.MD')).toBe('Daily Plan.MD');
		expect(ensureMarkdownPath('version 1.2')).toBe('version 1.2.md');
		expect(noteTitleFromPath('Projects/Daily Plan.md')).toBe('Daily Plan');
		expect(notePathFromVaultHref('default', '/vault/default/note/Projects%2FDaily%20Plan.md')).toBe('Projects/Daily Plan.md');
		expect(notePathFromVaultHref('default', '/vault/other/note/Projects%2FDaily%20Plan.md')).toBeNull();
		expect(noteTargetFromVaultHref('default', '/vault/default/note/Projects%2FDaily%20Plan.md#%5Einstall-steps')).toEqual({
			path: 'Projects/Daily Plan.md',
			hash: '^install-steps'
		});
		expect(noteTargetFromVaultHref('default', 'https://example.test/vault/default/note/Target.md#details')).toEqual({
			path: 'Target.md',
			hash: 'details'
		});
		expect(openModeForPointer({ button: 0 })).toBe('replace');
		expect(openModeForPointer({ button: 1 })).toBe('new-tab');
		expect(openModeForPointer({ button: 0, metaKey: true })).toBe('new-tab');
		expect(openModeForPointer({ ctrlKey: true })).toBe('new-tab');
		expect(openModeForPointer({ button: 0, altKey: true })).toBe('new-pane');
		expect(openModeForPointer({})).toBe('replace');
	});

	test('counts readable markdown and formats save/read labels', () => {
		expect(markdownWordCount('---\ntitle: Test\n---\n# Hello\n\n`code` world')).toBe(2);
		expect(readingTimeLabel(0)).toBe('');
		expect(readingTimeLabel(250, 200)).toBe('1 min');
		expect(readingTimeLabel(450, 200)).toBe('2 min');
		expect(formatSavedAt(null, 10_000)).toBe('');
		expect(formatSavedAt(9_000, 10_000)).toBe('just saved');
		expect(formatSavedAt(5_000, 10_000)).toBe('saved 5s ago');
	});
});
