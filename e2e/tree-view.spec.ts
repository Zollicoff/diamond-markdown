import { expect, test } from '@playwright/test';
import type { TreeNode } from '../src/lib/types';
import {
	collectDirectoryPaths,
	isCanvasTreeFile,
	isMarkdownTreeFile,
	isTreeSortMode,
	parentDirectoriesForPath,
	revealParentDirectories,
	renamedTreeNodePath,
	sortMenuPositionFromRect,
	sortTreeNodes,
	treeFileDisplayName,
	topLevelDirectoryPaths
} from '../src/lib/tree/view';

function file(path: string, mtime = 0, ctime = 0): TreeNode {
	return {
		name: path.split('/').pop() ?? path,
		path,
		type: 'file',
		mtime,
		ctime
	};
}

function dir(path: string, children: TreeNode[] = []): TreeNode {
	return {
		name: path.split('/').pop() ?? path,
		path,
		type: 'directory',
		children
	};
}

test.describe('tree view helpers', () => {
	test('sorts directories first and applies recursive file ordering', () => {
		const nodes = [
			file('zeta.md', 30, 10),
			dir('Projects', [file('Projects/Note 10.md'), file('Projects/Note 2.md')]),
			file('alpha.md', 10, 30)
		];

		expect(sortTreeNodes(nodes, 'name-asc').map((node) => node.path)).toEqual([
			'Projects',
			'alpha.md',
			'zeta.md'
		]);
		expect(sortTreeNodes(nodes, 'name-asc')[0].children?.map((node) => node.path)).toEqual([
			'Projects/Note 2.md',
			'Projects/Note 10.md'
		]);
		expect(sortTreeNodes(nodes, 'mtime-desc').map((node) => node.path)).toEqual([
			'Projects',
			'zeta.md',
			'alpha.md'
		]);
		expect(sortTreeNodes(nodes, 'ctime-desc').map((node) => node.path)).toEqual([
			'Projects',
			'alpha.md',
			'zeta.md'
		]);
	});

	test('collects directory paths for default expansion and expand-all', () => {
		const nodes = [
			dir('Projects', [dir('Projects/Active'), file('Projects/Active/Plan.md')]),
			dir('Archive'),
			file('Home.md')
		];

		expect([...topLevelDirectoryPaths(nodes)].sort()).toEqual(['Archive', 'Projects']);
		expect([...collectDirectoryPaths(nodes)].sort()).toEqual(['Archive', 'Projects', 'Projects/Active']);
	});

	test('reveals active note parents without changing already-open sets', () => {
		expect(parentDirectoriesForPath('Projects/Active/Plan.md')).toEqual(['Projects', 'Projects/Active']);

		const expanded = new Set(['Projects']);
		const revealed = revealParentDirectories(expanded, 'Projects/Active/Plan.md');
		expect([...revealed].sort()).toEqual(['Projects', 'Projects/Active']);
		expect(revealed).not.toBe(expanded);

		expect(revealParentDirectories(revealed, 'Projects/Active/Plan.md')).toBe(revealed);
		expect(revealParentDirectories(revealed, 'Home.md')).toBe(revealed);
		expect(revealParentDirectories(revealed, null)).toBe(revealed);
	});

	test('guards persisted sort modes and positions the fixed sort menu', () => {
		expect(isTreeSortMode('name-asc')).toBe(true);
		expect(isTreeSortMode('surprise')).toBe(false);
		expect(sortMenuPositionFromRect({ bottom: 40, right: 280 })).toEqual({ top: 44, left: 60 });
	});

	test('classifies markdown and canvas files for tree-only behavior', () => {
		const canvas = { ...file('Boards/Plan.canvas'), fileKind: 'canvas' as const };
		const markdown = { ...file('Notes/Daily.markdown'), fileKind: 'markdown' as const };

		expect(treeFileDisplayName(canvas)).toBe('Plan');
		expect(treeFileDisplayName(markdown)).toBe('Daily');
		expect(isCanvasTreeFile(canvas)).toBe(true);
		expect(isCanvasTreeFile(markdown)).toBe(false);
		expect(isMarkdownTreeFile(markdown)).toBe(true);
		expect(isMarkdownTreeFile(canvas)).toBe(false);
		expect(renamedTreeNodePath(canvas, 'Roadmap')).toBe('Boards/Roadmap.canvas');
		expect(renamedTreeNodePath(markdown, 'Weekly')).toBe('Notes/Weekly.markdown');
		expect(renamedTreeNodePath(dir('Boards'), 'Canvases')).toBe('Canvases');
	});
});
