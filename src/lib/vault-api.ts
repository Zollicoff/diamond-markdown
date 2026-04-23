/**
 * Typed client wrappers around /api/vaults/*. Every fetch call in the
 * client goes through here — UI components never construct URLs or
 * parse responses directly.
 *
 * Every mutation emits a bus event on success so subscribers react
 * without explicit wiring.
 */

import type { NoteDoc, SearchHit, TreeNode } from './types';
import { emit } from './events';

async function json<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
	const res = await fetch(input, init);
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`HTTP ${res.status}${body ? ': ' + body.slice(0, 200) : ''}`);
	}
	return res.json() as Promise<T>;
}

export const api = {
	async tree(vaultId: string): Promise<{ tree: TreeNode[] }> {
		return json(`/api/vaults/${vaultId}/tree`);
	},

	async note(vaultId: string, path: string): Promise<NoteDoc> {
		return json(`/api/vaults/${vaultId}/note?path=${encodeURIComponent(path)}`);
	},

	async saveNote(vaultId: string, path: string, content: string): Promise<{ created: boolean; sha: string | null }> {
		const res = await json<{ created: boolean; sha: string | null }>(`/api/vaults/${vaultId}/note`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ path, content })
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

	async search(vaultId: string, query: string, opts: { full?: boolean } = {}): Promise<SearchHit[]> {
		const url = `/api/vaults/${vaultId}/search?q=${encodeURIComponent(query)}${opts.full ? '&full=1' : ''}`;
		const res = await json<{ results: SearchHit[] }>(url);
		return res.results ?? [];
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
	}
};
