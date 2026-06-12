<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { emit } from '$lib/events';
	import { api } from '$lib/vault-api';
	import {
		isActiveSavedSearch,
		savedSearchButtonLabel,
		savedSearchModeLabel,
		savedSearchName,
		searchModeFromFullText
	} from '$lib/search/saved';
	import { searchResultRowStyle, visibleSearchWindow } from '$lib/search/view';
	import { openNote } from '$lib/workspace/actions';
	import { openModeForPointer } from '$lib/workspace/open-mode';
	import type { SavedSearch, SavedSearchMode, SearchHit, SearchResponse } from '$lib/types';

	interface Props {
		vaultId: string;
		query: string;
		onQueryChange?: (q: string) => void;
	}

	let { vaultId, query, onQueryChange }: Props = $props();

	let inputEl: HTMLInputElement | null = $state(null);
	let resultsEl: HTMLDivElement | null = $state(null);
	// svelte-ignore state_referenced_locally
	let q = $state(query);
	let fullText = $state(false);
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
	let resultWindow = $derived(visibleSearchWindow(results, scrollTop, viewportHeight));
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

	onMount(() => {
		savedName = savedSearchName(q);
		setTimeout(() => inputEl?.focus(), 0);
		if (q.trim()) void runSearch(q);
		const measure = () => {
			viewportHeight = resultsEl?.clientHeight ?? 0;
		};
		const observer = typeof ResizeObserver === 'undefined'
			? null
			: new ResizeObserver(measure);
		if (resultsEl) observer?.observe(resultsEl);
		window.addEventListener('resize', measure);
		setTimeout(measure, 0);
		return () => {
			observer?.disconnect();
			window.removeEventListener('resize', measure);
		};
	});

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

	function onInput(e: Event): void {
		q = (e.target as HTMLInputElement).value;
		if (!savedNameTouched || !savedName.trim() || savedName === 'Saved search') {
			savedName = savedSearchName(q);
		}
		runSearchDebounced();
	}

	function onResultsScroll(): void {
		scrollTop = resultsEl?.scrollTop ?? 0;
	}

	function resetResultWindow(): void {
		scrollTop = 0;
		if (resultsEl) resultsEl.scrollTop = 0;
	}

	function loadMore(): void {
		if (loading || loadingMore || !meta?.nextOffset) return;
		void runSearch(q, true);
	}

	function toggleFullText(): void {
		fullText = !fullText;
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
		savedName = search.name;
		savedNameTouched = false;
		void runSearch(q);
	}

	async function deleteSavedSearch(search: SavedSearch): Promise<void> {
		if (deletingSearchId) return;
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

	function isAbortError(error: unknown): boolean {
		return error instanceof DOMException && error.name === 'AbortError';
	}

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
		const id = vaultId;
		untrack(() => {
			void id;
			void loadSavedSearches();
		});
	});
</script>

<div class="search-view">
	<header class="search-header">
		<div class="input-row">
			<svg class="icon" viewBox="0 0 16 16" aria-hidden="true">
				<circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.4" />
				<line x1="10.4" y1="10.4" x2="13.5" y2="13.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
			</svg>
			<input
				bind:this={inputEl}
				type="text"
				placeholder={fullText ? 'Search notes and contents…' : 'Search note titles…'}
				title={fullText ? 'Supports quoted phrases, OR, /regex/, tag:, path:, file:, content:, and -exclusions.' : 'Search note titles and aliases.'}
				value={q}
				oninput={onInput}
				autocomplete="off"
				spellcheck="false"
			/>
			<button
				class="mode-toggle"
				class:active={fullText}
				onclick={toggleFullText}
				title={fullText ? 'Notes and contents — click to switch to titles' : 'Titles — click to switch to notes and contents'}
			>
				{fullText ? 'Notes' : 'Title'}
			</button>
			<button
				type="button"
				class="save-search"
					disabled={!canSaveSearch}
					onclick={saveCurrentSearch}
					aria-label="Save current search"
					title={saveSearchTitle}
				>
				{savingSearch ? 'Saving' : 'Save'}
			</button>
		</div>
		<div class="saved-search-control">
			<input
				type="text"
				aria-label="Saved search name"
				placeholder="Saved search name"
				value={savedName}
				oninput={(e) => {
					savedName = (e.target as HTMLInputElement).value;
					savedNameTouched = true;
				}}
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
								onclick={() => runSavedSearch(saved)}
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
								onclick={() => deleteSavedSearch(saved)}
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
			{#if loading}Searching…
			{:else if err}<span class="err">Error: {err}</span>
			{:else if !q.trim()}Type to search.
			{:else if results.length === 0}No matches.
			{:else if meta && meta.total > results.length}Showing {results.length} of {meta.total} matches.
			{:else}{results.length} result{results.length === 1 ? '' : 's'}
			{/if}
		</p>
	</header>

	<div class="results" bind:this={resultsEl} onscroll={onResultsScroll}>
		<div class="result-spacer" style={`height: ${resultWindow.totalHeight}px;`}>
			{#each resultWindow.visibleResults as row (row.hit.path)}
				<button
					type="button"
					class="result"
					style={searchResultRowStyle(row)}
					onclick={(e) => open(row.hit, e)}
					onkeydown={(e) => onResultKey(e, row.hit)}
				>
					<div class="title">{row.hit.title || row.hit.path}</div>
					<div class="path">{row.hit.path}</div>
					{#if row.hit.snippet}
						<div class="snippet">{row.hit.snippet}</div>
					{/if}
				</button>
			{/each}
		</div>
		{#if meta?.hasMore}
			<div class="results-footer">
				<button type="button" class="load-more" disabled={loading || loadingMore} onclick={loadMore}>
					{loadingMore ? 'Loading…' : `Load more (${results.length}/${meta.total})`}
				</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.search-view {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}
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

	.results {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 6px 12px 18px;
	}
	.result-spacer {
		position: relative;
		min-height: 100%;
	}
	.results-footer {
		display: flex;
		justify-content: center;
		padding: 8px 0 14px;
	}
	.load-more {
		border: 1px solid var(--border);
		border-radius: 4px;
		background: var(--bg-elev);
		color: var(--fg-muted);
		font: inherit;
		font-size: 0.8rem;
		padding: 6px 12px;
		cursor: pointer;
	}
	.load-more:hover:not(:disabled) {
		color: var(--fg);
		border-color: var(--accent);
	}
	.load-more:disabled {
		cursor: default;
		opacity: 0.6;
	}
	.result {
		display: block;
		position: absolute;
		left: 0;
		right: 0;
		height: calc(var(--search-result-row-height) - 4px);
		text-align: left;
		background: transparent;
		border: 0;
		border-radius: 6px;
		padding: 10px 12px;
		overflow: hidden;
		cursor: pointer;
		color: inherit;
		font: inherit;
	}
	.result:hover { background: var(--bg-hover); }
	.result:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.title {
		color: var(--fg);
		font-weight: 600;
		font-size: 0.95rem;
		font-family: 'Bricolage Grotesque', var(--sans);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.path {
		color: var(--fg-dim);
		font-size: 0.78rem;
		margin-top: 2px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.snippet {
		color: var(--fg-muted);
		font-size: 0.82rem;
		margin-top: 6px;
		line-height: 1.45;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		white-space: normal;
		word-break: break-word;
	}
</style>
