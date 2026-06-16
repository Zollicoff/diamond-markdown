import type { CanvasDoc, CanvasMutationResult, CanvasNotePreview } from '$lib/types';
import type { CanvasAddNodeType, CanvasEdgeEnd, CanvasEdgeSide } from '$lib/canvas/view';
import { emit } from '$lib/events';
import { json } from '$lib/api/request';

export interface CanvasAddNodePayload {
	path: string;
	action: 'add-node';
	nodeType: CanvasAddNodeType;
	expectedRevision: string;
	file?: string;
	url?: string;
	label?: string;
	text?: string;
}

export interface CanvasEdgeRoutingPayload {
	fromSide: CanvasEdgeSide;
	toSide: CanvasEdgeSide;
	fromEnd: CanvasEdgeEnd;
	toEnd: CanvasEdgeEnd;
}

export function canvasAddNodePayload(
	path: string,
	nodeType: CanvasAddNodeType,
	value: string,
	expectedRevision: string
): CanvasAddNodePayload {
	const payload: CanvasAddNodePayload = { path, action: 'add-node', nodeType, expectedRevision };
	if (nodeType === 'file') payload.file = value;
	else if (nodeType === 'link') payload.url = value;
	else if (nodeType === 'group') payload.label = value || 'Group';
	else payload.text = value || 'New text card';
	return payload;
}

function emitCanvasSaved(vaultId: string, res: CanvasMutationResult): void {
	emit('canvas:saved', { vaultId, path: res.path, sha: res.sha });
	emit('tree:invalidate', { vaultId });
}

async function mutateCanvas(
	vaultId: string,
	payload: object
): Promise<CanvasMutationResult> {
	const res = await json<CanvasMutationResult>(`/api/vaults/${vaultId}/canvas`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(payload)
	});
	emitCanvasSaved(vaultId, res);
	return res;
}

async function addCanvasNodeRequest(
	vaultId: string,
	path: string,
	nodeType: CanvasAddNodeType,
	value: string,
	expectedRevision: string
): Promise<CanvasMutationResult> {
	return mutateCanvas(vaultId, canvasAddNodePayload(path, nodeType, value, expectedRevision));
}

export const canvasApi = {
	async canvas(vaultId: string, path: string): Promise<CanvasDoc> {
		return json(`/api/vaults/${vaultId}/canvas?path=${encodeURIComponent(path)}`);
	},

	async canvasNotePreviews(vaultId: string, paths: string[]): Promise<CanvasNotePreview[]> {
		const res = await json<{ previews: CanvasNotePreview[] }>(`/api/vaults/${vaultId}/canvas/note-previews`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ paths })
		});
		return res.previews ?? [];
	},

	async addCanvasTextNode(
		vaultId: string,
		path: string,
		expectedRevision: string,
		text = 'New text card'
	): Promise<CanvasMutationResult> {
		return addCanvasNodeRequest(vaultId, path, 'text', text, expectedRevision);
	},

	async addCanvasNode(
		vaultId: string,
		path: string,
		nodeType: CanvasAddNodeType,
		value: string,
		expectedRevision: string
	): Promise<CanvasMutationResult> {
		return addCanvasNodeRequest(vaultId, path, nodeType, value, expectedRevision);
	},

	async updateCanvasTextNode(
		vaultId: string,
		path: string,
		nodeId: string,
		text: string,
		expectedRevision: string
	): Promise<CanvasMutationResult> {
		return mutateCanvas(vaultId, { path, action: 'update-node-text', nodeId, text, expectedRevision });
	},

	async updateCanvasGroupLabel(
		vaultId: string,
		path: string,
		nodeId: string,
		label: string,
		expectedRevision: string
	): Promise<CanvasMutationResult> {
		return mutateCanvas(vaultId, { path, action: 'update-group-label', nodeId, label, expectedRevision });
	},

	async updateCanvasNodeReference(
		vaultId: string,
		path: string,
		nodeId: string,
		nodeType: 'file' | 'link',
		value: string,
		label: string,
		subpath: string,
		expectedRevision: string
	): Promise<CanvasMutationResult> {
		const payload: Record<string, unknown> = {
			path,
			action: 'update-node-reference',
			nodeId,
			label,
			expectedRevision
		};
		if (nodeType === 'file') {
			payload.file = value;
			payload.subpath = subpath;
		} else {
			payload.url = value;
		}
		return mutateCanvas(vaultId, payload);
	},

	async updateCanvasNodeColor(
		vaultId: string,
		path: string,
		nodeId: string,
		color: string,
		expectedRevision: string
	): Promise<CanvasMutationResult> {
		return mutateCanvas(vaultId, { path, action: 'update-node-color', nodeId, color, expectedRevision });
	},

	async duplicateCanvasNode(
		vaultId: string,
		path: string,
		nodeId: string,
		expectedRevision: string
	): Promise<CanvasMutationResult> {
		return mutateCanvas(vaultId, { path, action: 'duplicate-node', nodeId, expectedRevision });
	},

	async moveCanvasNode(
		vaultId: string,
		path: string,
		nodeId: string,
		x: number,
		y: number,
		expectedRevision: string
	): Promise<CanvasMutationResult> {
		return mutateCanvas(vaultId, { path, action: 'move-node', nodeId, x, y, expectedRevision });
	},

	async resizeCanvasNode(
		vaultId: string,
		path: string,
		nodeId: string,
		width: number,
		height: number,
		expectedRevision: string
	): Promise<CanvasMutationResult> {
		return mutateCanvas(vaultId, { path, action: 'resize-node', nodeId, width, height, expectedRevision });
	},

	async deleteCanvasNode(
		vaultId: string,
		path: string,
		nodeId: string,
		expectedRevision: string
	): Promise<CanvasMutationResult> {
		return mutateCanvas(vaultId, { path, action: 'delete-node', nodeId, expectedRevision });
	},

	async addCanvasEdge(
		vaultId: string,
		path: string,
		fromNode: string,
		toNode: string,
		label: string,
		expectedRevision: string
	): Promise<CanvasMutationResult> {
		return mutateCanvas(vaultId, { path, action: 'add-edge', fromNode, toNode, label, expectedRevision });
	},

	async updateCanvasEdgeLabel(
		vaultId: string,
		path: string,
		edgeId: string,
		label: string,
		expectedRevision: string
	): Promise<CanvasMutationResult> {
		return mutateCanvas(vaultId, { path, action: 'update-edge-label', edgeId, label, expectedRevision });
	},

	async updateCanvasEdgeColor(
		vaultId: string,
		path: string,
		edgeId: string,
		color: string,
		expectedRevision: string
	): Promise<CanvasMutationResult> {
		return mutateCanvas(vaultId, { path, action: 'update-edge-color', edgeId, color, expectedRevision });
	},

	async updateCanvasEdgeRouting(
		vaultId: string,
		path: string,
		edgeId: string,
		routing: CanvasEdgeRoutingPayload,
		expectedRevision: string
	): Promise<CanvasMutationResult> {
		return mutateCanvas(vaultId, {
			path,
			action: 'update-edge-routing',
			edgeId,
			...routing,
			expectedRevision
		});
	},

	async deleteCanvasEdge(
		vaultId: string,
		path: string,
		edgeId: string,
		expectedRevision: string
	): Promise<CanvasMutationResult> {
		return mutateCanvas(vaultId, { path, action: 'delete-edge', edgeId, expectedRevision });
	},

	async renameCanvas(vaultId: string, from: string, to: string): Promise<{ sha: string | null }> {
		const res = await json<{ from: string; to: string; sha: string | null }>(
			`/api/vaults/${vaultId}/canvas`,
			{
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ from, to })
			}
		);
		emit('canvas:renamed', { vaultId, from: res.from, to: res.to });
		emit('tree:invalidate', { vaultId });
		return { sha: res.sha };
	},

	async deleteCanvas(vaultId: string, path: string): Promise<void> {
		await json(`/api/vaults/${vaultId}/canvas?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
		emit('canvas:deleted', { vaultId, path });
		emit('tree:invalidate', { vaultId });
	}
};
