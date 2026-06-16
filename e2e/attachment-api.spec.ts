import { expect, test } from '@playwright/test';
import { attachmentMovePayload, attachmentRenamePayload } from '../src/lib/api/attachments';

test.describe('attachment API client helpers', () => {
	test('builds explicit attachment mutation payloads', () => {
		expect(attachmentRenamePayload('Files/old packet.pdf', 'Files/new packet.pdf')).toEqual({
			from: 'Files/old packet.pdf',
			to: 'Files/new packet.pdf'
		});
		expect(attachmentMovePayload(['Files/roof.png', 'Files/spec.pdf'], 'Organized Assets')).toEqual({
			paths: ['Files/roof.png', 'Files/spec.pdf'],
			folder: 'Organized Assets'
		});
	});
});
