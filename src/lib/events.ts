/**
 * Typed event bus. One instance, whole client.
 *
 * The job here is decoupling — a pane saves a note, the save fires an
 * event, any interested listener (sibling panes with the same note
 * open, a search index, a graph view) subscribes. Nobody passes
 * explicit callbacks through six layers of components.
 *
 * SSR-safe (all state is in-memory; no DOM).
 */

export interface VaultEventMap {
	'note:saved':    { vaultId: string; path: string; sha: string | null; };
	'note:created':  { vaultId: string; path: string; };
	'note:deleted':  { vaultId: string; path: string; };
	'note:renamed':  { vaultId: string; from: string; to: string; linksUpdated: number; };
	'folder:renamed': { vaultId: string; from: string; to: string; };
	'folder:deleted': { vaultId: string; path: string; };
	'tree:invalidate': { vaultId: string; };
	'palette:open':  { vaultId: string; };
	'palette:template-pick': { vaultId: string; activeNoteTitle?: string; };
	'history:open':  { vaultId: string; path: string; };
	'template:insert': { vaultId: string; content: string; };
	'note:rename-request': { vaultId: string; path: string; };
}

type Handler<K extends keyof VaultEventMap> = (payload: VaultEventMap[K]) => void;

const listeners = new Map<keyof VaultEventMap, Set<Handler<keyof VaultEventMap>>>();

export function on<K extends keyof VaultEventMap>(name: K, handler: Handler<K>): () => void {
	const set = (listeners.get(name) ?? new Set()) as Set<Handler<K>>;
	set.add(handler);
	listeners.set(name, set as Set<Handler<keyof VaultEventMap>>);
	return () => set.delete(handler);
}

export function emit<K extends keyof VaultEventMap>(name: K, payload: VaultEventMap[K]): void {
	const set = listeners.get(name) as Set<Handler<K>> | undefined;
	if (!set) return;
	for (const h of set) {
		try { h(payload); } catch (e) { console.error(`event handler for ${String(name)} threw:`, e); }
	}
}
