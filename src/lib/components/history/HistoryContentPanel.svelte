<script lang="ts">
	import type { HistoryDiffRow, HistoryDiffSummary } from '$lib/history/diff';

	type HistoryViewMode = 'snapshot' | 'diff';

	interface Props {
		selectedSha: string | null;
		selectedContent: string | null;
		currentContent: string | null;
		loadingContent: boolean;
		loadingCurrent: boolean;
		viewMode: HistoryViewMode;
		diffRows: HistoryDiffRow[];
		diffSummary: HistoryDiffSummary;
		canRestore: boolean;
		restoring: boolean;
		onViewModeChange: (mode: HistoryViewMode) => void;
		onCopy: () => void;
		onRestore: () => void;
	}

	let {
		selectedSha,
		selectedContent,
		currentContent,
		loadingContent,
		loadingCurrent,
		viewMode,
		diffRows,
		diffSummary,
		canRestore,
		restoring,
		onViewModeChange,
		onCopy,
		onRestore
	}: Props = $props();

	const diffReady = $derived(selectedContent != null && currentContent != null && !loadingContent && !loadingCurrent);
	const isLoading = $derived(loadingContent || (viewMode === 'diff' && loadingCurrent));
</script>

<section class="content">
	<header class="content-head">
		<div class="history-target">
			<span class="mono">{selectedSha ? selectedSha.slice(0, 7) : '-'}</span>
			{#if viewMode === 'diff' && diffReady}
				<span class="diff-summary" class:clean={!diffSummary.changed}>
					{#if diffSummary.changed}
						+{diffSummary.added} / -{diffSummary.removed}
					{:else}
						no changes vs current
					{/if}
				</span>
			{/if}
		</div>
		<div class="content-actions">
			<div class="mode-switch" role="tablist" aria-label="History view mode">
				<button
					type="button"
					class:active={viewMode === 'diff'}
					role="tab"
					aria-selected={viewMode === 'diff'}
					onclick={() => onViewModeChange('diff')}
				>Diff</button>
				<button
					type="button"
					class:active={viewMode === 'snapshot'}
					role="tab"
					aria-selected={viewMode === 'snapshot'}
					onclick={() => onViewModeChange('snapshot')}
				>Snapshot</button>
			</div>
			<button class="mini restore" onclick={onRestore} disabled={!canRestore || restoring}>
				{restoring ? 'Restoring...' : 'Restore'}
			</button>
			<button class="mini" onclick={onCopy} disabled={!selectedContent}>Copy</button>
		</div>
	</header>

	{#if isLoading}
		<pre class="viewer">Loading...</pre>
	{:else if viewMode === 'snapshot'}
		<pre class="viewer">{selectedContent ?? '-'}</pre>
	{:else if !diffReady}
		<pre class="viewer">Select a commit to compare it with the current note.</pre>
	{:else}
		<div class="diff" role="table" aria-label="Selected history diff against current note">
			{#each diffRows as row (row.id)}
				<div class="diff-row {row.kind}" role="row">
					<span class="line old mono" role="cell">{row.beforeLine ?? ''}</span>
					<span class="line new mono" role="cell">{row.afterLine ?? ''}</span>
					<span class="mark mono" role="cell">{row.kind === 'added' ? '+' : row.kind === 'removed' ? '-' : ' '}</span>
					<span class="text mono" role="cell">{row.text || ' '}</span>
				</div>
			{/each}
			{#if diffRows.length === 0}
				<p class="empty">Both versions are empty.</p>
			{/if}
		</div>
	{/if}
</section>

<style>
	.content {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.content-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 8px 12px;
		border-bottom: 1px solid var(--border);
		font-size: 0.78rem;
		color: var(--fg-dim);
	}
	.history-target,
	.content-actions {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}
	.diff-summary {
		color: var(--fg);
		white-space: nowrap;
	}
	.diff-summary.clean {
		color: var(--success);
	}
	.mode-switch {
		display: flex;
		gap: 2px;
		border: 1px solid var(--border);
		border-radius: 5px;
		padding: 2px;
	}
	.mode-switch button,
	.mini {
		background: var(--bg);
		border: 1px solid transparent;
		border-radius: 4px;
		padding: 3px 9px;
		color: var(--fg);
		cursor: pointer;
		font: inherit;
		font-size: 0.76rem;
	}
	.mode-switch button.active {
		border-color: var(--border);
		background: var(--bg-elev-2);
		color: var(--accent);
	}
	.mini {
		border-color: var(--border);
	}
	.restore:not(:disabled) {
		border-color: color-mix(in srgb, var(--accent) 70%, var(--border));
		color: var(--accent);
	}
	.mini:hover:not(:disabled),
	.mode-switch button:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	.mini:disabled { opacity: 0.4; cursor: default; }
	.viewer,
	.diff {
		flex: 1;
		margin: 0;
		padding: 16px 20px;
		overflow: auto;
		font-family: var(--mono);
		font-size: 0.86rem;
		color: var(--fg);
	}
	.viewer {
		white-space: pre-wrap;
		word-wrap: break-word;
	}
	.diff {
		display: block;
	}
	.diff-row {
		display: grid;
		grid-template-columns: 4ch 4ch 2ch minmax(0, 1fr);
		min-height: 1.45em;
		border-left: 2px solid transparent;
	}
	.diff-row.added {
		background: color-mix(in srgb, var(--success) 12%, transparent);
		border-left-color: var(--success);
	}
	.diff-row.removed {
		background: color-mix(in srgb, var(--danger) 12%, transparent);
		border-left-color: var(--danger);
	}
	.line,
	.mark {
		color: var(--fg-dim);
		text-align: right;
		padding-right: 8px;
		user-select: none;
	}
	.mark {
		text-align: center;
		padding-right: 0;
	}
	.added .mark { color: var(--success); }
	.removed .mark { color: var(--danger); }
	.text {
		white-space: pre-wrap;
		word-break: break-word;
		padding: 0 8px;
	}
	.empty {
		margin: 0;
		color: var(--fg-dim);
		font-size: 0.86rem;
	}
	.mono { font-family: var(--mono); }

	@media (max-width: 800px) {
		.content-head {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
