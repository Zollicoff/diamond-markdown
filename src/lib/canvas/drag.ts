import type { CanvasNode } from '$lib/types';
import type { CanvasNodePosition, CanvasNodeSize } from './view';

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

export interface CanvasNodeResizeState {
	nodeId: string;
	pointerId: number;
	startClientX: number;
	startClientY: number;
	originWidth: number;
	originHeight: number;
	minWidth: number;
	minHeight: number;
	currentWidth: number;
	currentHeight: number;
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

export function canvasNodeMinSize(node: Pick<CanvasNode, 'type'>): { width: number; height: number } {
	if (node.type === 'file' || node.type === 'link') return { width: 140, height: 150 };
	if (node.type === 'group') return { width: 160, height: 120 };
	return { width: 120, height: 80 };
}

export function createCanvasNodeResizeState(
	node: Pick<CanvasNode, 'id' | 'type' | 'width' | 'height'>,
	pointer: CanvasDragPointer
): CanvasNodeResizeState {
	const min = canvasNodeMinSize(node);
	return {
		nodeId: node.id,
		pointerId: pointer.pointerId,
		startClientX: pointer.clientX,
		startClientY: pointer.clientY,
		originWidth: node.width,
		originHeight: node.height,
		minWidth: min.width,
		minHeight: min.height,
		currentWidth: node.width,
		currentHeight: node.height
	};
}

export function isCanvasNodeResizePointer(
	state: CanvasNodeResizeState | null,
	pointer: Pick<CanvasDragPointer, 'pointerId'>
): state is CanvasNodeResizeState {
	return Boolean(state && pointer.pointerId === state.pointerId);
}

export function updateCanvasNodeResizeState(
	state: CanvasNodeResizeState,
	pointer: CanvasDragPointer
): CanvasNodeResizeState {
	if (!isCanvasNodeResizePointer(state, pointer)) return state;
	return {
		...state,
		currentWidth: Math.max(state.minWidth, Math.round(state.originWidth + pointer.clientX - state.startClientX)),
		currentHeight: Math.max(state.minHeight, Math.round(state.originHeight + pointer.clientY - state.startClientY))
	};
}

export function canvasNodeResizeSize(state: CanvasNodeResizeState): CanvasNodeSize {
	return {
		nodeId: state.nodeId,
		width: state.currentWidth,
		height: state.currentHeight
	};
}
