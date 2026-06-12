<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { api } from '$lib/vault-api';
	import { searchResultRowStyle, visibleSearchWindow } from '$lib/search/view';
	import { openNote } from '$lib/workspace/actions';
	import { openModeForPointer } from '$lib/workspace/open-mode';
	import type { SearchHit, SearchResponse } from '$lib/types';

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
	let scrollTop = $state(0);
	let viewportHeight = $state(0);
	let meta = $state<SearchResponse | null>(null);
	let loading = $state(false);
	let err = $state<string | null>(null);
	let controller: AbortController | null = null;
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let resultWindow = $derived(visibleSearchWindow(results, scrollTop, viewportHeight));

	onMount(() => {
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

	async function runSearch(query: string): Promise<void> {
		const trimmed = query.trim();
		// Tell the parent so the tab title updates.
		onQueryChange?.(trimmed);
		if (!trimmed) {
			results = [];
			meta = null;
			resetResultWindow();
			loading = false;
			err = null;
			return;
		}
		controller?.abort();
		controller = new AbortController();
		loading = true;
		err = null;
		try {
			const response = await api.searchWithMeta(vaultId, trimmed, {
				full: fullText,
				limit: fullText ? 200 : 100,
				signal: controller.signal
			});
			results = response.results;
			meta = response;
			resetResultWindow();
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
			results = [];
			meta = null;
			resetResultWindow();
		} finally {
			loading = false;
		}
	}

	function onInput(e: Event): void {
		q = (e.target as HTMLInputElement).value;
		runSearchDebounced();
	}

	function onResultsScroll(): void {
		scrollTop = resultsEl?.scrollTop ?? 0;
	}

	function resetResultWindow(): void {
		scrollTop = 0;
		if (resultsEl) resultsEl.scrollTop = 0;
	}

	function toggleFullText(): void {
		fullText = !fullText;
		void runSearch(q);
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

	// If the bound query prop changes externally (e.g., the search command
	// is invoked again with a different seed query), reflect it. untrack
	// avoids loops with our own writes.
	$effect(() => {
		const incoming = query;
		untrack(() => {
			if (incoming !== q) {
				q = incoming;
				void runSearch(q);
			}
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
				title={fullText ? 'Supports quoted phrases, tag:, path:, file:, content:, and -exclusions.' : 'Search note titles and aliases.'}
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
		</div>
		<p class="hint">
			{#if loading}Searching…
			{:else if err}<span class="err">Error: {err}</span>
			{:else if !q.trim()}Type to search.
			{:else if results.length === 0}No matches.
			{:else if meta?.limited}Showing {results.length} of {meta.total} matches.
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
