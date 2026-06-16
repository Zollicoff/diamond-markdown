<script lang="ts">
	import {
		isActiveSavedSearch,
		savedSearchButtonLabel,
		savedSearchModeLabel
	} from '$lib/search/saved';
	import type { SavedSearch, SavedSearchMode } from '$lib/types';

	interface Props {
		q: string;
		savedName: string;
		savedSearches: SavedSearch[];
		currentMode: SavedSearchMode;
		savingSearch: boolean;
		savedErr: string | null;
		savedLoading: boolean;
		deletingSearchId: string | null;
		onSavedNameInput: (value: string) => void;
		onRunSavedSearch: (search: SavedSearch) => void;
		onDeleteSavedSearch: (search: SavedSearch) => void | Promise<void>;
	}

	let {
		q,
		savedName,
		savedSearches,
		currentMode,
		savingSearch,
		savedErr,
		savedLoading,
		deletingSearchId,
		onSavedNameInput,
		onRunSavedSearch,
		onDeleteSavedSearch
	}: Props = $props();
</script>

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

<style>
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
</style>
