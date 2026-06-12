<script lang="ts">
	import type { GitSyncStatus } from '$lib/types';
	import type { GitSyncRecoveryCopy } from '$lib/sync/recovery';
	import type { GitSyncRecoveryKind } from '$lib/sync/status';

	interface Props {
		status: GitSyncStatus | null;
		recovery: GitSyncRecoveryKind;
		copy: GitSyncRecoveryCopy | null;
		setupCommands: string;
		resolutionCommands: string;
		canPull: boolean;
		isBusy: boolean;
		onPull?: () => void;
		onRefresh?: () => void;
	}

	let {
		status,
		recovery,
		copy,
		setupCommands,
		resolutionCommands,
		canPull,
		isBusy,
		onPull,
		onRefresh
	}: Props = $props();
</script>

{#if recovery === 'setup'}
	<div class="sync-block">
		<header class="panel-head">
			<div>
				<div class="panel-title">{copy?.title}</div>
				<div class="panel-subtitle">{copy?.subtitle}</div>
			</div>
			<span class="badge">{copy?.badge}</span>
		</header>
		{@render commandBlock(setupCommands)}
	</div>
{/if}

{#if recovery === 'remote-changes' && status}
	<div class="sync-block">
		<header class="panel-head">
			<div>
				<div class="panel-title">{copy?.title}</div>
				<div class="panel-subtitle">{copy?.subtitle}</div>
			</div>
			<span class="badge">{copy?.badge}</span>
		</header>
		<p>{copy?.body}</p>
		<div class="panel-actions">
			<button class="action-btn primary" onclick={onPull} disabled={!canPull}>Pull now</button>
			<button class="action-btn" onclick={onRefresh} disabled={isBusy}>Refresh</button>
		</div>
		{@render commandBlock(resolutionCommands)}
	</div>
{/if}

{#if recovery === 'conflicts' && status}
	<div class="sync-block danger-block">
		<header class="panel-head">
			<div>
				<div class="panel-title">{copy?.title}</div>
				<div class="panel-subtitle">{copy?.subtitle}</div>
			</div>
			<span class="badge">{copy?.badge}</span>
		</header>
		<ul class="file-list">
			{#each status.conflicted as file (file)}
				<li class="mono">{file}</li>
			{/each}
		</ul>
		{@render commandBlock(resolutionCommands)}
	</div>
{/if}

{#if recovery === 'diverged' && status}
	<div class="sync-block diverged-panel">
		<header class="panel-head">
			<div>
				<div class="panel-title">{copy?.title}</div>
				<div class="panel-subtitle">{copy?.subtitle}</div>
			</div>
			<span class="badge">{copy?.badge}</span>
		</header>
		<p>{copy?.body}</p>
		<div class="panel-actions">
			<button class="action-btn" onclick={onRefresh} disabled={isBusy}>Refresh after resolve</button>
		</div>
		{@render commandBlock(resolutionCommands)}

		<div class="change-grid">
			<div class="change-box local">
				<h3>Local only</h3>
				{@render fileList(status.localChanges, 'No local file changes reported.')}
			</div>
			<div class="change-box remote">
				<h3>Remote only</h3>
				{@render fileList(status.remoteChanges, 'No remote file changes reported.')}
			</div>
			<div class="change-box overlap" class:hot={status.conflictCandidates.length > 0}>
				<h3>Overlapping files</h3>
				{@render fileList(status.conflictCandidates, 'No same-path overlap detected.')}
			</div>
		</div>
	</div>
{/if}

{#snippet fileList(files: string[], empty: string)}
	{#if files.length > 0}
		<ul class="change-list">
			{#each files as file (file)}
				<li class="mono" title={file}>{file}</li>
			{/each}
		</ul>
	{:else}
		<div class="empty">{empty}</div>
	{/if}
{/snippet}

{#snippet commandBlock(commands: string)}
	{#if commands}
		<pre class="command-block mono"><code>{commands}</code></pre>
	{/if}
{/snippet}

<style>
	.sync-block {
		margin-top: 12px;
		padding: 12px;
		border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
		border-radius: 7px;
		background: var(--bg);
	}
	.danger-block {
		border-color: color-mix(in srgb, var(--danger) 55%, var(--border));
	}
	.panel-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}
	.panel-title {
		font-size: 0.9rem;
		font-weight: 700;
		color: var(--fg);
	}
	.panel-subtitle {
		font-size: 0.72rem;
		color: var(--fg-dim);
		margin-top: 2px;
	}
	.badge {
		border: 1px solid var(--border);
		border-radius: 999px;
		color: var(--accent);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		padding: 3px 7px;
	}
	p {
		color: var(--fg-muted);
		font-size: 0.8rem;
		line-height: 1.45;
		margin: 10px 0;
	}
	.panel-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin: 8px 0 10px;
	}
	.action-btn {
		border: 1px solid var(--border);
		border-radius: 5px;
		background: var(--bg-elev);
		color: var(--fg);
		font: inherit;
		font-size: 0.78rem;
		padding: 6px 10px;
		cursor: pointer;
	}
	.action-btn.primary {
		border-color: color-mix(in srgb, var(--accent) 70%, var(--border));
		color: var(--accent);
	}
	.action-btn:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}
	.action-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.action-btn.primary:disabled {
		border-color: var(--border);
		color: var(--fg-muted);
	}
	.file-list {
		margin: 10px 0;
		padding: 8px 12px 8px 26px;
		border: 1px solid var(--border);
		border-radius: 6px;
		color: var(--danger);
		background: var(--bg);
		font-size: 0.78rem;
	}
	.command-block {
		margin: 10px 0;
		padding: 9px 10px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg-elev);
		color: var(--fg);
		font-size: 0.72rem;
		line-height: 1.45;
		overflow-x: auto;
		white-space: pre;
	}
	.change-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
	}
	.change-box {
		min-width: 0;
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 8px;
		background: var(--bg-elev);
	}
	.change-box.hot {
		border-color: color-mix(in srgb, var(--danger) 55%, var(--border));
	}
	.change-box h3 {
		margin: 0 0 6px;
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--fg-muted);
	}
	.change-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 3px;
	}
	.change-list li {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.72rem;
		color: var(--fg);
	}
	.empty {
		color: var(--fg-dim);
		font-size: 0.72rem;
	}
	.mono { font-family: var(--mono); }

	@media (max-width: 760px) {
		.change-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
