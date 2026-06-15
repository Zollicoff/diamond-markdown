<script lang="ts">
	import CanvasNodeRemoveButton from './CanvasNodeRemoveButton.svelte';

	interface Props {
		title: string;
		body: string;
		deleting: boolean;
		disableDelete: boolean;
		onDelete: () => void | Promise<void>;
	}

	let { title, body, deleting, disableDelete, onDelete }: Props = $props();
</script>

{#if body}
	<p>{body}</p>
{:else}
	<p class="empty">No preview content</p>
{/if}
<div class="node-actions">
	<CanvasNodeRemoveButton {title} {deleting} {disableDelete} onRemove={onDelete} />
</div>

<style>
	p {
		margin: 0;
		overflow: hidden;
		color: var(--fg-muted);
		font-size: 0.78rem;
		line-height: 1.35;
		white-space: pre-wrap;
	}
	p.empty {
		color: var(--fg-dim);
		font-style: italic;
	}
	.node-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		justify-content: flex-end;
	}
</style>
