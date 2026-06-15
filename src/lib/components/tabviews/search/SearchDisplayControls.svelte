<script lang="ts">
	import type { SearchFolderFacet, SearchGroupMode } from '$lib/search/view';

	interface Props {
		fullText: boolean;
		groupMode: SearchGroupMode;
		folderFacets: SearchFolderFacet[];
		onSetGroupMode: (mode: SearchGroupMode) => void;
		onNarrowToFolder: (query: string) => void;
	}

	let {
		fullText,
		groupMode,
		folderFacets,
		onSetGroupMode,
		onNarrowToFolder
	}: Props = $props();
</script>

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

<style>
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
</style>
