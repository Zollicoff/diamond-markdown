<script lang="ts">
	interface Props {
		canSync: boolean;
		canCheck: boolean;
		canFetch: boolean;
		canPull: boolean;
		canPush: boolean;
		isBusy: boolean;
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
		onRefresh,
		onSync,
		onCheck,
		onFetch,
		onPull,
		onPush
	}: Props = $props();
</script>

<div class="actions">
	<button class="action-btn" onclick={onRefresh} disabled={isBusy}>Refresh</button>
	<button class="action-btn primary" onclick={onSync} disabled={!canSync}>Sync now</button>
	<button class="action-btn" onclick={onCheck} disabled={!canCheck}>Check remote</button>
	<button class="action-btn" onclick={onFetch} disabled={!canFetch}>Fetch</button>
	<button class="action-btn" onclick={onPull} disabled={!canPull}>Pull</button>
	<button class="action-btn" onclick={onPush} disabled={!canPush}>Push</button>
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
