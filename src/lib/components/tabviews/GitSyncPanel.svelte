<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/vault-api';
	import type { GitSyncStatus } from '$lib/types';

	interface Props {
		vaultId: string;
	}

	let { vaultId }: Props = $props();

	let status = $state<GitSyncStatus | null>(null);
	let remoteUrl = $state('');
	let busy = $state<string | null>(null);
	let message = $state<string | null>(null);
	let error = $state<string | null>(null);

	const isBusy = $derived(busy !== null);
	const canSaveRemote = $derived(remoteUrl.trim().length > 0 && !isBusy);
	const canFetch = $derived(!!status?.remoteUrl && !isBusy);
	const canPull = $derived(!!status?.canPull && !isBusy);
	const canPush = $derived(!!status?.canPush && !isBusy);

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
				if (!canSaveRemote) return;
				void run('remote', () => api.setSyncRemote(vaultId, remoteUrl));
			}}
		>
			<input
				class="remote-input mono"
				type="text"
				spellcheck="false"
				placeholder="https://github.com/owner/repo.git"
				bind:value={remoteUrl}
				disabled={isBusy}
			/>
			<button class="small-btn" disabled={!canSaveRemote}>Save</button>
		</form>
	</div>

	<div class="sync-status">
		<div class="status-main">
			<div class="dot" class:ok={status?.clean && !status?.needsRemote} class:warn={!status?.clean || status?.needsRemote}></div>
			<div class="status-copy">
				<div class="status-title">{status?.message ?? 'Checking sync status...'}</div>
				<div class="status-meta mono">
					{#if status}
						{status.branch ?? 'detached'} @ {status.sha ?? 'no commits'}
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

	<div class="actions">
		<button class="action-btn" onclick={loadStatus} disabled={isBusy}>Refresh</button>
		<button class="action-btn" onclick={() => run('fetch', () => api.fetchSync(vaultId))} disabled={!canFetch}>Fetch</button>
		<button class="action-btn" onclick={() => run('pull', () => api.pullSync(vaultId))} disabled={!canPull}>Pull</button>
		<button class="action-btn primary" onclick={() => run('push', () => api.pushSync(vaultId))} disabled={!canPush}>Push</button>
	</div>

	{#if status?.conflicted.length}
		<ul class="file-list">
			{#each status.conflicted as file (file)}
				<li class="mono">{file}</li>
			{/each}
		</ul>
	{/if}

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

	.file-list {
		margin: 10px 0 0;
		padding: 8px 12px 8px 26px;
		border: 1px solid var(--border);
		border-radius: 6px;
		color: var(--danger);
		background: var(--bg);
		font-size: 0.78rem;
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
		.row,
		.sync-status {
			grid-template-columns: 1fr;
		}
		.row {
			display: grid;
		}
		.remote-form {
			grid-template-columns: 1fr auto;
			min-width: 0;
		}
		.actions,
		.status-counts {
			justify-content: flex-start;
		}
	}
</style>
