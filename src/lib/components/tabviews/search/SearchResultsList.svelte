<script lang="ts">
	import { onMount } from 'svelte';
	import {
		searchResultRowStyle,
		type SearchDisplayWindow,
		type SearchResultDisplayRow
	} from '$lib/search/view';
	import type { SearchResponse } from '$lib/types';

	interface Props {
		resultWindow: SearchDisplayWindow;
		meta: SearchResponse | null;
		resultsCount: number;
		loading: boolean;
		loadingMore: boolean;
		resetKey: number;
		onScrollTopChange: (value: number) => void;
		onViewportHeightChange: (value: number) => void;
		onLoadMore: () => void;
		onOpenResultRow: (row: SearchResultDisplayRow, event: MouseEvent) => void;
		onResultRowKey: (event: KeyboardEvent, row: SearchResultDisplayRow) => void;
	}

	let {
		resultWindow,
		meta,
		resultsCount,
		loading,
		loadingMore,
		resetKey,
		onScrollTopChange,
		onViewportHeightChange,
		onLoadMore,
		onOpenResultRow,
		onResultRowKey
	}: Props = $props();

	let resultsEl: HTMLDivElement | null = null;

	function measure(): void {
		onViewportHeightChange(resultsEl?.clientHeight ?? 0);
	}

	function onResultsScroll(): void {
		onScrollTopChange(resultsEl?.scrollTop ?? 0);
	}

	onMount(() => {
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

	$effect(() => {
		const key = resetKey;
		void key;
		if (resultsEl) resultsEl.scrollTop = 0;
	});
</script>

<div class="results" bind:this={resultsEl} onscroll={onResultsScroll}>
	<div class="result-spacer" style={`height: ${resultWindow.totalHeight}px;`}>
		{#each resultWindow.visibleRows as item (item.row.key)}
			{#if item.row.kind === 'group'}
				<div class="result-group" style={searchResultRowStyle(item.row)}>
					<span class="group-title">{item.row.label}</span>
					<span class="group-count">{item.row.count}</span>
				</div>
			{:else}
				<button
					type="button"
					class="result"
					style={searchResultRowStyle(item.row)}
					onclick={(e) => onOpenResultRow(item.row, e)}
					onkeydown={(e) => onResultRowKey(e, item.row)}
				>
					<div class="title">{item.row.hit.title || item.row.hit.path}</div>
					<div class="path">{item.row.hit.path}</div>
					{#if item.row.hit.snippet}
						<div class="snippet">{item.row.hit.snippet}</div>
					{/if}
				</button>
			{/if}
		{/each}
	</div>
	{#if meta?.hasMore}
		<div class="results-footer">
			<button type="button" class="load-more" disabled={loading || loadingMore} onclick={onLoadMore}>
				{loadingMore ? 'Loading...' : `Load more (${resultsCount}/${meta.total})`}
			</button>
		</div>
	{/if}
</div>

<style>
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
	.result-group {
		position: absolute;
		left: 0;
		right: 0;
		height: var(--search-result-row-height);
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 12px;
		box-sizing: border-box;
		color: var(--fg-dim);
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0;
		pointer-events: none;
	}
	.group-title {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.group-count {
		flex: 0 0 auto;
		color: var(--fg-muted);
		font-family: var(--mono);
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
