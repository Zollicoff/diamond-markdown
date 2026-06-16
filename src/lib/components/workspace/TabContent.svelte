<script lang="ts">
	import type { Tab } from '$lib/workspace/types';
	import type { NoteDoc, NoteViewMode } from '$lib/types';
	import { setSearchFullText, setSearchQuery } from '$lib/workspace/actions';

	type ViewComponent = any;

	const loaders = {
		note: () => import('$lib/components/tabviews/NoteView.svelte').then((m) => m.default),
		canvas: () => import('$lib/components/tabviews/CanvasView.svelte').then((m) => m.default),
		graph: () => import('$lib/components/tabviews/GraphView.svelte').then((m) => m.default),
		tags: () => import('$lib/components/tabviews/TagsView.svelte').then((m) => m.default),
		search: () => import('$lib/components/tabviews/SearchView.svelte').then((m) => m.default),
		settings: () => import('$lib/components/tabviews/SettingsView.svelte').then((m) => m.default),
		shortcuts: () => import('$lib/components/tabviews/ShortcutsView.svelte').then((m) => m.default)
	} satisfies Record<Tab['kind'], () => Promise<ViewComponent>>;

	const cache = new Map<Tab['kind'], Promise<ViewComponent>>();

	function loadView(kind: Tab['kind']): Promise<ViewComponent> {
		let pending = cache.get(kind);
		if (!pending) {
			pending = loaders[kind]();
			cache.set(kind, pending);
		}
		return pending;
	}

	interface Props {
		vaultId: string;
		paneId: string;
		tab: Tab;
		mode: NoteViewMode;
		isFocused: boolean;
		onDocLoaded?: (doc: NoteDoc) => void;
		onModeChange?: (m: NoteViewMode) => void;
	}

	let { vaultId, paneId, tab, mode, isFocused, onDocLoaded, onModeChange }: Props = $props();

	let View = $state<ViewComponent | null>(null);
	let loadingKind = $state<Tab['kind'] | null>(null);
	let loadError = $state<string | null>(null);

	$effect(() => {
		const kind = tab.kind;
		let alive = true;
		loadingKind = kind;
		loadError = null;
		View = null;
		loadView(kind)
			.then((component) => {
				if (!alive || tab.kind !== kind) return;
				View = component;
			})
			.catch((e) => {
				if (!alive || tab.kind !== kind) return;
				loadError = e instanceof Error ? e.message : String(e);
			})
			.finally(() => {
				if (!alive || tab.kind !== kind) return;
				loadingKind = null;
			});
		return () => { alive = false; };
	});
</script>

{#if loadError}
	<div class="lazy-state error">Could not load {tab.title}: {loadError}</div>
{:else if !View}
	<div class="lazy-state">Loading {loadingKind ?? tab.kind}…</div>
{:else if tab.kind === 'note'}
	<View {vaultId} {paneId} tabId={tab.id} path={tab.path} {mode} {isFocused} {onDocLoaded} {onModeChange} />
{:else if tab.kind === 'canvas'}
	<View {vaultId} path={tab.path} />
{:else if tab.kind === 'graph'}
	<View {vaultId} />
{:else if tab.kind === 'tags'}
	<View {vaultId} filter={tab.filter} />
{:else if tab.kind === 'search'}
	<View
		{vaultId}
		query={tab.query}
		initialFullText={tab.fullText}
		onQueryChange={(q: string) => setSearchQuery(vaultId, tab.id, q)}
		onFullTextChange={(fullText: boolean) => setSearchFullText(vaultId, tab.id, fullText)}
	/>
{:else if tab.kind === 'settings'}
	<View />
{:else if tab.kind === 'shortcuts'}
	<View />
{/if}

<style>
	.lazy-state {
		display: grid;
		place-items: center;
		height: 100%;
		min-height: 0;
		color: var(--fg-dim);
		font-size: 0.86rem;
	}
	.lazy-state.error {
		color: var(--danger, #f87171);
		padding: 20px;
		text-align: center;
	}
</style>
