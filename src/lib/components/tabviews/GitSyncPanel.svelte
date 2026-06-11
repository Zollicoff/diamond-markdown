<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/vault-api';
	import type { GitSyncStatus } from '$lib/types';
	import { buildGitSyncResolutionCommands, buildGitSyncSetupCommands } from '$lib/sync/commands';
	import { buildGitSyncRecoveryCopy } from '$lib/sync/recovery';
	import { buildGitSyncUiState } from '$lib/sync/status';

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

	<div class="sync-status">
		<div class="status-main">
			<div class="dot" class:ok={ui.indicator === 'ok'} class:warn={ui.indicator === 'warn'} class:danger={ui.indicator === 'danger'}></div>
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
		<button class="action-btn" onclick={loadStatus} disabled={ui.isBusy}>Refresh</button>
		<button class="action-btn" onclick={() => run('check', () => api.checkSync(vaultId))} disabled={!ui.canCheck}>Check remote</button>
		<button class="action-btn" onclick={() => run('fetch', () => api.fetchSync(vaultId))} disabled={!ui.canFetch}>Fetch</button>
		<button class="action-btn" onclick={() => run('pull', () => api.pullSync(vaultId))} disabled={!ui.canPull}>Pull</button>
		<button class="action-btn primary" onclick={() => run('push', () => api.pushSync(vaultId))} disabled={!ui.canPush}>Push</button>
	</div>

	{#if ui.recovery === 'setup'}
		<div class="sync-block">
			<div class="diverged-head">
				<div>
					<div class="panel-title">{recoveryCopy?.title}</div>
					<div class="panel-subtitle">{recoveryCopy?.subtitle}</div>
				</div>
				<span class="badge">{recoveryCopy?.badge}</span>
			</div>
			{@render commandBlock(setupCommands)}
		</div>
	{/if}

	{#if ui.recovery === 'remote-changes' && status}
		<div class="sync-block">
			<div class="diverged-head">
				<div>
					<div class="panel-title">{recoveryCopy?.title}</div>
					<div class="panel-subtitle">{recoveryCopy?.subtitle}</div>
				</div>
				<span class="badge">{recoveryCopy?.badge}</span>
			</div>
			<p>
				{recoveryCopy?.body}
			</p>
			<div class="panel-actions">
				<button class="action-btn primary" onclick={() => run('pull', () => api.pullSync(vaultId))} disabled={!ui.canPull}>Pull now</button>
				<button class="action-btn" onclick={loadStatus} disabled={ui.isBusy}>Refresh</button>
			</div>
			{@render commandBlock(resolutionCommands)}
		</div>
	{/if}

	{#if ui.recovery === 'conflicts' && status}
		<div class="sync-block danger-block">
			<div class="diverged-head">
				<div>
					<div class="panel-title">{recoveryCopy?.title}</div>
					<div class="panel-subtitle">{recoveryCopy?.subtitle}</div>
				</div>
				<span class="badge">{recoveryCopy?.badge}</span>
			</div>
			<ul class="file-list">
				{#each status.conflicted as file (file)}
					<li class="mono">{file}</li>
				{/each}
			</ul>
			{@render commandBlock(resolutionCommands)}
		</div>
	{/if}

	{#if ui.recovery === 'diverged' && status}
		<div class="sync-block diverged-panel">
			<div class="diverged-head">
				<div>
					<div class="panel-title">{recoveryCopy?.title}</div>
					<div class="panel-subtitle">{recoveryCopy?.subtitle}</div>
				</div>
				<span class="badge">{recoveryCopy?.badge}</span>
			</div>
			<p>
				{recoveryCopy?.body}
			</p>
			<div class="panel-actions">
				<button class="action-btn" onclick={loadStatus} disabled={ui.isBusy}>Refresh after resolve</button>
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

	{#if message}
		<div class="ok-msg">{message}</div>
	{/if}
	{#if error}
		<div class="err">{error}</div>
	{/if}
</section>

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
		margin: 10px 0;
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
	.diverged-head {
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
	.diverged-panel p {
		color: var(--fg-muted);
		font-size: 0.8rem;
		line-height: 1.45;
		margin: 10px 0;
	}
	.sync-block p {
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
		.change-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
