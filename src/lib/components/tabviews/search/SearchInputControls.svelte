<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		q: string;
		fullText: boolean;
		canSaveSearch: boolean;
		saveSearchTitle: string;
		savingSearch: boolean;
		onQueryInput: (value: string) => void;
		onToggleFullText: () => void;
		onSaveCurrentSearch: () => void | Promise<void>;
	}

	let {
		q,
		fullText,
		canSaveSearch,
		saveSearchTitle,
		savingSearch,
		onQueryInput,
		onToggleFullText,
		onSaveCurrentSearch
	}: Props = $props();

	let inputEl: HTMLInputElement | null = null;

	onMount(() => {
		setTimeout(() => inputEl?.focus(), 0);
	});
</script>

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

<style>
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
</style>
