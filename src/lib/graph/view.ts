import type { GEdge, GNode } from './sim';

export interface GraphFilters {
	hideOrphans: boolean;
	searchQuery: string;
}

export interface GraphProjection {
	visiblePaths: Set<string>;
	visibleNodes: GNode[];
	visibleEdges: GEdge[];
	filtersActive: boolean;
	selectedCount: number;
}

export interface GraphSelectionBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface GraphPoint {
	x: number;
	y: number;
}

export interface GraphTransform {
	viewX: number;
	viewY: number;
	viewScale: number;
}

const MIN_SELECTION_SIZE = 8;

export function graphFiltersActive(filters: GraphFilters): boolean {
	return filters.hideOrphans || filters.searchQuery.trim().length > 0;
}

export function buildGraphProjection(
	nodes: GNode[],
	edges: GEdge[],
	filters: GraphFilters,
	selectedPaths: string[] = []
): GraphProjection {
	const q = filters.searchQuery.trim().toLowerCase();
	const visiblePaths = new Set<string>();

	for (const node of nodes) {
		if (filters.hideOrphans && node.degree === 0) continue;
		if (q && !node.title.toLowerCase().includes(q) && !node.path.toLowerCase().includes(q)) continue;
		visiblePaths.add(node.path);
	}

	return {
		visiblePaths,
		visibleNodes: nodes.filter((node) => visiblePaths.has(node.path)),
		visibleEdges: edges.filter((edge) => visiblePaths.has(edge.from) && visiblePaths.has(edge.to)),
		filtersActive: graphFiltersActive(filters),
		selectedCount: selectedPaths.filter((path) => visiblePaths.has(path)).length
	};
}

export function selectionBoxFromPoints(
	selecting: boolean,
	start: GraphPoint | null,
	end: GraphPoint | null
): GraphSelectionBox | null {
	if (!selecting || !start || !end) return null;
	const x = Math.min(start.x, end.x);
	const y = Math.min(start.y, end.y);
	return {
		x,
		y,
		width: Math.abs(end.x - start.x),
		height: Math.abs(end.y - start.y)
	};
}

export function screenToGraph(point: GraphPoint, transform: GraphTransform): GraphPoint {
	return {
		x: (point.x - transform.viewX) / transform.viewScale,
		y: (point.y - transform.viewY) / transform.viewScale
	};
}

export function selectNodesInBox(
	nodes: GNode[],
	box: GraphSelectionBox,
	transform: GraphTransform,
	selectedPaths: string[],
	additive: boolean
): string[] {
	if (box.width < MIN_SELECTION_SIZE || box.height < MIN_SELECTION_SIZE) return selectedPaths;

	const topLeft = screenToGraph({ x: box.x, y: box.y }, transform);
	const bottomRight = screenToGraph({ x: box.x + box.width, y: box.y + box.height }, transform);
	const minX = Math.min(topLeft.x, bottomRight.x);
	const maxX = Math.max(topLeft.x, bottomRight.x);
	const minY = Math.min(topLeft.y, bottomRight.y);
	const maxY = Math.max(topLeft.y, bottomRight.y);
	const next = additive ? [...selectedPaths] : [];

	for (const node of nodes) {
		if (node.x < minX || node.x > maxX || node.y < minY || node.y > maxY || next.includes(node.path)) continue;
		next.push(node.path);
	}

	return next;
}
