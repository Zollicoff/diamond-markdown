/**
 * Typed client wrappers around /api/vaults/*. Every fetch call in the
 * client goes through here — UI components never construct URLs or
 * parse responses directly.
 *
 * Every mutation emits a bus event on success so subscribers react
 * without explicit wiring.
 */

import type { AttachmentMoveResult, AttachmentRef, AttachmentUploadResult, CanvasDoc, CanvasMutationResult, GitSyncResult, GitSyncStatus, NoteDoc, SearchHit, SearchResponse, TreeNode, VaultImportAnalysis, VaultRef } from './types';
import type { PluginCatalogResponse, PluginInstallResponse, PluginListResponse } from './plugins/types';
import type { CanvasAddNodeType, CanvasEdgeEnd, CanvasEdgeSide } from './canvas/view';
import { emit } from './events';

async function json<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
	const res = await fetch(input, init);
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`HTTP ${res.status}${body ? ': ' + body.slice(0, 200) : ''}`);
	}
	return res.json() as Promise<T>;
}

async function addCanvasNodeRequest(
	vaultId: string,
	path: string,
	nodeType: CanvasAddNodeType,
	value: string,
	expectedRevision: string
): Promise<CanvasMutationResult> {
	const payload: Record<string, unknown> = { path, action: 'add-node', nodeType, expectedRevision };
	if (nodeType === 'file') payload.file = value;
	else if (nodeType === 'link') payload.url = value;
	else if (nodeType === 'group') payload.label = value || 'Group';
	else payload.text = value || 'New text card';
	const res = await json<CanvasMutationResult>(`/api/vaults/${vaultId}/canvas`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(payload)
	});
	emit('canvas:saved', { vaultId, path: res.path, sha: res.sha });
	emit('tree:invalidate', { vaultId });
	return res;
}

export const api = {
	async addVault(name: string, path: string): Promise<{ vault: VaultRef }> {
		return json('/api/vaults', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name, path })
		});
	},

	async inspectVaultImport(path: string): Promise<VaultImportAnalysis> {
		return json('/api/vaults/import-check', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ path })
		});
	},

	async tree(vaultId: string): Promise<{ tree: TreeNode[] }> {
		return json(`/api/vaults/${vaultId}/tree`);
	},

	async note(vaultId: string, path: string): Promise<NoteDoc> {
		return json(`/api/vaults/${vaultId}/note?path=${encodeURIComponent(path)}`);
	},

	async canvas(vaultId: string, path: string): Promise<CanvasDoc> {
		return json(`/api/vaults/${vaultId}/canvas?path=${encodeURIComponent(path)}`);
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
		const res = await json<CanvasMutationResult>(`/api/vaults/${vaultId}/canvas`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ path, action: 'update-node-text', nodeId, text, expectedRevision })
		});
		emit('canvas:saved', { vaultId, path: res.path, sha: res.sha });
		emit('tree:invalidate', { vaultId });
		return res;
	},

	async updateCanvasGroupLabel(
		vaultId: string,
		path: string,
		nodeId: string,
		label: string,
		expectedRevision: string
	): Promise<CanvasMutationResult> {
		const res = await json<CanvasMutationResult>(`/api/vaults/${vaultId}/canvas`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ path, action: 'update-group-label', nodeId, label, expectedRevision })
		});
		emit('canvas:saved', { vaultId, path: res.path, sha: res.sha });
		emit('tree:invalidate', { vaultId });
		return res;
	},

	async updateCanvasNodeReference(
		vaultId: string,
		path: string,
		nodeId: string,
		nodeType: 'file' | 'link',
		value: string,
		label: string,
		expectedRevision: string
	): Promise<CanvasMutationResult> {
		const payload: Record<string, unknown> = {
			path,
			action: 'update-node-reference',
			nodeId,
			label,
			expectedRevision
		};
		if (nodeType === 'file') payload.file = value;
		else payload.url = value;
		const res = await json<CanvasMutationResult>(`/api/vaults/${vaultId}/canvas`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});
		emit('canvas:saved', { vaultId, path: res.path, sha: res.sha });
		emit('tree:invalidate', { vaultId });
		return res;
	},

	async updateCanvasNodeColor(
		vaultId: string,
		path: string,
		nodeId: string,
		color: string,
		expectedRevision: string
	): Promise<CanvasMutationResult> {
		const res = await json<CanvasMutationResult>(`/api/vaults/${vaultId}/canvas`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ path, action: 'update-node-color', nodeId, color, expectedRevision })
		});
		emit('canvas:saved', { vaultId, path: res.path, sha: res.sha });
		emit('tree:invalidate', { vaultId });
		return res;
	},

	async moveCanvasNode(
		vaultId: string,
		path: string,
		nodeId: string,
		x: number,
		y: number,
		expectedRevision: string
	): Promise<CanvasMutationResult> {
		const res = await json<CanvasMutationResult>(`/api/vaults/${vaultId}/canvas`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ path, action: 'move-node', nodeId, x, y, expectedRevision })
		});
		emit('canvas:saved', { vaultId, path: res.path, sha: res.sha });
		emit('tree:invalidate', { vaultId });
		return res;
	},

	async resizeCanvasNode(
		vaultId: string,
		path: string,
		nodeId: string,
		width: number,
		height: number,
		expectedRevision: string
	): Promise<CanvasMutationResult> {
		const res = await json<CanvasMutationResult>(`/api/vaults/${vaultId}/canvas`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ path, action: 'resize-node', nodeId, width, height, expectedRevision })
		});
		emit('canvas:saved', { vaultId, path: res.path, sha: res.sha });
		emit('tree:invalidate', { vaultId });
		return res;
	},

	async deleteCanvasNode(
		vaultId: string,
		path: string,
		nodeId: string,
		expectedRevision: string
	): Promise<CanvasMutationResult> {
		const res = await json<CanvasMutationResult>(`/api/vaults/${vaultId}/canvas`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ path, action: 'delete-node', nodeId, expectedRevision })
		});
		emit('canvas:saved', { vaultId, path: res.path, sha: res.sha });
		emit('tree:invalidate', { vaultId });
		return res;
	},

	async addCanvasEdge(
		vaultId: string,
		path: string,
		fromNode: string,
		toNode: string,
		label: string,
		expectedRevision: string
	): Promise<CanvasMutationResult> {
		const res = await json<CanvasMutationResult>(`/api/vaults/${vaultId}/canvas`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ path, action: 'add-edge', fromNode, toNode, label, expectedRevision })
		});
		emit('canvas:saved', { vaultId, path: res.path, sha: res.sha });
		emit('tree:invalidate', { vaultId });
		return res;
	},

	async updateCanvasEdgeLabel(
		vaultId: string,
		path: string,
		edgeId: string,
		label: string,
		expectedRevision: string
	): Promise<CanvasMutationResult> {
		const res = await json<CanvasMutationResult>(`/api/vaults/${vaultId}/canvas`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ path, action: 'update-edge-label', edgeId, label, expectedRevision })
		});
		emit('canvas:saved', { vaultId, path: res.path, sha: res.sha });
		emit('tree:invalidate', { vaultId });
		return res;
	},

	async updateCanvasEdgeColor(
		vaultId: string,
		path: string,
		edgeId: string,
		color: string,
		expectedRevision: string
	): Promise<CanvasMutationResult> {
		const res = await json<CanvasMutationResult>(`/api/vaults/${vaultId}/canvas`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ path, action: 'update-edge-color', edgeId, color, expectedRevision })
		});
		emit('canvas:saved', { vaultId, path: res.path, sha: res.sha });
		emit('tree:invalidate', { vaultId });
		return res;
	},

	async updateCanvasEdgeRouting(
		vaultId: string,
		path: string,
		edgeId: string,
		routing: {
			fromSide: CanvasEdgeSide;
			toSide: CanvasEdgeSide;
			fromEnd: CanvasEdgeEnd;
			toEnd: CanvasEdgeEnd;
		},
		expectedRevision: string
	): Promise<CanvasMutationResult> {
		const res = await json<CanvasMutationResult>(`/api/vaults/${vaultId}/canvas`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				path,
				action: 'update-edge-routing',
				edgeId,
				...routing,
				expectedRevision
			})
		});
		emit('canvas:saved', { vaultId, path: res.path, sha: res.sha });
		emit('tree:invalidate', { vaultId });
		return res;
	},

	async deleteCanvasEdge(
		vaultId: string,
		path: string,
		edgeId: string,
		expectedRevision: string
	): Promise<CanvasMutationResult> {
		const res = await json<CanvasMutationResult>(`/api/vaults/${vaultId}/canvas`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ path, action: 'delete-edge', edgeId, expectedRevision })
		});
		emit('canvas:saved', { vaultId, path: res.path, sha: res.sha });
		emit('tree:invalidate', { vaultId });
		return res;
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
	},

	async saveNote(vaultId: string, path: string, content: string, expectedRevision?: string): Promise<{
		created: boolean;
		sha: string | null;
		path: string;
		revision: string;
		mtime: number;
	}> {
		const res = await json<{
			created: boolean;
			sha: string | null;
			path: string;
			revision: string;
			mtime: number;
		}>(`/api/vaults/${vaultId}/note`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ path, content, expectedRevision })
		});
		emit(res.created ? 'note:created' : 'note:saved', { vaultId, path, sha: res.sha });
		emit('tree:invalidate', { vaultId });
		return res;
	},

	async createNote(vaultId: string, path: string, content: string): Promise<{ sha: string | null }> {
		const res = await json<{ created: boolean; sha: string | null }>(`/api/vaults/${vaultId}/note`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ path, content })
		});
		emit('note:created', { vaultId, path });
		emit('tree:invalidate', { vaultId });
		return { sha: res.sha };
	},

	async deleteNote(vaultId: string, path: string): Promise<void> {
		await json(`/api/vaults/${vaultId}/note?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
		emit('note:deleted', { vaultId, path });
		emit('tree:invalidate', { vaultId });
	},

	async uploadAttachment(vaultId: string, file: File): Promise<AttachmentUploadResult> {
		const form = new FormData();
		form.append('file', file);
		const res = await json<AttachmentUploadResult>(`/api/vaults/${vaultId}/attachment`, {
			method: 'POST',
			body: form
		});
		emit('tree:invalidate', { vaultId });
		return res;
	},

	async attachments(vaultId: string): Promise<AttachmentRef[]> {
		const res = await json<{ attachments: AttachmentRef[] }>(`/api/vaults/${vaultId}/attachment`);
		return res.attachments ?? [];
	},

	async deleteAttachment(vaultId: string, path: string): Promise<void> {
		await json(`/api/vaults/${vaultId}/attachment?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
		emit('tree:invalidate', { vaultId });
	},

	async renameAttachment(
		vaultId: string,
		from: string,
		to: string
	): Promise<{ from: string; to: string; linksUpdated: number; touched: string[]; sha: string | null }> {
		const res = await json<{ from: string; to: string; linksUpdated: number; touched: string[]; sha: string | null }>(
			`/api/vaults/${vaultId}/attachment`,
			{
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ from, to })
			}
		);
		for (const path of res.touched) {
			emit('note:saved', { vaultId, path, sha: res.sha });
		}
		emit('tree:invalidate', { vaultId });
		return res;
	},

	async moveAttachments(vaultId: string, paths: string[], folder: string): Promise<AttachmentMoveResult> {
		const res = await json<AttachmentMoveResult>(`/api/vaults/${vaultId}/attachment`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ paths, folder })
		});
		for (const path of res.touched) {
			emit('note:saved', { vaultId, path, sha: res.sha });
		}
		emit('tree:invalidate', { vaultId });
		return res;
	},

	async renameNote(vaultId: string, from: string, to: string): Promise<{ linksUpdated: number; touched: string[]; sha: string | null }> {
		const res = await json<{ linksUpdated: number; touched: string[]; sha: string | null }>(
			`/api/vaults/${vaultId}/note`,
			{
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ from, to })
			}
		);
		emit('note:renamed', { vaultId, from, to, linksUpdated: res.linksUpdated });
		emit('tree:invalidate', { vaultId });
		return res;
	},

	async duplicateNote(vaultId: string, from: string): Promise<{ path: string; sha: string | null }> {
		const res = await json<{ path: string; sha: string | null }>(`/api/vaults/${vaultId}/note`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ from, duplicate: true })
		});
		emit('note:created', { vaultId, path: res.path });
		emit('tree:invalidate', { vaultId });
		return res;
	},

	async createFolder(vaultId: string, path: string): Promise<void> {
		await json(`/api/vaults/${vaultId}/folder`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ path })
		});
		emit('tree:invalidate', { vaultId });
	},

	async renameFolder(vaultId: string, from: string, to: string): Promise<void> {
		await json(`/api/vaults/${vaultId}/folder`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ from, to })
		});
		emit('folder:renamed', { vaultId, from, to });
		emit('tree:invalidate', { vaultId });
	},

	async deleteFolder(vaultId: string, path: string, force: boolean): Promise<void> {
		const q = `path=${encodeURIComponent(path)}${force ? '&force=1' : ''}`;
		await json(`/api/vaults/${vaultId}/folder?${q}`, { method: 'DELETE' });
		emit('folder:deleted', { vaultId, path });
		emit('tree:invalidate', { vaultId });
	},

	async search(vaultId: string, query: string, opts: { full?: boolean; limit?: number; offset?: number; signal?: AbortSignal } = {}): Promise<SearchHit[]> {
		return (await this.searchWithMeta(vaultId, query, opts)).results;
	},

	async searchWithMeta(vaultId: string, query: string, opts: { full?: boolean; limit?: number; offset?: number; signal?: AbortSignal } = {}): Promise<SearchResponse> {
		const params = new URLSearchParams({ q: query });
		if (opts.full) params.set('full', '1');
		if (opts.limit) params.set('limit', String(opts.limit));
		if (opts.offset) params.set('offset', String(opts.offset));
		const res = await json<SearchResponse>(`/api/vaults/${vaultId}/search?${params.toString()}`, { signal: opts.signal });
		const results = res.results ?? [];
		const offset = res.offset ?? opts.offset ?? 0;
		const total = res.total ?? results.length;
		const nextOffset = res.nextOffset ?? (offset + results.length < total ? offset + results.length : null);
		return {
			query: res.query ?? query.trim(),
			mode: res.mode ?? (opts.full ? 'full' : 'title'),
			limit: res.limit ?? opts.limit ?? (opts.full ? 50 : 25),
			offset,
			total,
			limited: res.limited ?? nextOffset !== null,
			hasMore: res.hasMore ?? nextOffset !== null,
			nextOffset,
			results
		};
	},

	async tags(vaultId: string): Promise<{ tag: string; count: number }[]> {
		const res = await json<{ tags: { tag: string; count: number }[] }>(`/api/vaults/${vaultId}/tags`);
		return res.tags ?? [];
	},

	async notesByTag(vaultId: string, tag: string): Promise<{ path: string; title: string }[]> {
		const res = await json<{ notes: { path: string; title: string }[] }>(
			`/api/vaults/${vaultId}/tags?tag=${encodeURIComponent(tag)}`
		);
		return res.notes ?? [];
	},

	async history(vaultId: string, path: string): Promise<{ sha: string; shortSha: string; date: string; author: string; message: string }[]> {
		const res = await json<{ log: { sha: string; shortSha: string; date: string; author: string; message: string }[] }>(
			`/api/vaults/${vaultId}/history?path=${encodeURIComponent(path)}`
		);
		return res.log ?? [];
	},

	async historyAt(vaultId: string, path: string, sha: string): Promise<{ content: string }> {
		return json<{ content: string }>(
			`/api/vaults/${vaultId}/history?path=${encodeURIComponent(path)}&sha=${encodeURIComponent(sha)}`
		);
	},

	async graph(vaultId: string): Promise<{
		nodes: { path: string; title: string; degree: number }[];
		edges: { from: string; to: string }[];
	}> {
		return json(`/api/vaults/${vaultId}/graph`);
	},

	async openToday(vaultId: string): Promise<{ path: string; created: boolean; sha?: string | null }> {
		const res = await json<{ path: string; created: boolean; sha: string | null }>(
			`/api/vaults/${vaultId}/daily`,
			{ method: 'POST' }
		);
		if (res.created) {
			emit('note:created', { vaultId, path: res.path });
			emit('tree:invalidate', { vaultId });
		}
		return res;
	},

	async publish(vaultId: string): Promise<{
		outDir: string;
		totalNotes: number;
		publicNotes: number;
		imagesCopied: number;
		attachmentsCopied: number;
		skipped: { path: string; reason: string }[];
	}> {
		return json(`/api/vaults/${vaultId}/publish`, { method: 'POST' });
	},

	async toggleExcluded(vaultId: string, folder: string): Promise<{ excludedFolders: string[] }> {
		const res = await json<{ excludedFolders: string[] }>(`/api/vaults/${vaultId}/exclude`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ folder })
		});
		emit('tree:invalidate', { vaultId });
		return res;
	},

	async syncStatus(vaultId: string): Promise<GitSyncStatus> {
		return json(`/api/vaults/${vaultId}/sync`);
	},

	async setSyncRemote(vaultId: string, remoteUrl: string): Promise<GitSyncResult> {
		return json(`/api/vaults/${vaultId}/sync`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action: 'set-remote', remoteUrl })
		});
	},

	async checkSync(vaultId: string): Promise<GitSyncResult> {
		return json(`/api/vaults/${vaultId}/sync`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action: 'check' })
		});
	},

	async fetchSync(vaultId: string): Promise<GitSyncResult> {
		return json(`/api/vaults/${vaultId}/sync`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action: 'fetch' })
		});
	},

	async pullSync(vaultId: string): Promise<GitSyncResult> {
		return json(`/api/vaults/${vaultId}/sync`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action: 'pull' })
		});
	},

	async pushSync(vaultId: string): Promise<GitSyncResult> {
		return json(`/api/vaults/${vaultId}/sync`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action: 'push' })
		});
	},

	async syncNow(vaultId: string): Promise<GitSyncResult> {
		return json(`/api/vaults/${vaultId}/sync`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action: 'sync' })
		});
	},

	async plugins(vaultId: string): Promise<PluginListResponse> {
		return json(`/api/vaults/${vaultId}/plugins`);
	},

	async pluginCatalog(): Promise<PluginCatalogResponse> {
		return json('/api/plugins/catalog');
	},

	async installPlugin(vaultId: string, manifestUrl: string, replace = false): Promise<PluginInstallResponse> {
		const res = await json<PluginInstallResponse>(`/api/vaults/${vaultId}/plugins`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ manifestUrl, replace })
		});
		emit('plugins:reload', { vaultId });
		return res;
	},

	async installCatalogPlugin(vaultId: string, catalogId: string, replace = false): Promise<PluginInstallResponse> {
		const res = await json<PluginInstallResponse>(`/api/vaults/${vaultId}/plugins`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ catalogId, replace })
		});
		emit('plugins:reload', { vaultId });
		return res;
	}
};
