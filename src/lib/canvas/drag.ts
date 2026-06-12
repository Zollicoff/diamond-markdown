import type { CanvasNode } from '$lib/types';
import type { CanvasNodePosition } from './view';

export interface CanvasDragPointer {
	pointerId: number;
	clientX: number;
	clientY: number;
}

export interface CanvasNodeDragState {
	nodeId: string;
	pointerId: number;
	startClientX: number;
	startClientY: number;
	originX: number;
	originY: number;
	currentX: number;
	currentY: number;
}

export function createCanvasNodeDragState(
	node: Pick<CanvasNode, 'id' | 'x' | 'y'>,
	pointer: CanvasDragPointer
): CanvasNodeDragState {
	return {
		nodeId: node.id,
		pointerId: pointer.pointerId,
		startClientX: pointer.clientX,
		startClientY: pointer.clientY,
		originX: node.x,
		originY: node.y,
		currentX: node.x,
		currentY: node.y
	};
}

export function isCanvasNodeDragPointer(
	state: CanvasNodeDragState | null,
	pointer: Pick<CanvasDragPointer, 'pointerId'>
): state is CanvasNodeDragState {
	return Boolean(state && pointer.pointerId === state.pointerId);
}

export function updateCanvasNodeDragState(
	state: CanvasNodeDragState,
	pointer: CanvasDragPointer
): CanvasNodeDragState {
	if (!isCanvasNodeDragPointer(state, pointer)) return state;
	return {
		...state,
		currentX: Math.round(state.originX + pointer.clientX - state.startClientX),
		currentY: Math.round(state.originY + pointer.clientY - state.startClientY)
	};
}

export function canvasNodeDragPosition(state: CanvasNodeDragState): CanvasNodePosition {
	return {
		nodeId: state.nodeId,
		x: state.currentX,
		y: state.currentY
	};
}
