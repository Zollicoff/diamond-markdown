<script lang="ts">
	import type { AttachmentRef } from '$lib/types';
	import { formatAttachmentSize } from '$lib/note/attachments';

	interface Props {
		loading: boolean;
		error: string | null;
		visible: AttachmentRef[];
		selectedPathSet: ReadonlySet<string>;
		onTogglePath: (path: string) => void;
		onInsertPath: (path: string) => void | Promise<void>;
	}

	let {
		loading,
		error,
		visible,
		selectedPathSet,
		onTogglePath,
		onInsertPath
	}: Props = $props();
</script>

{#if loading}
	<div class="state">Loading attachments...</div>
{:else if error}
	<div class="state error">{error}</div>
{:else if visible.length === 0}
	<div class="state">No matching attachments.</div>
{:else}
	<div class="list" role="listbox" aria-label="Vault attachments" tabindex="0">
		{#each visible as attachment (attachment.path)}
			<button
				type="button"
				class="row"
				class:selected={selectedPathSet.has(attachment.path)}
				role="option"
				aria-selected={selectedPathSet.has(attachment.path)}
				onclick={() => onTogglePath(attachment.path)}
				ondblclick={() => void onInsertPath(attachment.path)}
			>
				<span class="check" aria-hidden="true">{selectedPathSet.has(attachment.path) ? '✓' : ''}</span>
				<span class="kind">{attachment.kind}</span>
				<span class="main">
					<span class="name">{attachment.filename}</span>
					<span class="path mono">{attachment.path}</span>
				</span>
				<span class="size mono">{formatAttachmentSize(attachment.size)}</span>
			</button>
		{/each}
	</div>
{/if}

<style>
	.list {
		margin: 10px 16px 0;
		border: 1px solid var(--border);
		border-radius: 7px;
		overflow: auto;
		min-height: 120px;
		max-height: 380px;
	}
	.row {
		width: 100%;
		display: grid;
		grid-template-columns: 22px 58px minmax(0, 1fr) auto;
		align-items: center;
		gap: 10px;
		border: 0;
		border-bottom: 1px solid var(--border);
		background: transparent;
		color: var(--fg);
		text-align: left;
		padding: 9px 10px;
		cursor: pointer;
	}
	.row:last-child {
		border-bottom: 0;
	}
	.row:hover,
	.row.selected {
		background: var(--bg-hover);
	}
	.check {
		width: 16px;
		height: 16px;
		display: grid;
		place-items: center;
		border: 1px solid var(--border);
		border-radius: 4px;
		color: var(--accent);
		font-size: 0.72rem;
		font-weight: 700;
	}
	.kind {
		border: 1px solid var(--border);
		border-radius: 999px;
		color: var(--fg-dim);
		font-size: 0.64rem;
		text-transform: uppercase;
		text-align: center;
		padding: 2px 5px;
	}
	.main {
		min-width: 0;
		display: grid;
		gap: 2px;
	}
	.name,
	.path {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.name {
		font-size: 0.84rem;
	}
	.path,
	.size {
		color: var(--fg-dim);
		font-size: 0.7rem;
	}
	.state {
		display: grid;
		place-items: center;
		min-height: 160px;
		color: var(--fg-dim);
		font-size: 0.84rem;
	}
	.state.error {
		color: var(--danger);
	}
	.mono {
		font-family: var(--mono);
	}

	@media (max-width: 640px) {
		.row {
			grid-template-columns: 22px 52px minmax(0, 1fr);
		}
		.size {
			display: none;
		}
	}
</style>
