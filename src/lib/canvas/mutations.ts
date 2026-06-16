export interface CanvasMutationState {
	savingNodeId: string | null;
	duplicatingNodeId: string | null;
	movingNodeId: string | null;
	moveSavingNodeId: string | null;
	resizingNodeId: string | null;
	resizeSavingNodeId: string | null;
	deletingNodeId: string | null;
	savingEdgeId: string | null;
	deletingEdgeId: string | null;
}

export interface CanvasNodeMutationFlags {
	saving: boolean;
	duplicating: boolean;
	moving: boolean;
	resizing: boolean;
	deleting: boolean;
	duplicateDisabled: boolean;
	deleteDisabled: boolean;
}

export interface CanvasEdgeMutationFlags {
	saving: boolean;
	deleting: boolean;
	disabled: boolean;
}

const IDLE_CANVAS_MUTATION_STATE: CanvasMutationState = {
	savingNodeId: null,
	duplicatingNodeId: null,
	movingNodeId: null,
	moveSavingNodeId: null,
	resizingNodeId: null,
	resizeSavingNodeId: null,
	deletingNodeId: null,
	savingEdgeId: null,
	deletingEdgeId: null
};

export function idleCanvasMutationState(
	overrides: Partial<CanvasMutationState> = {}
): CanvasMutationState {
	return { ...IDLE_CANVAS_MUTATION_STATE, ...overrides };
}

export function patchCanvasMutationState(
	state: CanvasMutationState,
	patch: Partial<CanvasMutationState>
): CanvasMutationState {
	return { ...state, ...patch };
}

export function clearCanvasPointerMutationState(state: CanvasMutationState): CanvasMutationState {
	return patchCanvasMutationState(state, {
		movingNodeId: null,
		resizingNodeId: null
	});
}

export function canSaveCanvasNodeContent(state: CanvasMutationState): boolean {
	return !state.savingNodeId && !state.duplicatingNodeId;
}

export function canSaveCanvasNodeColor(state: CanvasMutationState): boolean {
	return !(
		state.savingNodeId ||
		state.duplicatingNodeId ||
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

export function canDuplicateCanvasNode(state: CanvasMutationState): boolean {
	return canDeleteCanvasNode(state);
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

export function canvasNodeMutationFlags(
	nodeId: string,
	state: CanvasMutationState
): CanvasNodeMutationFlags {
	return {
		saving: state.savingNodeId === nodeId,
		duplicating: state.duplicatingNodeId === nodeId,
		moving: state.movingNodeId === nodeId || state.moveSavingNodeId === nodeId,
		resizing: state.resizingNodeId === nodeId || state.resizeSavingNodeId === nodeId,
		deleting: state.deletingNodeId === nodeId,
		duplicateDisabled: !canDuplicateCanvasNode(state),
		deleteDisabled: isCanvasNodeDeleteDisabled(state)
	};
}

export function canvasEdgeMutationFlags(
	edgeId: string,
	state: CanvasMutationState
): CanvasEdgeMutationFlags {
	return {
		saving: state.savingEdgeId === edgeId,
		deleting: state.deletingEdgeId === edgeId,
		disabled: !canMutateCanvasEdge(state)
	};
}
