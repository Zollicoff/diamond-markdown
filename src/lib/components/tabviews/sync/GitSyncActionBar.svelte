<script lang="ts">
	import { gitSyncBusyActionLabel, type GitSyncBusyAction } from '$lib/sync/status';

	interface Props {
		canSync: boolean;
		canCheck: boolean;
		canFetch: boolean;
		canPull: boolean;
		canPush: boolean;
		isBusy: boolean;
		busyAction: GitSyncBusyAction | null;
		onRefresh: () => void;
		onSync: () => void;
		onCheck: () => void;
		onFetch: () => void;
		onPull: () => void;
		onPush: () => void;
	}

	let {
		canSync,
		canCheck,
		canFetch,
		canPull,
		canPush,
		isBusy,
		busyAction,
		onRefresh,
		onSync,
		onCheck,
		onFetch,
		onPull,
		onPush
	}: Props = $props();

	function actionLabel(action: GitSyncBusyAction, idle: string): string {
		return busyAction === action ? (gitSyncBusyActionLabel(action) ?? idle) : idle;
	}
</script>

<div class="actions">
	<button class="action-btn" aria-busy={busyAction === 'status'} onclick={onRefresh} disabled={isBusy}>{actionLabel('status', 'Refresh')}</button>
	<button class="action-btn primary" aria-busy={busyAction === 'sync'} onclick={onSync} disabled={!canSync}>{actionLabel('sync', 'Sync now')}</button>
	<button class="action-btn" aria-busy={busyAction === 'check'} onclick={onCheck} disabled={!canCheck}>{actionLabel('check', 'Check remote')}</button>
	<button class="action-btn" aria-busy={busyAction === 'fetch'} onclick={onFetch} disabled={!canFetch}>{actionLabel('fetch', 'Fetch')}</button>
	<button class="action-btn" aria-busy={busyAction === 'pull'} onclick={onPull} disabled={!canPull}>{actionLabel('pull', 'Pull')}</button>
	<button class="action-btn" aria-busy={busyAction === 'push'} onclick={onPush} disabled={!canPush}>{actionLabel('push', 'Push')}</button>
</div>

<style>
	.actions {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
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

	@media (max-width: 760px) {
		.actions {
			justify-content: flex-start;
		}
	}
</style>
