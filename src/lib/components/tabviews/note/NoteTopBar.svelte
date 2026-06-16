<script lang="ts">
	import { formatSavedAt } from '$lib/note/view';
	import type { NoteViewMode } from '$lib/types';

	interface Props {
		path: string;
		wordCount: number;
		readingTime: string;
		mode: NoteViewMode;
		saving: boolean;
		dirty: boolean;
		savedAt: number | null;
		err: string | null;
		isConflict: boolean;
		onModeChange?: (mode: NoteViewMode) => void;
		onReload?: () => void;
		onHistory?: () => void;
		onSave?: () => void;
	}

	let {
		path,
		wordCount,
		readingTime,
		mode,
		saving,
		dirty,
		savedAt,
		err,
		isConflict,
		onModeChange,
		onReload,
		onHistory,
		onSave
	}: Props = $props();
</script>

<header class="topbar">
	<div class="crumbs mono">{path}</div>
	<div class="save-status">
		{#if wordCount > 0}
			<span class="meta mono" title="Word count · estimated reading time">{wordCount} words · {readingTime}</span>
		{/if}
		<div class="mode-group" role="tablist" aria-label="View mode">
			<button class:active={mode === 'live'} onclick={() => onModeChange?.('live')} role="tab" aria-selected={mode === 'live'}>Live</button>
			<button class:active={mode === 'source'} onclick={() => onModeChange?.('source')} role="tab" aria-selected={mode === 'source'}>Source</button>
			<button class:active={mode === 'read'} onclick={() => onModeChange?.('read')} role="tab" aria-selected={mode === 'read'}>Read</button>
		</div>
		{#if saving}<span class="status saving">saving…</span>
		{:else if err}<span class="status err" title={err}>{isConflict ? 'conflict' : 'error'}</span>
		{:else if dirty}<span class="status dirty">●</span>
		{:else if savedAt}<span class="status saved">{formatSavedAt(savedAt)}</span>{/if}
		{#if isConflict}
			<button class="btn danger" onclick={onReload}>Reload</button>
		{/if}
		<button
			class="btn"
			onclick={onHistory}
			title="Show version history"
			aria-label="Show version history"
		>⏱</button>
		<button class="btn" onclick={onSave} disabled={!dirty || saving}>Save</button>
	</div>
</header>

<style>
	.topbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 6px 14px;
		border-bottom: 1px solid var(--border);
		gap: 16px;
		background: var(--bg);
	}
	.crumbs {
		color: var(--fg-muted);
		font-size: 0.78rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}
	.save-status {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 0.78rem;
		color: var(--fg-dim);
	}
	.meta {
		font-size: 0.74rem;
		color: var(--fg-muted);
		white-space: nowrap;
	}

	.mode-group {
		display: flex;
		gap: 2px;
		background: var(--bg);
		border: 1px solid var(--border);
		padding: 2px;
		border-radius: 6px;
	}
	.mode-group button {
		background: transparent;
		border: 0;
		color: var(--fg-muted);
		padding: 2px 9px;
		border-radius: 4px;
		font-size: 0.74rem;
		cursor: pointer;
		font-family: inherit;
	}
	.mode-group button:hover { color: var(--fg); }
	.mode-group button.active {
		background: var(--bg-elev);
		color: var(--accent);
	}
	.status.saving { color: var(--fg-muted); }
	.status.dirty {
		color: var(--accent);
		font-size: 1.2em;
		line-height: 1;
	}
	.status.saved { color: var(--success); }
	.status.err { color: var(--danger); }
	.btn {
		padding: 3px 12px;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		border-radius: 5px;
		color: var(--fg);
		font-size: 0.78rem;
		cursor: pointer;
	}
	.btn:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}
	.btn.danger { color: var(--danger); }
	.btn.danger:hover:not(:disabled) {
		border-color: var(--danger);
		color: var(--danger);
	}
	.btn:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.mono { font-family: var(--mono); }
</style>
