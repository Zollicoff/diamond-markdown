export interface CanvasMutationState {
	savingNodeId: string | null;
	movingNodeId: string | null;
	moveSavingNodeId: string | null;
	resizingNodeId: string | null;
	resizeSavingNodeId: string | null;
	deletingNodeId: string | null;
	savingEdgeId: string | null;
	deletingEdgeId: string | null;
}

export function canSaveCanvasNodeColor(state: CanvasMutationState): boolean {
	return !(
		state.savingNodeId ||
		state.deletingNodeId ||
		state.movingNodeId ||
		state.moveSavingNodeId ||
		state.resizingNodeId ||
		state.resizeSavingNodeId
	);
}

export function canDeleteCanvasNode(state: CanvasMutationState): boolean {
	return canSaveCanvasNodeColor(state) && !state.savingEdgeId && !state.deletingEdgeId;
}

export function canStartCanvasNodeMove(state: CanvasMutationState): boolean {
	return !state.moveSavingNodeId;
}

export function canStartCanvasNodeResize(state: CanvasMutationState): boolean {
	return !state.resizeSavingNodeId;
}

export function canMutateCanvasEdge(state: CanvasMutationState): boolean {
	return !state.savingEdgeId && !state.deletingEdgeId;
}

export function isCanvasNodeDeleteDisabled(state: CanvasMutationState): boolean {
	return !canDeleteCanvasNode(state);
}
