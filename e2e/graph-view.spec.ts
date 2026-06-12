import { test, expect } from '@playwright/test';
import type { GNode, GEdge } from '../src/lib/graph/sim';
import {
	buildGraphProjection,
	screenToGraph,
	selectNodesInBox,
	selectionBoxFromPoints
} from '../src/lib/graph/view';
import {
	graphDragMoved,
	graphNodeOpenTitle,
	panGraphTransform,
	toggleGraphPathSelection,
	zoomGraphTransform
} from '../src/lib/graph/interaction';

function node(path: string, title: string, degree: number, x = 0, y = 0): GNode {
	return {
		path,
		title,
		degree,
		x,
		y,
		vx: 0,
		vy: 0,
		fx: null,
		fy: null
	};
}

test.describe('graph view helpers', () => {
	test('projects visible graph data from filters and selected paths', () => {
		const nodes = [
			node('Alpha.md', 'Alpha', 2),
			node('Beta.md', 'Beta', 1),
			node('Archive/Orphan.md', 'Orphan', 0)
		];
		const edges: GEdge[] = [
			{ from: 'Alpha.md', to: 'Beta.md' },
			{ from: 'Alpha.md', to: 'Archive/Orphan.md' }
		];

		const projection = buildGraphProjection(
			nodes,
			edges,
			{ hideOrphans: true, searchQuery: 'a' },
			['Alpha.md', 'Archive/Orphan.md']
		);

		expect([...projection.visiblePaths].sort()).toEqual(['Alpha.md', 'Beta.md']);
		expect(projection.visibleNodes.map((n) => n.path)).toEqual(['Alpha.md', 'Beta.md']);
		expect(projection.visibleEdges).toEqual([{ from: 'Alpha.md', to: 'Beta.md' }]);
		expect(projection.filtersActive).toBe(true);
		expect(projection.selectedCount).toBe(1);
	});

	test('normalizes selection boxes and converts screen coordinates', () => {
		expect(selectionBoxFromPoints(false, { x: 0, y: 0 }, { x: 10, y: 10 })).toBeNull();
		expect(selectionBoxFromPoints(true, { x: 20, y: 30 }, { x: 5, y: 80 })).toEqual({
			x: 5,
			y: 30,
			width: 15,
			height: 50
		});
		expect(screenToGraph({ x: 130, y: 80 }, { viewX: 30, viewY: 20, viewScale: 2 })).toEqual({
			x: 50,
			y: 30
		});
	});

	test('keeps pointer interaction math outside the graph component', () => {
		const zoomed = zoomGraphTransform({
			screenPoint: { x: 100, y: 80 },
			deltaY: -1,
			transform: { viewX: 20, viewY: 10, viewScale: 1 }
		});
		expect(zoomed.viewX).toBeCloseTo(12);
		expect(zoomed.viewY).toBeCloseTo(3);
		expect(zoomed.viewScale).toBeCloseTo(1.1);

		expect(panGraphTransform(
			{ x: 40, y: 50 },
			{ x: 10, y: 20 },
			{ x: 25, y: 5 }
		)).toEqual({ viewX: 55, viewY: 35 });

		expect(graphDragMoved({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(true);
		expect(graphDragMoved({ x: 0, y: 0 }, { x: 2, y: 2 })).toBe(false);
		expect(toggleGraphPathSelection(['A.md'], 'B.md')).toEqual(['A.md', 'B.md']);
		expect(toggleGraphPathSelection(['A.md', 'B.md'], 'A.md')).toEqual(['B.md']);
		expect(graphNodeOpenTitle(node('Folder/Fallback.md', '', 0))).toBe('Fallback');
		expect(graphNodeOpenTitle(node('Folder/Named.md', 'Named note', 0))).toBe('Named note');
	});

	test('selects visible nodes inside the drag box without disturbing tiny drags', () => {
		const nodes = [
			node('A.md', 'A', 1, 10, 10),
			node('B.md', 'B', 1, 50, 50),
			node('C.md', 'C', 1, 200, 200)
		];
		const transform = { viewX: 0, viewY: 0, viewScale: 1 };

		expect(selectNodesInBox(
			nodes,
			{ x: 0, y: 0, width: 70, height: 70 },
			transform,
			['Existing.md'],
			true
		)).toEqual(['Existing.md', 'A.md', 'B.md']);

		expect(selectNodesInBox(
			nodes,
			{ x: 0, y: 0, width: 70, height: 70 },
			transform,
			['Existing.md'],
			false
		)).toEqual(['A.md', 'B.md']);

		expect(selectNodesInBox(
			nodes,
			{ x: 0, y: 0, width: 4, height: 70 },
			transform,
			['Existing.md'],
			false
		)).toEqual(['Existing.md']);
	});
});
