<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/vault-api';
	import type { GitSyncStatus } from '$lib/types';
	import { buildGitSyncResolutionCommands, buildGitSyncSetupCommands } from '$lib/sync/commands';
	import { buildGitSyncRecoveryCopy } from '$lib/sync/recovery';
	import { buildGitSyncUiState } from '$lib/sync/status';
	import GitSyncActionBar from './sync/GitSyncActionBar.svelte';
	import GitSyncRecoveryPanel from './sync/GitSyncRecoveryPanel.svelte';
	import GitSyncRemoteForm from './sync/GitSyncRemoteForm.svelte';
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

	<GitSyncRemoteForm
		{remoteUrl}
		canSaveRemote={ui.canSaveRemote}
		isBusy={ui.isBusy}
		onRemoteUrlChange={(value) => (remoteUrl = value)}
		onSaveRemote={() => run('remote', () => api.setSyncRemote(vaultId, remoteUrl))}
	/>

	<GitSyncStatusCard {status} indicator={ui.indicator} />

	<GitSyncActionBar
		canCheck={ui.canCheck}
		canFetch={ui.canFetch}
		canPull={ui.canPull}
		canPush={ui.canPush}
		isBusy={ui.isBusy}
		onRefresh={loadStatus}
		onCheck={() => run('check', () => api.checkSync(vaultId))}
		onFetch={() => run('fetch', () => api.fetchSync(vaultId))}
		onPull={() => run('pull', () => api.pullSync(vaultId))}
		onPush={() => run('push', () => api.pushSync(vaultId))}
	/>

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

	.ok-msg,
	.err {
		font-size: 0.82rem;
		margin-top: 8px;
	}
	.ok-msg { color: var(--success); }
	.err { color: var(--danger); }
</style>
