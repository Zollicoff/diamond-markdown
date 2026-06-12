<script lang="ts">
	import {
		canvasAddNodeButtonLabel,
		canvasAddNodePlaceholder,
		canSubmitCanvasAddNode,
		type CanvasAddNodeType
	} from '$lib/canvas/view';

	interface Props {
		adding: boolean;
		onAdd: (type: CanvasAddNodeType, value: string) => void | Promise<void>;
	}

	let { adding, onAdd }: Props = $props();
	let nodeType = $state<CanvasAddNodeType>('text');
	let value = $state('');
	const canSubmit = $derived(!adding && canSubmitCanvasAddNode(nodeType, value));

	async function submit(): Promise<void> {
		if (!canSubmit) return;
		await onAdd(nodeType, value);
		value = '';
	}
</script>

<form
	class="add-node-form"
	onsubmit={(event) => {
		event.preventDefault();
		void submit();
	}}
>
	<select class="mini node-type-select" aria-label="Canvas node type" bind:value={nodeType} disabled={adding}>
		<option value="text">Text</option>
		<option value="file">File</option>
		<option value="link">URL</option>
	</select>
	<input
		class="mini node-value-input"
		aria-label="Canvas node value"
		placeholder={canvasAddNodePlaceholder(nodeType)}
		bind:value
		disabled={adding}
	/>
	<button class="mini" disabled={!canSubmit}>
		{adding ? 'Adding...' : canvasAddNodeButtonLabel(nodeType)}
	</button>
</form>

<style>
	.add-node-form {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
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
	.node-type-select {
		background: var(--bg);
	}
	.node-value-input {
		width: 150px;
		min-width: 96px;
		background: var(--bg);
	}
	.node-value-input::placeholder {
		color: var(--fg-dim);
	}
	.mini:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}
	.mini:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	@media (max-width: 900px) {
		.add-node-form {
			width: 100%;
			flex-wrap: wrap;
		}
		.node-value-input {
			flex: 1 1 160px;
		}
	}
</style>
