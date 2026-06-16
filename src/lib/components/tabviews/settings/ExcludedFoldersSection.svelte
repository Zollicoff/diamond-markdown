<script lang="ts">
	interface Props {
		excluded: string[];
		busy: boolean;
		error: string | null;
		onRemove: (folder: string) => void | Promise<void>;
	}

	let { excluded, busy, error, onRemove }: Props = $props();
</script>

<section class="group" id="excluded">
	<h2>Excluded folders</h2>
	<p class="group-hint">
		Folders listed here are skipped by the indexer, file tree, and search.
		Right-click any folder in the file tree → <em>Exclude from index</em> to add one.
	</p>
	{#if excluded.length === 0}
		<div class="empty">No folders excluded.</div>
	{:else}
		<ul class="ex-list">
			{#each excluded as folder (folder)}
				<li class="ex-item">
					<span class="ex-path mono">{folder}</span>
					<button class="ex-remove" onclick={() => onRemove(folder)} disabled={busy}>Remove</button>
				</li>
			{/each}
		</ul>
	{/if}
	{#if error}
		<div class="err">{error}</div>
	{/if}
</section>

<style>
	.group {
		scroll-margin-top: 20px;
		margin-bottom: 28px;
		padding-bottom: 20px;
		border-bottom: 1px solid var(--border);
	}
	.group h2 {
		font-family: 'Bricolage Grotesque', var(--sans);
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--fg-muted);
		margin: 0 0 14px;
	}
	.group-hint {
		color: var(--fg-dim);
		font-size: 0.85rem;
		margin: -8px 0 14px;
	}
	.group-hint em { color: var(--fg-muted); font-style: normal; }
	.ex-list { list-style: none; padding: 0; margin: 0; }
	.ex-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 8px 12px;
		border: 1px solid var(--border);
		border-radius: 6px;
		margin-bottom: 6px;
		background: var(--bg-elev);
	}
	.ex-path { font-size: 0.86rem; color: var(--fg); overflow: hidden; text-overflow: ellipsis; }
	.ex-remove {
		background: transparent;
		border: 1px solid var(--border);
		color: var(--fg-muted);
		font: inherit;
		font-size: 0.78rem;
		padding: 3px 10px;
		border-radius: 4px;
		cursor: pointer;
		flex: none;
	}
	.ex-remove:hover:not(:disabled) { color: var(--danger); border-color: var(--danger); }
	.ex-remove:disabled { opacity: 0.5; cursor: default; }
	.empty {
		color: var(--fg-dim);
		font-size: 0.85rem;
		font-style: italic;
		padding: 12px 4px;
	}
	.err {
		color: var(--danger);
		font-size: 0.82rem;
		margin-top: 8px;
	}
	.mono { font-family: var(--mono); }
</style>
