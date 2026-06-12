import { expect, test } from '@playwright/test';
import type { ModalRequest } from '../src/lib/dialog-ui';
import { modalCanSubmit, modalTone } from '../src/lib/dialog-ui';

test.describe('dialog view helpers', () => {
	test('keeps prompt submit gating and modal tone rules outside AppDialogs', () => {
		const prompt = {
			kind: 'prompt',
			title: 'Rename note',
			label: 'New path',
			resolve: () => {}
		} satisfies ModalRequest;
		const confirm = {
			kind: 'confirm',
			title: 'Delete note',
			message: 'This cannot be undone.',
			tone: 'danger',
			resolve: () => {}
		} satisfies ModalRequest;
		const alert = {
			kind: 'alert',
			title: 'Saved',
			message: 'All changes are safe.',
			tone: 'success',
			resolve: () => {}
		} satisfies ModalRequest;

		expect(modalCanSubmit(prompt, '   ')).toBe(false);
		expect(modalCanSubmit(prompt, 'Daily note')).toBe(true);
		expect(modalCanSubmit(confirm, '')).toBe(true);
		expect(modalTone(null)).toBe('default');
		expect(modalTone(prompt)).toBe('default');
		expect(modalTone(confirm)).toBe('danger');
		expect(modalTone(alert)).toBe('success');
	});
});
