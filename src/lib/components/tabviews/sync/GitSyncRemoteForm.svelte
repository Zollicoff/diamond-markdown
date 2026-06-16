<script lang="ts">
	import { gitSyncBusyActionLabel, type GitSyncBusyAction } from '$lib/sync/status';

	interface Props {
		remoteUrl: string;
		canSaveRemote: boolean;
		isBusy: boolean;
		busyAction: GitSyncBusyAction | null;
		onRemoteUrlChange: (value: string) => void;
		onSaveRemote: () => void;
	}

	let {
		remoteUrl,
		canSaveRemote,
		isBusy,
		busyAction,
		onRemoteUrlChange,
		onSaveRemote
	}: Props = $props();

	const saveLabel = $derived(busyAction === 'remote' ? (gitSyncBusyActionLabel(busyAction) ?? 'Saving...') : 'Save');
</script>

<div class="row">
	<div class="row-label">
		<div class="row-title">Remote</div>
		<div class="row-hint">GitHub HTTPS or SSH remote for this vault's git repo.</div>
	</div>
	<form
		class="remote-form"
		onsubmit={(event) => {
			event.preventDefault();
			if (!canSaveRemote) return;
			onSaveRemote();
		}}
	>
		<input
			class="remote-input mono"
			type="text"
			spellcheck="false"
			placeholder="https://github.com/owner/repo.git"
			value={remoteUrl}
			oninput={(event) => onRemoteUrlChange(event.currentTarget.value)}
			disabled={isBusy}
		/>
		<button class="small-btn" aria-busy={busyAction === 'remote'} disabled={!canSaveRemote}>{saveLabel}</button>
	</form>
</div>

<style>
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
		padding: 10px 0;
	}
	.row-label { min-width: 0; flex: 1; }
	.row-title { font-size: 0.92rem; color: var(--fg); }
	.row-hint { font-size: 0.78rem; color: var(--fg-dim); margin-top: 2px; }

	.remote-form {
		display: grid;
		grid-template-columns: minmax(220px, 320px) auto;
		gap: 8px;
		align-items: center;
		min-width: min(420px, 100%);
	}
	.remote-input {
		min-width: 0;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		color: var(--fg);
		padding: 7px 9px;
		font: inherit;
		font-size: 0.78rem;
	}
	.remote-input:focus {
		outline: 1px solid var(--accent);
		border-color: var(--accent);
	}
	.small-btn {
		border: 1px solid var(--border);
		border-radius: 5px;
		background: var(--bg-elev);
		color: var(--fg);
		font: inherit;
		font-size: 0.78rem;
		padding: 6px 10px;
		cursor: pointer;
	}
	.small-btn:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}
	.small-btn:disabled,
	.remote-input:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.mono { font-family: var(--mono); }

	@media (max-width: 760px) {
		.row {
			display: grid;
		}
		.remote-form {
			grid-template-columns: 1fr auto;
			min-width: 0;
		}
	}
</style>
