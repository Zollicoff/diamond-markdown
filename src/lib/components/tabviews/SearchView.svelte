<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { api } from '$lib/vault-api';
	import { openNote } from '$lib/workspace/actions';
	import type { SearchHit } from '$lib/types';

	interface Props {
		vaultId: string;
		query: string;
		onQueryChange?: (q: string) => void;
	}

	let { vaultId, query, onQueryChange }: Props = $props();

	let inputEl: HTMLInputElement | null = $state(null);
	// svelte-ignore state_referenced_locally
	let q = $state(query);
	let fullText = $state(false);
	let results = $state<SearchHit[]>([]);
	let loading = $state(false);
	let err = $state<string | null>(null);
	let controller: AbortController | null = null;
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	onMount(() => {
		setTimeout(() => inputEl?.focus(), 0);
		if (q.trim()) void runSearch(q);
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
			loading = false;
			err = null;
			return;
		}
		controller?.abort();
		controller = new AbortController();
		loading = true;
		err = null;
		try {
			const hits = await api.search(vaultId, trimmed, { full: fullText });
			results = hits;
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
			results = [];
		} finally {
			loading = false;
		}
	}

	function onInput(e: Event): void {
		q = (e.target as HTMLInputElement).value;
		runSearchDebounced();
	}

	function toggleFullText(): void {
		fullText = !fullText;
		void runSearch(q);
	}

	function open(hit: SearchHit, evt: MouseEvent | KeyboardEvent): void {
		const mod = ('metaKey' in evt && (evt.metaKey || evt.ctrlKey)) || ('button' in evt && evt.button === 1);
		const alt = 'altKey' in evt && evt.altKey;
		const mode = alt ? 'new-pane' : mod ? 'new-tab' : 'replace';
		openNote(vaultId, hit.path, hit.title, mode);
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
				placeholder={fullText ? 'Search in note contents…' : 'Search note titles…'}
				value={q}
				oninput={onInput}
				autocomplete="off"
				spellcheck="false"
			/>
			<button
				class="mode-toggle"
				class:active={fullText}
				onclick={toggleFullText}
				title={fullText ? 'Full-text (body) — click to switch to titles' : 'Title — click to switch to full-text'}
			>
				{fullText ? 'Body' : 'Title'}
			</button>
		</div>
		<p class="hint">
			{#if loading}Searching…
			{:else if err}<span class="err">Error: {err}</span>
			{:else if !q.trim()}Type to search.
			{:else if results.length === 0}No matches.
			{:else}{results.length} result{results.length === 1 ? '' : 's'}
			{/if}
		</p>
	</header>

	<div class="results">
		{#each results as hit (hit.path)}
			<button
				type="button"
				class="result"
				onclick={(e) => open(hit, e)}
				onkeydown={(e) => onResultKey(e, hit)}
			>
				<div class="title">{hit.title || hit.path}</div>
				<div class="path">{hit.path}</div>
				{#if hit.snippet}
					<div class="snippet">{hit.snippet}</div>
				{/if}
			</button>
		{/each}
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
	.result {
		display: block;
		width: 100%;
		text-align: left;
		background: transparent;
		border: 0;
		border-radius: 6px;
		padding: 10px 12px;
		margin: 2px 0;
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
	}
	.path {
		color: var(--fg-dim);
		font-size: 0.78rem;
		margin-top: 2px;
	}
	.snippet {
		color: var(--fg-muted);
		font-size: 0.82rem;
		margin-top: 6px;
		line-height: 1.45;
		white-space: pre-wrap;
		word-break: break-word;
	}
</style>
