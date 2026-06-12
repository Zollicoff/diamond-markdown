import type { GNode } from './sim';
import type { GraphPoint, GraphTransform } from './view';

export const GRAPH_DRAG_THRESHOLD_PX = 4;

interface ZoomGraphTransformInput {
	screenPoint: GraphPoint;
	deltaY: number;
	transform: GraphTransform;
	minScale?: number;
	maxScale?: number;
	step?: number;
}

export function zoomGraphTransform({
	screenPoint,
	deltaY,
	transform,
	minScale = 0.2,
	maxScale = 4,
	step = 1.1
}: ZoomGraphTransformInput): GraphTransform {
	const factor = deltaY < 0 ? step : 1 / step;
	const worldX = (screenPoint.x - transform.viewX) / transform.viewScale;
	const worldY = (screenPoint.y - transform.viewY) / transform.viewScale;
	const viewScale = Math.max(minScale, Math.min(maxScale, transform.viewScale * factor));
	return {
		viewScale,
		viewX: screenPoint.x - worldX * viewScale,
		viewY: screenPoint.y - worldY * viewScale
	};
}

export function panGraphTransform(
	origin: GraphPoint,
	start: GraphPoint,
	current: GraphPoint
): Pick<GraphTransform, 'viewX' | 'viewY'> {
	return {
		viewX: origin.x + current.x - start.x,
		viewY: origin.y + current.y - start.y
	};
}

export function graphNodePinnedPosition(
	pointer: GraphPoint,
	viewportOrigin: GraphPoint,
	transform: GraphTransform
): GraphPoint {
	return {
		x: (pointer.x - viewportOrigin.x - transform.viewX) / transform.viewScale,
		y: (pointer.y - viewportOrigin.y - transform.viewY) / transform.viewScale
	};
}

export function graphDragMoved(
	start: GraphPoint,
	current: GraphPoint,
	threshold = GRAPH_DRAG_THRESHOLD_PX
): boolean {
	const dx = current.x - start.x;
	const dy = current.y - start.y;
	return dx * dx + dy * dy > threshold * threshold;
}

export function toggleGraphPathSelection(selectedPaths: string[], path: string): string[] {
	return selectedPaths.includes(path)
		? selectedPaths.filter((selectedPath) => selectedPath !== path)
		: [...selectedPaths, path];
}

export function graphNodeOpenTitle(node: Pick<GNode, 'path' | 'title'>): string {
	return node.title || node.path.split('/').pop()!.replace(/\.md$/, '');
}
