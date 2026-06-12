<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/vault-api';
	import type { GitSyncStatus } from '$lib/types';
	import { buildGitSyncResolutionCommands, buildGitSyncSetupCommands } from '$lib/sync/commands';
	import { buildGitSyncRecoveryCopy } from '$lib/sync/recovery';
	import { buildGitSyncUiState } from '$lib/sync/status';
	import GitSyncRecoveryPanel from './sync/GitSyncRecoveryPanel.svelte';
	import GitSyncStatusCard from './sync/GitSyncStatusCard.svelte';

	interface Props {
		vaultId: string;
		vaultPath?: string;
	}

	let { vaultId, vaultPath = '' }: Props = $props();

	let status = $state<GitSyncStatus | null>(null);
	let remoteUrl = $state('');
	let busy = $state<string | null>(null);
	let message = $state<string | null>(null);
	let error = $state<string | null>(null);

	const ui = $derived(buildGitSyncUiState(status, remoteUrl, busy));
	const recoveryCopy = $derived(buildGitSyncRecoveryCopy(status));
	const setupCommands = $derived.by(() => buildGitSyncSetupCommands(status, vaultPath, remoteUrl));
	const resolutionCommands = $derived.by(() => buildGitSyncResolutionCommands(status, vaultPath));

	function applyStatus(next: GitSyncStatus): void {
		status = next;
		remoteUrl = next.remoteUrl ?? remoteUrl;
	}

	async function loadStatus(): Promise<void> {
		busy = 'status';
		error = null;
		try {
			applyStatus(await api.syncStatus(vaultId));
		} catch (e) {
			error = (e as Error).message;
		} finally {
			busy = null;
		}
	}

	async function run<T extends { status: GitSyncStatus; message: string }>(
		name: string,
		fn: () => Promise<T>
	): Promise<void> {
		busy = name;
		error = null;
		message = null;
		try {
			const res = await fn();
			applyStatus(res.status);
			message = res.message;
		} catch (e) {
			error = (e as Error).message;
			await loadStatus();
		} finally {
			busy = null;
		}
	}

	onMount(() => {
		void loadStatus();
	});
</script>

<section class="group">
	<h2>GitHub sync</h2>

	<div class="row">
		<div class="row-label">
			<div class="row-title">Remote</div>
			<div class="row-hint">GitHub HTTPS or SSH remote for this vault's git repo.</div>
		</div>
		<form
			class="remote-form"
			onsubmit={(event) => {
				event.preventDefault();
				if (!ui.canSaveRemote) return;
				void run('remote', () => api.setSyncRemote(vaultId, remoteUrl));
			}}
		>
			<input
				class="remote-input mono"
				type="text"
				spellcheck="false"
				placeholder="https://github.com/owner/repo.git"
				bind:value={remoteUrl}
				disabled={ui.isBusy}
			/>
			<button class="small-btn" disabled={!ui.canSaveRemote}>Save</button>
		</form>
	</div>

	<GitSyncStatusCard {status} indicator={ui.indicator} />

	<div class="actions">
		<button class="action-btn" onclick={loadStatus} disabled={ui.isBusy}>Refresh</button>
		<button class="action-btn" onclick={() => run('check', () => api.checkSync(vaultId))} disabled={!ui.canCheck}>Check remote</button>
		<button class="action-btn" onclick={() => run('fetch', () => api.fetchSync(vaultId))} disabled={!ui.canFetch}>Fetch</button>
		<button class="action-btn" onclick={() => run('pull', () => api.pullSync(vaultId))} disabled={!ui.canPull}>Pull</button>
		<button class="action-btn primary" onclick={() => run('push', () => api.pushSync(vaultId))} disabled={!ui.canPush}>Push</button>
	</div>

	<GitSyncRecoveryPanel
		{status}
		recovery={ui.recovery}
		copy={recoveryCopy}
		{setupCommands}
		{resolutionCommands}
		canPull={ui.canPull}
		isBusy={ui.isBusy}
		onPull={() => run('pull', () => api.pullSync(vaultId))}
		onRefresh={loadStatus}
	/>

	{#if message}
		<div class="ok-msg">{message}</div>
	{/if}
	{#if error}
		<div class="err">{error}</div>
	{/if}
</section>

<style>
	.group {
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

	.actions {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
	}
	.small-btn,
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
	.small-btn:hover:not(:disabled),
	.action-btn:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}
	.small-btn:disabled,
	.action-btn:disabled,
	.remote-input:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.action-btn.primary:disabled {
		border-color: var(--border);
		color: var(--fg-muted);
	}

	.ok-msg,
	.err {
		font-size: 0.82rem;
		margin-top: 8px;
	}
	.ok-msg { color: var(--success); }
	.err { color: var(--danger); }
	.mono { font-family: var(--mono); }

	@media (max-width: 760px) {
		.row {
			display: grid;
		}
		.remote-form {
			grid-template-columns: 1fr auto;
			min-width: 0;
		}
		.actions {
			justify-content: flex-start;
		}
	}
</style>
