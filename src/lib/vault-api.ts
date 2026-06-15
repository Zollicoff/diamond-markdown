/**
 * Typed client wrappers around /api/vaults/*. Every fetch call in the
 * client goes through here — UI components never construct URLs or
 * parse responses directly.
 *
 * Every mutation emits a bus event on success so subscribers react
 * without explicit wiring.
 */

import type { Bookmark, BookmarkMutationResult, DeleteConfirmationPreference, EditorDisplayPreference, EditorLinkPreference, NewNoteLocation, NoteDoc, NoteLinkTarget, SavedSearch, SavedSearchMode, SavedSearchMutationResult, SearchHit, SearchResponse, TreeNode, VaultAppearancePreference, VaultImportAnalysis, VaultRef } from './types';
import { attachmentsApi } from './api/attachments';
import { canvasApi } from './api/canvas';
import { pluginsApi } from './api/plugins';
import { json } from './api/request';
import { syncApi } from './api/sync';
import { emit } from './events';

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

	async newNoteLocation(vaultId: string): Promise<NewNoteLocation> {
		return json(`/api/vaults/${vaultId}/new-note-location`);
	},

	async linkStyle(vaultId: string): Promise<EditorLinkPreference> {
		return json(`/api/vaults/${vaultId}/link-style`);
	},

	async editorPreferences(vaultId: string): Promise<EditorDisplayPreference> {
		return json(`/api/vaults/${vaultId}/editor-preferences`);
	},

	async deletePreferences(vaultId: string): Promise<DeleteConfirmationPreference> {
		return json(`/api/vaults/${vaultId}/delete-preferences`);
	},

	async appearancePreferences(vaultId: string): Promise<VaultAppearancePreference> {
		return json(`/api/vaults/${vaultId}/appearance-preferences`);
	},

	async linkTargets(vaultId: string): Promise<NoteLinkTarget[]> {
		const res = await json<{ targets: NoteLinkTarget[] }>(`/api/vaults/${vaultId}/link-targets`);
		return res.targets ?? [];
	},

	...canvasApi,

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

	...attachmentsApi,

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

	async savedSearches(vaultId: string): Promise<SavedSearch[]> {
		const res = await json<{ searches: SavedSearch[] }>(`/api/vaults/${vaultId}/searches`);
		return res.searches ?? [];
	},

	async saveSavedSearch(
		vaultId: string,
		input: { id?: string; name: string; query: string; mode: SavedSearchMode }
	): Promise<SavedSearchMutationResult> {
		const res = await json<SavedSearchMutationResult>(`/api/vaults/${vaultId}/searches`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(input)
		});
		emit('searches:changed', { vaultId });
		return res;
	},

	async deleteSavedSearch(vaultId: string, id: string): Promise<SavedSearchMutationResult> {
		const res = await json<SavedSearchMutationResult>(
			`/api/vaults/${vaultId}/searches?id=${encodeURIComponent(id)}`,
			{ method: 'DELETE' }
		);
		emit('searches:changed', { vaultId });
		return res;
	},

	async bookmarks(vaultId: string): Promise<Bookmark[]> {
		const res = await json<{ bookmarks: Bookmark[] }>(`/api/vaults/${vaultId}/bookmarks`);
		return res.bookmarks ?? [];
	},

	async saveBookmark(vaultId: string, input: { path: string; title: string }): Promise<BookmarkMutationResult> {
		const res = await json<BookmarkMutationResult>(`/api/vaults/${vaultId}/bookmarks`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(input)
		});
		emit('bookmarks:changed', { vaultId });
		return res;
	},

	async deleteBookmark(vaultId: string, path: string): Promise<BookmarkMutationResult> {
		const res = await json<BookmarkMutationResult>(
			`/api/vaults/${vaultId}/bookmarks?path=${encodeURIComponent(path)}`,
			{ method: 'DELETE' }
		);
		emit('bookmarks:changed', { vaultId });
		return res;
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

	...syncApi,
	...pluginsApi
};
