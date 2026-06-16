<script lang="ts">
	interface Props {
		zoomLabel: string;
		canZoomIn: boolean;
		canZoomOut: boolean;
		onZoomIn: () => void;
		onZoomOut: () => void;
		onZoomReset: () => void;
		onZoomFit: () => void;
	}

	let {
		zoomLabel,
		canZoomIn,
		canZoomOut,
		onZoomIn,
		onZoomOut,
		onZoomReset,
		onZoomFit
	}: Props = $props();
</script>

<div class="canvas-zoom-controls" role="group" aria-label="Canvas zoom controls">
	<button type="button" aria-label="Zoom out Canvas" title="Zoom out" disabled={!canZoomOut} onclick={onZoomOut}>-</button>
	<span class="zoom-value" aria-label="Canvas zoom level">{zoomLabel}</span>
	<button type="button" aria-label="Zoom in Canvas" title="Zoom in" disabled={!canZoomIn} onclick={onZoomIn}>+</button>
	<button type="button" aria-label="Fit Canvas to viewport" title="Fit to viewport" onclick={onZoomFit}>Fit</button>
	<button type="button" aria-label="Reset Canvas zoom" title="Reset zoom" onclick={onZoomReset}>1:1</button>
</div>

<style>
	.canvas-zoom-controls {
		position: sticky;
		top: 10px;
		left: 10px;
		z-index: 5;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin: 10px;
		padding: 4px;
		border: 1px solid var(--border);
		border-radius: 7px;
		background: color-mix(in srgb, var(--bg-elev), transparent 8%);
		box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
	}
	.canvas-zoom-controls button {
		min-width: 30px;
		height: 28px;
		border: 1px solid transparent;
		border-radius: 5px;
		padding: 0 8px;
		background: transparent;
		color: var(--fg-muted);
		font: inherit;
		font-size: 0.75rem;
		cursor: pointer;
	}
	.canvas-zoom-controls button:hover:not(:disabled),
	.canvas-zoom-controls button:focus-visible {
		border-color: var(--accent);
		color: var(--accent);
		outline: none;
	}
	.canvas-zoom-controls button:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}
	.zoom-value {
		min-width: 44px;
		color: var(--fg-dim);
		font-family: var(--mono);
		font-size: 0.72rem;
		text-align: center;
	}
</style>
