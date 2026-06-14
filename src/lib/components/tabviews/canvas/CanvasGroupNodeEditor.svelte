<script lang="ts">
	import type { CanvasNode } from '$lib/types';
	import { canvasNodeTitle } from '$lib/canvas/view';

	interface Props {
		node: CanvasNode;
		groupLabelDraft: string;
		groupLabelChanged: boolean;
		groupLabelCanSave: boolean;
		saving: boolean;
		deleting: boolean;
		disableDelete: boolean;
		onGroupLabelDraftChange: (node: CanvasNode, value: string) => void;
		onSaveGroupLabel: (node: CanvasNode) => void | Promise<void>;
		onDelete: (node: CanvasNode) => void | Promise<void>;
	}

	let {
		node,
		groupLabelDraft,
		groupLabelChanged,
		groupLabelCanSave,
		saving,
		deleting,
		disableDelete,
		onGroupLabelDraftChange,
		onSaveGroupLabel,
		onDelete
	}: Props = $props();

	const title = $derived(canvasNodeTitle(node));
</script>

<input
	class="group-label-input"
	aria-label={`Canvas group label for ${title}`}
	value={groupLabelDraft}
	placeholder="Group label"
	oninput={(event) => onGroupLabelDraftChange(node, (event.currentTarget as HTMLInputElement).value)}
/>
<div class="group-fill"></div>
<div class="node-actions group-actions">
	<button
		class="mini node-save"
		disabled={saving || !groupLabelCanSave}
		onclick={() => void onSaveGroupLabel(node)}
	>
		{saving ? 'Saving...' : groupLabelChanged ? 'Save label' : 'Saved'}
	</button>
	<button
		class="mini node-remove"
		aria-label={`Remove canvas node ${title}`}
		disabled={disableDelete}
		onclick={() => void onDelete(node)}
	>
		{deleting ? 'Removing...' : 'Remove'}
	</button>
</div>

<style>
	.group-label-input {
		width: 100%;
		border: 1px solid var(--border);
		border-color: color-mix(in srgb, var(--canvas-node-border, var(--border)), transparent 25%);
		border-radius: 6px;
		padding: 5px 7px;
		background: color-mix(in srgb, var(--bg), transparent 18%);
		color: var(--fg-muted);
		font: inherit;
		font-size: 0.76rem;
	}
	.group-label-input:focus {
		outline: 2px solid color-mix(in srgb, var(--accent), transparent 60%);
		border-color: var(--accent);
	}
	.node-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		justify-content: flex-end;
	}
	.group-fill {
		flex: 1;
		min-height: 0;
	}
	.group-actions {
		justify-content: flex-start;
	}
	.node-save,
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
