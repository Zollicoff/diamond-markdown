<script lang="ts">
	import type { GitSyncStatus } from '$lib/types';
	import type { GitSyncRecoveryCopy } from '$lib/sync/recovery';
	import type { GitSyncRecoveryKind } from '$lib/sync/status';
	import {
		buildGitSyncDivergedSections,
		buildGitSyncLocalChangeItems,
		buildGitSyncPathItems
	} from '$lib/sync/recovery-view';
	import GitSyncCommandBlock from './GitSyncCommandBlock.svelte';
	import GitSyncFileList from './GitSyncFileList.svelte';
	import GitSyncRecoveryHeader from './GitSyncRecoveryHeader.svelte';

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

	const localChangeItems = $derived(buildGitSyncLocalChangeItems(status?.files ?? []));
	const conflictItems = $derived(buildGitSyncPathItems(status?.conflicted ?? []));
	const divergedSections = $derived.by(() => status ? buildGitSyncDivergedSections(status) : []);
</script>

{#if recovery === 'setup' && copy}
	<div class="sync-block">
		<GitSyncRecoveryHeader {copy} />
		<GitSyncCommandBlock commands={setupCommands} />
	</div>
{/if}

{#if recovery === 'remote-changes' && status && copy}
	<div class="sync-block">
		<GitSyncRecoveryHeader {copy} />
		<p>{copy.body}</p>
		<div class="panel-actions">
			<button class="action-btn primary" onclick={onPull} disabled={!canPull}>Pull now</button>
			<button class="action-btn" onclick={onRefresh} disabled={isBusy}>Refresh</button>
		</div>
		<GitSyncCommandBlock commands={resolutionCommands} />
	</div>
{/if}

{#if recovery === 'local-changes' && status && copy}
	<div class="sync-block">
		<GitSyncRecoveryHeader {copy} />
		<p>{copy.body}</p>
		<div class="panel-actions">
			<button class="action-btn" onclick={onRefresh} disabled={isBusy}>Refresh after commit or stash</button>
		</div>
		<GitSyncCommandBlock commands={resolutionCommands} />
		<div class="change-box local local-files">
			<h3>Uncommitted files</h3>
			<GitSyncFileList items={localChangeItems} empty="No uncommitted files reported." />
		</div>
	</div>
{/if}

{#if recovery === 'conflicts' && status && copy}
	<div class="sync-block danger-block">
		<GitSyncRecoveryHeader {copy} />
		<GitSyncFileList items={conflictItems} empty="No conflicted files reported." boxed danger />
		<GitSyncCommandBlock commands={resolutionCommands} />
	</div>
{/if}

{#if recovery === 'diverged' && status && copy}
	<div class="sync-block diverged-panel">
		<GitSyncRecoveryHeader {copy} />
		<p>{copy.body}</p>
		<div class="panel-actions">
			<button class="action-btn" onclick={onRefresh} disabled={isBusy}>Refresh after resolve</button>
		</div>
		<GitSyncCommandBlock commands={resolutionCommands} />

		<div class="change-grid">
			{#each divergedSections as section (section.id)}
				<div class="change-box" class:local={section.tone === 'local'} class:remote={section.tone === 'remote'} class:overlap={section.tone === 'overlap'} class:hot={section.hot}>
					<h3>{section.title}</h3>
					<GitSyncFileList items={section.items} empty={section.empty} />
				</div>
			{/each}
		</div>
	</div>
{/if}

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
	.local-files {
		margin-top: 10px;
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

	@media (max-width: 760px) {
		.change-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
