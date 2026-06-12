<script lang="ts">
	import type { GitSyncStatus } from '$lib/types';
	import type { GitSyncIndicator } from '$lib/sync/status';

	interface Props {
		status: GitSyncStatus | null;
		indicator: GitSyncIndicator;
	}

	let { status, indicator }: Props = $props();
</script>

<div class="sync-status">
	<div class="status-main">
		<div class="dot" class:ok={indicator === 'ok'} class:warn={indicator === 'warn'} class:danger={indicator === 'danger'}></div>
		<div class="status-copy">
			<div class="status-title">{status?.message ?? 'Checking sync status...'}</div>
			<div class="status-meta mono">
				{#if status}
					{#if status.initialized}
						{status.branch ?? 'detached'} @ {status.sha ?? 'no commits'}
					{:else}
						vault unavailable
					{/if}
					{#if status.remoteDisplayUrl}
						<span class="sep">/</span>{status.remoteDisplayUrl}
					{/if}
				{:else}
					loading
				{/if}
			</div>
		</div>
	</div>

	<div class="status-counts">
		<span title="Local commits not on GitHub">Ahead {status?.ahead ?? 0}</span>
		<span title="GitHub commits not pulled locally">Behind {status?.behind ?? 0}</span>
		<span title="Changed files in the vault repo">Files {status?.files.length ?? 0}</span>
	</div>
</div>

<style>
	.sync-status {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 14px;
		align-items: center;
		border: 1px solid var(--border);
		border-radius: 7px;
		background: var(--bg-elev);
		padding: 12px;
		margin: 10px 0;
	}
	.status-main {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}
	.dot {
		width: 9px;
		height: 9px;
		border-radius: 999px;
		background: var(--fg-dim);
		flex: none;
	}
	.dot.ok { background: var(--success); }
	.dot.warn { background: var(--accent); }
	.dot.danger { background: var(--danger); }
	.status-copy { min-width: 0; }
	.status-title { font-size: 0.88rem; color: var(--fg); }
	.status-meta {
		color: var(--fg-dim);
		font-size: 0.72rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 440px;
		margin-top: 2px;
	}
	.sep { padding: 0 6px; color: var(--fg-muted); }
	.status-counts {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		justify-content: flex-end;
	}
	.status-counts span {
		border: 1px solid var(--border);
		border-radius: 999px;
		color: var(--fg-muted);
		font-size: 0.72rem;
		padding: 3px 8px;
		background: var(--bg);
	}
	.mono { font-family: var(--mono); }

	@media (max-width: 760px) {
		.sync-status {
			grid-template-columns: 1fr;
		}
		.status-counts {
			justify-content: flex-start;
		}
	}
</style>
