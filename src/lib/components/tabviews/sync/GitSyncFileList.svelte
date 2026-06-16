<script lang="ts">
	import type { GitSyncFileListItem } from '$lib/sync/recovery-view';

	interface Props {
		items: GitSyncFileListItem[];
		empty: string;
		boxed?: boolean;
		danger?: boolean;
	}

	let { items, empty, boxed = false, danger = false }: Props = $props();
</script>

{#if items.length > 0}
	<ul class="change-list" class:boxed class:danger>
		{#each items as item (item.path)}
			<li class="mono" title={item.title}>
				{#if item.statusCode}
					<span class="status-code">{item.statusCode}</span>
				{/if}
				<span>{item.path}</span>
			</li>
		{/each}
	</ul>
{:else}
	<div class="empty">{empty}</div>
{/if}

<style>
	.change-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 3px;
	}
	.change-list.boxed {
		margin: 10px 0;
		padding: 8px 12px 8px 26px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
	}
	.change-list.danger {
		color: var(--danger);
	}
	.change-list li {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.72rem;
		color: inherit;
	}
	.status-code {
		display: inline-block;
		min-width: 3ch;
		margin-right: 6px;
		color: var(--fg-muted);
	}
	.empty {
		color: var(--fg-dim);
		font-size: 0.72rem;
	}
	.mono { font-family: var(--mono); }
</style>
