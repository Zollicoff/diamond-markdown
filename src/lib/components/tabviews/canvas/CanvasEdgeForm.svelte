<script lang="ts">
	import type { CanvasNodeOption } from '$lib/canvas/view';

	interface Props {
		nodeOptions: CanvasNodeOption[];
		fromNodeId: string;
		toNodeId: string;
		label: string;
		adding: boolean;
		canAdd: boolean;
		onFromNodeChange: (nodeId: string) => void;
		onToNodeChange: (nodeId: string) => void;
		onLabelChange: (label: string) => void;
		onSubmit: () => void | Promise<void>;
	}

	let {
		nodeOptions,
		fromNodeId,
		toNodeId,
		label,
		adding,
		canAdd,
		onFromNodeChange,
		onToNodeChange,
		onLabelChange,
		onSubmit
	}: Props = $props();
</script>

<form
	class="edge-form"
	onsubmit={(event) => {
		event.preventDefault();
		void onSubmit();
	}}
>
	<select
		class="mini edge-select"
		aria-label="Canvas edge source"
		value={fromNodeId}
		disabled={adding || nodeOptions.length < 2}
		onchange={(event) => onFromNodeChange(event.currentTarget.value)}
	>
		{#each nodeOptions as option (option.id)}
			<option value={option.id}>{option.label}</option>
		{/each}
	</select>
	<span class="edge-arrow" aria-hidden="true">→</span>
	<select
		class="mini edge-select"
		aria-label="Canvas edge target"
		value={toNodeId}
		disabled={adding || nodeOptions.length < 2}
		onchange={(event) => onToNodeChange(event.currentTarget.value)}
	>
		{#each nodeOptions as option (option.id)}
			<option value={option.id}>{option.label}</option>
		{/each}
	</select>
	<input
		class="mini edge-label-input"
		aria-label="Canvas edge label"
		placeholder="label"
		value={label}
		disabled={adding || nodeOptions.length < 2}
		oninput={(event) => onLabelChange(event.currentTarget.value)}
	/>
	<button class="mini" disabled={!canAdd}>{adding ? 'Connecting...' : 'Connect'}</button>
</form>

<style>
	.edge-form {
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
	.edge-select {
		max-width: 150px;
		background: var(--bg);
	}
	.edge-label-input {
		width: 82px;
		background: var(--bg);
	}
	.edge-label-input::placeholder {
		color: var(--fg-dim);
	}
	.edge-arrow {
		color: var(--fg-dim);
		font-size: 0.72rem;
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
		.edge-form {
			width: 100%;
			flex-wrap: wrap;
		}
	}
</style>
