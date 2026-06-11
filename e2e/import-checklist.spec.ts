import { expect, test } from '@playwright/test';
import {
	compactPathList,
	importReadiness,
	importSummary
} from '../src/lib/import/checklist';
import type { VaultImportAnalysis } from '../src/lib/types';

function analysis(overrides: Partial<VaultImportAnalysis> = {}): VaultImportAnalysis {
	return {
		path: '/vault',
		markdownFiles: 2,
		assetFiles: 1,
		totalFiles: 3,
		obsidianConfig: false,
		diamondConfig: false,
		gitRepository: true,
		likelyAttachmentFolders: [],
		recommendedExcludedFolders: [],
		ignoredFolders: [],
		warnings: [],
		checklist: [{ id: 'markdown', label: 'Markdown notes', detail: '2 markdown files found.', level: 'ok' }],
		markdownExamples: ['Daily.md'],
		...overrides
	};
}

test.describe('import checklist helpers', () => {
	test('summarizes import readiness without mutating analysis shape', () => {
		expect(importSummary(analysis())).toBe('2 notes · 1 asset');
		expect(importReadiness(analysis())).toEqual({ level: 'ok', label: 'Ready' });
		expect(importReadiness(analysis({ obsidianConfig: true }))).toEqual({ level: 'info', label: 'Ready with notes' });
		expect(importReadiness(analysis({
			checklist: [{ id: 'git', label: 'Git sync readiness', detail: 'No .git folder found.', level: 'warn' }]
		}))).toEqual({ level: 'warn', label: 'Needs review' });
	});

	test('compacts long folder lists for dense import cards', () => {
		expect(compactPathList(['.obsidian', 'assets'])).toBe('.obsidian, assets');
		expect(compactPathList(['a', 'b', 'c', 'd', 'e'], 3)).toBe('a, b, c +2 more');
	});
});
