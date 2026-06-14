<script lang="ts">
	import { onMount } from 'svelte';
	import {
		isActiveSavedSearch,
		savedSearchButtonLabel,
		savedSearchModeLabel
	} from '$lib/search/saved';
	import type { SearchFolderFacet, SearchGroupMode } from '$lib/search/view';
	import type { SavedSearch, SavedSearchMode, SearchResponse } from '$lib/types';

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

	let inputEl: HTMLInputElement | null = null;

	onMount(() => {
		setTimeout(() => inputEl?.focus(), 0);
	});
</script>

<header class="search-header">
	<div class="input-row">
		<svg class="icon" viewBox="0 0 16 16" aria-hidden="true">
			<circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.4" />
			<line x1="10.4" y1="10.4" x2="13.5" y2="13.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
		</svg>
		<input
			bind:this={inputEl}
			type="text"
			placeholder={fullText ? 'Search notes and contents...' : 'Search note titles...'}
			title={fullText ? 'Supports quoted phrases, OR, /regex/, tag:, path:, file:, content:, and -exclusions.' : 'Search note titles and aliases.'}
			value={q}
			oninput={(e) => onQueryInput((e.target as HTMLInputElement).value)}
			autocomplete="off"
			spellcheck="false"
		/>
		<button
			class="mode-toggle"
			class:active={fullText}
			onclick={onToggleFullText}
			title={fullText ? 'Notes and contents - click to switch to titles' : 'Titles - click to switch to notes and contents'}
		>
			{fullText ? 'Notes' : 'Title'}
		</button>
		<button
			type="button"
			class="save-search"
			disabled={!canSaveSearch}
			onclick={onSaveCurrentSearch}
			aria-label="Save current search"
			title={saveSearchTitle}
		>
			{savingSearch ? 'Saving' : 'Save'}
		</button>
	</div>
	<div class="search-options" aria-label="Search display options">
		<div class="segmented" role="group" aria-label="Group search results">
			<span class="seg-label">Group</span>
			<button
				type="button"
				class:active={groupMode === 'none'}
				aria-pressed={groupMode === 'none'}
				onclick={() => onSetGroupMode('none')}
			>
				Off
			</button>
			<button
				type="button"
				class:active={groupMode === 'folder'}
				aria-pressed={groupMode === 'folder'}
				onclick={() => onSetGroupMode('folder')}
			>
				Folder
			</button>
		</div>
	</div>
	{#if fullText && folderFacets.length > 1}
		<div class="folder-facets" aria-label="Search result folders">
			<span class="facet-label">Folders</span>
			{#each folderFacets as facet (facet.label)}
				<button
					type="button"
					class="folder-facet"
					onclick={() => onNarrowToFolder(facet.query)}
					aria-label={`Narrow search to ${facet.label}`}
					title={`Narrow to ${facet.label}`}
				>
					<span class="facet-name">{facet.label}</span>
					<span class="facet-count">{facet.count}</span>
				</button>
			{/each}
		</div>
	{/if}
	<div class="saved-search-control">
		<input
			type="text"
			aria-label="Saved search name"
			placeholder="Saved search name"
			value={savedName}
			oninput={(e) => onSavedNameInput((e.target as HTMLInputElement).value)}
			disabled={!q.trim() || savingSearch}
		/>
	</div>
	<div class="saved-searches" aria-label="Saved searches">
		{#if savedErr}
			<p class="saved-message saved-error">Saved search error: {savedErr}</p>
		{:else if savedLoading}
			<p class="saved-message">Loading saved searches...</p>
		{:else if savedSearches.length > 0}
			<div class="saved-list">
				{#each savedSearches as saved (saved.id)}
					<div class="saved-chip" class:active={isActiveSavedSearch(saved, q, currentMode)}>
						<button
							type="button"
							class="saved-run"
							onclick={() => onRunSavedSearch(saved)}
							aria-label={`Run saved search ${savedSearchButtonLabel(saved)}`}
							title={saved.query}
						>
							<span class="saved-mode">{savedSearchModeLabel(saved.mode)}</span>
							<span class="saved-query">{saved.name}</span>
						</button>
						<button
							type="button"
							class="saved-remove"
							disabled={deletingSearchId === saved.id}
							onclick={() => onDeleteSavedSearch(saved)}
							aria-label={`Delete saved search ${saved.name}`}
							title="Delete saved search"
						>
							{deletingSearchId === saved.id ? '...' : 'Del'}
						</button>
					</div>
				{/each}
			</div>
		{/if}
	</div>
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
	.input-row {
		display: flex;
		align-items: center;
		gap: 8px;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 8px 12px;
	}
	.icon {
		width: 16px;
		height: 16px;
		color: var(--fg-dim);
		flex: 0 0 16px;
	}
	.input-row input {
		flex: 1;
		background: transparent;
		border: 0;
		outline: none;
		color: var(--fg);
		font: inherit;
		font-size: 0.95rem;
	}
	.mode-toggle {
		background: transparent;
		border: 1px solid var(--border);
		color: var(--fg-muted);
		padding: 4px 10px;
		border-radius: 4px;
		font-size: 0.78rem;
		cursor: pointer;
	}
	.mode-toggle:hover { color: var(--fg); }
	.mode-toggle.active {
		color: var(--accent);
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 12%, transparent);
	}
	.save-search {
		background: var(--accent);
		border: 1px solid var(--accent);
		color: white;
		padding: 4px 10px;
		border-radius: 4px;
		font-size: 0.78rem;
		cursor: pointer;
	}
	.save-search:disabled {
		background: transparent;
		color: var(--fg-dim);
		border-color: var(--border);
		cursor: default;
	}
	.search-options {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 8px;
	}
	.segmented {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: color-mix(in srgb, var(--bg-elev), transparent 28%);
		padding: 2px;
	}
	.seg-label {
		color: var(--fg-dim);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0;
		padding: 0 6px 0 5px;
	}
	.segmented button {
		min-width: 48px;
		border: 0;
		border-radius: 4px;
		background: transparent;
		color: var(--fg-muted);
		font: inherit;
		font-size: 0.76rem;
		padding: 4px 8px;
		cursor: pointer;
	}
	.segmented button:hover {
		color: var(--fg);
	}
	.segmented button.active {
		background: color-mix(in srgb, var(--accent) 14%, transparent);
		color: var(--accent);
	}
	.folder-facets {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 8px;
		min-width: 0;
		overflow-x: auto;
		padding-bottom: 1px;
	}
	.facet-label {
		color: var(--fg-dim);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0;
		flex: 0 0 auto;
	}
	.folder-facet {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		max-width: 220px;
		border: 1px solid var(--border);
		border-radius: 5px;
		background: color-mix(in srgb, var(--bg-elev), transparent 28%);
		color: var(--fg-muted);
		font: inherit;
		font-size: 0.74rem;
		padding: 3px 7px;
		cursor: pointer;
		flex: 0 0 auto;
	}
	.folder-facet:hover {
		border-color: var(--accent);
		color: var(--fg);
	}
	.facet-name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.facet-count {
		color: var(--fg-dim);
		font-family: var(--mono);
		font-size: 0.68rem;
		flex: 0 0 auto;
	}
	.saved-search-control {
		margin-top: 8px;
	}
	.saved-search-control input {
		width: 100%;
		box-sizing: border-box;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 4px;
		color: var(--fg);
		font: inherit;
		font-size: 0.8rem;
		padding: 6px 8px;
	}
	.saved-search-control input:disabled {
		opacity: 0.55;
	}
	.saved-searches {
		margin-top: 8px;
		min-height: 26px;
	}
	.saved-list {
		display: flex;
		align-items: center;
		gap: 6px;
		overflow-x: auto;
		padding-bottom: 2px;
	}
	.saved-message {
		margin: 0;
		color: var(--fg-dim);
		font-size: 0.76rem;
	}
	.saved-error {
		color: var(--danger, #f87171);
	}
	.saved-chip {
		display: inline-flex;
		align-items: center;
		max-width: 260px;
		border: 1px solid var(--border);
		border-radius: 5px;
		background: color-mix(in srgb, var(--bg-elev), transparent 20%);
		overflow: hidden;
		flex: 0 0 auto;
	}
	.saved-chip.active {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 10%, transparent);
	}
	.saved-run,
	.saved-remove {
		border: 0;
		background: transparent;
		color: var(--fg-muted);
		font: inherit;
		cursor: pointer;
	}
	.saved-run {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		padding: 4px 7px;
	}
	.saved-run:hover,
	.saved-remove:hover {
		color: var(--fg);
	}
	.saved-mode {
		color: var(--accent);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0;
		flex: 0 0 auto;
	}
	.saved-query {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.78rem;
	}
	.saved-remove {
		width: 34px;
		height: 24px;
		border-left: 1px solid var(--border);
		padding: 0;
		flex: 0 0 34px;
		font-size: 0.68rem;
	}
	.saved-remove:disabled {
		cursor: default;
		opacity: 0.55;
	}
	.hint {
		margin: 8px 2px 0;
		color: var(--fg-dim);
		font-size: 0.8rem;
	}
	.hint .err { color: var(--danger, #f87171); }
</style>
