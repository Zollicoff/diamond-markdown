import { expect, test } from '@playwright/test';
import type { TreeNode } from '../src/lib/types';
import {
	collectDirectoryPaths,
	flattenVisibleTreeRows,
	isCanvasTreeFile,
	isMarkdownTreeFile,
	isTreeSortMode,
	parentDirectoriesForPath,
	revealParentDirectories,
	renamedTreeNodePath,
	sortMenuPositionFromRect,
	sortTreeNodes,
	treeFileDisplayName,
	treePathIsDescendant,
	treePathParent,
	treeRowStyle,
	visibleTreeWindow,
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

	test('flattens expanded tree rows and windows the virtualized viewport', () => {
		const nodes = [
			dir('Projects', [
				dir('Projects/Active', [file('Projects/Active/Plan.md')]),
				file('Projects/Readme.md')
			]),
			file('Home.md')
		];
		const rows = flattenVisibleTreeRows(nodes, new Set(['Projects', 'Projects/Active']));

		expect(rows.map((row) => [row.node.path, row.depth])).toEqual([
			['Projects', 0],
			['Projects/Active', 1],
			['Projects/Active/Plan.md', 2],
			['Projects/Readme.md', 1],
			['Home.md', 0]
		]);

		const windowed = visibleTreeWindow(rows, 20, 25, 10, 1);
		expect(windowed.totalHeight).toBe(50);
		expect(windowed.startIndex).toBe(1);
		expect(windowed.endIndex).toBe(5);
		expect(windowed.visibleRows.map((row) => [row.node.path, row.index])).toEqual([
			['Projects/Active', 1],
			['Projects/Active/Plan.md', 2],
			['Projects/Readme.md', 3],
			['Home.md', 4]
		]);
		expect(treeRowStyle({ node: file('Nested.md'), depth: 3, index: 2 }, 10)).toBe(
			'--tree-depth: 3; transform: translateY(20px);'
		);
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

	test('classifies tree path parentage for drag and drop guards', () => {
		expect(treePathParent('Projects/Active/Plan.md')).toBe('Projects/Active');
		expect(treePathParent('Home.md')).toBe('');
		expect(treePathIsDescendant('Projects', 'Projects/Active/Plan.md')).toBe(true);
		expect(treePathIsDescendant('Projects', 'Projects')).toBe(true);
		expect(treePathIsDescendant('Projects', 'Projector/Note.md')).toBe(false);
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
