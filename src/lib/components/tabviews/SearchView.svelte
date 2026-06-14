<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { emit } from '$lib/events';
	import { api } from '$lib/vault-api';
	import {
		isActiveSavedSearch,
		savedSearchName,
		searchModeFromFullText
	} from '$lib/search/saved';
	import {
		buildSearchResultRows,
		searchFolderFacets,
		visibleSearchRows,
		type SearchResultDisplayRow,
		type SearchGroupMode
	} from '$lib/search/view';
	import { confirmDialog } from '$lib/dialogs';
	import { openNote } from '$lib/workspace/actions';
	import { openModeForPointer } from '$lib/workspace/open-mode';
	import type { SavedSearch, SavedSearchMode, SearchHit, SearchResponse } from '$lib/types';
	import SearchHeader from './search/SearchHeader.svelte';
	import SearchResultsList from './search/SearchResultsList.svelte';

	interface Props {
		vaultId: string;
		query: string;
		initialFullText?: boolean;
		onQueryChange?: (q: string) => void;
		onFullTextChange?: (fullText: boolean) => void;
	}

	let { vaultId, query, initialFullText = false, onQueryChange, onFullTextChange }: Props = $props();

	// svelte-ignore state_referenced_locally
	let q = $state(query);
	// svelte-ignore state_referenced_locally
	let fullText = $state(initialFullText);
	// svelte-ignore state_referenced_locally
	let appliedInitialFullText = $state(initialFullText);
	let groupMode = $state<SearchGroupMode>('none');
	let results = $state<SearchHit[]>([]);
	let savedSearches = $state<SavedSearch[]>([]);
	let savedName = $state('Saved search');
	let savedNameTouched = $state(false);
	let scrollTop = $state(0);
	let viewportHeight = $state(0);
	let meta = $state<SearchResponse | null>(null);
	let loading = $state(false);
	let loadingMore = $state(false);
	let savedLoading = $state(false);
	let savingSearch = $state(false);
	let deletingSearchId = $state<string | null>(null);
	let err = $state<string | null>(null);
	let savedErr = $state<string | null>(null);
	let controller: AbortController | null = null;
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let requestId = 0;
	let resultResetKey = $state(0);
	let resultRows = $derived(buildSearchResultRows(results, groupMode));
	let resultWindow = $derived(visibleSearchRows(resultRows, scrollTop, viewportHeight));
	let folderFacets = $derived(searchFolderFacets(results, q));
	let currentMode = $derived<SavedSearchMode>(searchModeFromFullText(fullText));
	let searchAlreadySaved = $derived(savedSearches.some((search) => isActiveSavedSearch(search, q, currentMode)));
	let canSaveSearch = $derived(
		q.trim().length > 0 && !savingSearch && !searchAlreadySaved
	);
	let saveSearchTitle = $derived(
		!q.trim()
			? 'Type a search to save it'
			: searchAlreadySaved
				? 'This search is already saved'
				: 'Save current search'
	);

	function runSearchDebounced(): void {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => void runSearch(q), 120);
	}

	async function runSearch(query: string, append = false): Promise<void> {
		const trimmed = query.trim();
		const id = ++requestId;
		// Tell the parent so the tab title updates.
		onQueryChange?.(trimmed);
		if (!trimmed) {
			results = [];
			meta = null;
			resetResultWindow();
			loading = false;
			loadingMore = false;
			err = null;
			return;
		}
		if (append && !meta?.nextOffset) return;
		controller?.abort();
		controller = new AbortController();
		if (append) loadingMore = true;
		else {
			loading = true;
			loadingMore = false;
		}
		err = null;
		try {
			const response = await api.searchWithMeta(vaultId, trimmed, {
				full: fullText,
				limit: fullText ? 200 : 100,
				offset: append ? meta?.nextOffset ?? results.length : 0,
				signal: controller.signal
			});
			if (id !== requestId) return;
			results = append ? [...results, ...response.results] : response.results;
			meta = response;
			if (!append) resetResultWindow();
		} catch (e) {
			if (id !== requestId || isAbortError(e)) return;
			err = e instanceof Error ? e.message : String(e);
			results = [];
			meta = null;
			resetResultWindow();
		} finally {
			if (id === requestId) {
				if (append) loadingMore = false;
				else loading = false;
			}
		}
	}

	function onQueryInput(value: string): void {
		q = value;
		if (!savedNameTouched || !savedName.trim() || savedName === 'Saved search') {
			savedName = savedSearchName(q);
		}
		runSearchDebounced();
	}

	function onSavedNameInput(value: string): void {
		savedName = value;
		savedNameTouched = true;
	}

	function resetResultWindow(): void {
		scrollTop = 0;
		resultResetKey += 1;
	}

	function loadMore(): void {
		if (loading || loadingMore || !meta?.nextOffset) return;
		void runSearch(q, true);
	}

	function toggleFullText(): void {
		fullText = !fullText;
		onFullTextChange?.(fullText);
		void runSearch(q);
	}

	function setGroupMode(mode: SearchGroupMode): void {
		if (groupMode === mode) return;
		groupMode = mode;
		resetResultWindow();
	}

	function narrowToFolder(query: string): void {
		if (!fullText || query === q) return;
		q = query;
		if (!savedNameTouched) savedName = savedSearchName(q);
		void runSearch(q);
	}

	async function loadSavedSearches(): Promise<void> {
		savedLoading = true;
		savedErr = null;
		try {
			savedSearches = await api.savedSearches(vaultId);
		} catch (e) {
			savedErr = e instanceof Error ? e.message : String(e);
		} finally {
			savedLoading = false;
		}
	}

	async function saveCurrentSearch(): Promise<void> {
		const query = q.trim();
		if (!query || savingSearch) return;
		savingSearch = true;
		savedErr = null;
		try {
			const response = await api.saveSavedSearch(vaultId, {
				name: savedName.trim() || savedSearchName(query),
				query,
				mode: currentMode
			});
			savedSearches = response.searches;
			if (response.search) savedName = response.search.name;
			savedNameTouched = false;
			emit('toast:show', { title: 'Saved search saved', tone: 'success' });
		} catch (e) {
			savedErr = e instanceof Error ? e.message : String(e);
		} finally {
			savingSearch = false;
		}
	}

	function runSavedSearch(search: SavedSearch): void {
		q = search.query;
		fullText = search.mode === 'full';
		onFullTextChange?.(fullText);
		savedName = search.name;
		savedNameTouched = false;
		void runSearch(q);
	}

	async function deleteSavedSearch(search: SavedSearch): Promise<void> {
		if (deletingSearchId) return;
		const confirmed = await confirmDialog({
			title: 'Delete saved search',
			message: `Delete saved search "${search.name}"?`,
			confirmLabel: 'Delete',
			tone: 'danger'
		});
		if (!confirmed) return;
		deletingSearchId = search.id;
		savedErr = null;
		try {
			const response = await api.deleteSavedSearch(vaultId, search.id);
			savedSearches = response.searches;
			emit('toast:show', { title: 'Saved search removed' });
		} catch (e) {
			savedErr = e instanceof Error ? e.message : String(e);
		} finally {
			deletingSearchId = null;
		}
	}

	function open(hit: SearchHit, evt: MouseEvent | KeyboardEvent): void {
		openNote(vaultId, hit.path, hit.title, openModeForPointer(evt));
	}

	function onResultKey(e: KeyboardEvent, hit: SearchHit): void {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			open(hit, e);
		}
	}

	function openResultRow(row: SearchResultDisplayRow, evt: MouseEvent): void {
		if (row.kind !== 'result') return;
		open(row.hit, evt);
	}

	function onResultRowKey(e: KeyboardEvent, row: SearchResultDisplayRow): void {
		if (row.kind !== 'result') return;
		onResultKey(e, row.hit);
	}

	function isAbortError(error: unknown): boolean {
		return error instanceof DOMException && error.name === 'AbortError';
	}

	onMount(() => {
		savedName = savedSearchName(q);
		if (q.trim()) void runSearch(q);
	});

	// If the bound query prop changes externally (e.g., the search command
	// is invoked again with a different seed query), reflect it. untrack
	// avoids loops with our own writes.
	$effect(() => {
		const incoming = query;
		untrack(() => {
			if (incoming !== q) {
				q = incoming;
				savedName = savedSearchName(incoming);
				savedNameTouched = false;
				void runSearch(q);
			}
		});
	});

	$effect(() => {
		const incoming = initialFullText;
		untrack(() => {
			if (incoming !== appliedInitialFullText) {
				fullText = incoming;
				appliedInitialFullText = incoming;
				void runSearch(q);
			}
		});
	});

	$effect(() => {
		const id = vaultId;
		untrack(() => {
			void id;
			void loadSavedSearches();
		});
	});
</script>

<div class="search-view">
	<SearchHeader
		{q}
		{fullText}
		{groupMode}
		{folderFacets}
		{savedName}
		{savedSearches}
		{currentMode}
		{canSaveSearch}
		{saveSearchTitle}
		{savingSearch}
		{savedErr}
		{savedLoading}
		{deletingSearchId}
		{loading}
		{err}
		resultsCount={results.length}
		{meta}
		onQueryInput={onQueryInput}
		onSavedNameInput={onSavedNameInput}
		onToggleFullText={toggleFullText}
		onSetGroupMode={setGroupMode}
		onNarrowToFolder={narrowToFolder}
		onSaveCurrentSearch={saveCurrentSearch}
		onRunSavedSearch={runSavedSearch}
		onDeleteSavedSearch={deleteSavedSearch}
	/>

	<SearchResultsList
		{resultWindow}
		{meta}
		resultsCount={results.length}
		{loading}
		{loadingMore}
		resetKey={resultResetKey}
		onScrollTopChange={(value) => (scrollTop = value)}
		onViewportHeightChange={(value) => (viewportHeight = value)}
		onLoadMore={loadMore}
		onOpenResultRow={openResultRow}
		onResultRowKey={onResultRowKey}
	/>
</div>

<style>
	.search-view {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}
</style>
