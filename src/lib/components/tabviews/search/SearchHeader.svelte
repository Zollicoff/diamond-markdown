<script lang="ts">
	import type { SearchFolderFacet, SearchGroupMode } from '$lib/search/view';
	import type { SavedSearch, SavedSearchMode, SearchResponse } from '$lib/types';
	import SearchDisplayControls from './SearchDisplayControls.svelte';
	import SearchInputControls from './SearchInputControls.svelte';
	import SavedSearchBar from './SavedSearchBar.svelte';

	interface Props {
		q: string;
		fullText: boolean;
		groupMode: SearchGroupMode;
		folderFacets: SearchFolderFacet[];
		savedName: string;
		savedSearches: SavedSearch[];
		currentMode: SavedSearchMode;
		canSaveSearch: boolean;
		saveSearchTitle: string;
		savingSearch: boolean;
		savedErr: string | null;
		savedLoading: boolean;
		deletingSearchId: string | null;
		loading: boolean;
		err: string | null;
		resultsCount: number;
		meta: SearchResponse | null;
		onQueryInput: (value: string) => void;
		onSavedNameInput: (value: string) => void;
		onToggleFullText: () => void;
		onSetGroupMode: (mode: SearchGroupMode) => void;
		onNarrowToFolder: (query: string) => void;
		onSaveCurrentSearch: () => void | Promise<void>;
		onRunSavedSearch: (search: SavedSearch) => void;
		onDeleteSavedSearch: (search: SavedSearch) => void | Promise<void>;
	}

	let {
		q,
		fullText,
		groupMode,
		folderFacets,
		savedName,
		savedSearches,
		currentMode,
		canSaveSearch,
		saveSearchTitle,
		savingSearch,
		savedErr,
		savedLoading,
		deletingSearchId,
		loading,
		err,
		resultsCount,
		meta,
		onQueryInput,
		onSavedNameInput,
		onToggleFullText,
		onSetGroupMode,
		onNarrowToFolder,
		onSaveCurrentSearch,
		onRunSavedSearch,
		onDeleteSavedSearch
	}: Props = $props();

</script>

<header class="search-header">
	<SearchInputControls
		{q}
		{fullText}
		{canSaveSearch}
		{saveSearchTitle}
		{savingSearch}
		{onQueryInput}
		{onToggleFullText}
		{onSaveCurrentSearch}
	/>
	<SearchDisplayControls
		{fullText}
		{groupMode}
		{folderFacets}
		{onSetGroupMode}
		{onNarrowToFolder}
	/>
	<SavedSearchBar
		{q}
		{savedName}
		{savedSearches}
		{currentMode}
		{savingSearch}
		{savedErr}
		{savedLoading}
		{deletingSearchId}
		{onSavedNameInput}
		{onRunSavedSearch}
		{onDeleteSavedSearch}
	/>
	<p class="hint">
		{#if loading}Searching...
		{:else if err}<span class="err">Error: {err}</span>
		{:else if !q.trim()}Type to search.
		{:else if resultsCount === 0}No matches.
		{:else if meta && meta.total > resultsCount}Showing {resultsCount} of {meta.total} matches.
		{:else}{resultsCount} result{resultsCount === 1 ? '' : 's'}
		{/if}
	</p>
</header>

<style>
	.search-header {
		padding: 18px 22px 10px;
		border-bottom: 1px solid var(--border);
	}
	.hint {
		margin: 8px 2px 0;
		color: var(--fg-dim);
		font-size: 0.8rem;
	}
	.hint .err { color: var(--danger, #f87171); }
</style>
