<script lang="ts">
	import { compactPathList, obsidianBookmarksSummary } from '$lib/import/checklist';
	import type { ObsidianBookmarksInfo } from '$lib/types';

	interface Props {
		bookmarks: ObsidianBookmarksInfo;
	}

	let { bookmarks }: Props = $props();
</script>

{#if bookmarks.status !== 'missing'}
	<div class="note">
		<span class="note-label">Obsidian bookmarks</span>
		<span>{obsidianBookmarksSummary(bookmarks)}</span>
		{#if bookmarks.path}
			<span class="mono">{bookmarks.path}</span>
		{/if}
		{#if bookmarks.paths.length > 0}
			<span class="mono">{compactPathList(bookmarks.paths, 4)}</span>
		{/if}
		{#if bookmarks.searchQueries.length > 0}
			<span class="mono">{compactPathList(bookmarks.searchQueries, 3)}</span>
		{/if}
	</div>
{/if}

<style>
	.note {
		display: grid;
		gap: 3px;
		color: var(--fg-dim);
		font-size: 0.76rem;
	}
	.note-label {
		color: var(--fg-muted);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.mono { font-family: var(--mono); }
</style>
