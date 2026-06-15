<script lang="ts">
	interface Props {
		title: string;
		deleting: boolean;
		disableDelete: boolean;
		onRemove: () => void | Promise<void>;
	}

	let { title, deleting, disableDelete, onRemove }: Props = $props();
</script>

<button
	class="mini node-remove"
	aria-label={`Remove canvas node ${title}`}
	disabled={disableDelete}
	onclick={() => void onRemove()}
>
	{deleting ? 'Removing...' : 'Remove'}
</button>

<style>
	.node-remove {
		padding: 2px 7px;
		font-size: 0.7rem;
	}
	.mini {
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 3px 9px;
		color: var(--fg-muted);
		font: inherit;
		font-size: 0.76rem;
		text-decoration: none;
		white-space: nowrap;
	}
	.mini:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	.mini:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}
</style>
