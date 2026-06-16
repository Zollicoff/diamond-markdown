<script lang="ts">
	import {
		canvasEdgeMarkerId,
		canvasEdgeMarkerStyle,
		canvasEdgeMarkerUrl,
		canvasEdgeStyle,
		type CanvasBounds,
		type CanvasEdgeLine
	} from '$lib/canvas/view';

	interface Props {
		bounds: CanvasBounds;
		lines: CanvasEdgeLine[];
	}

	let { bounds, lines }: Props = $props();
</script>

<svg class="edge-layer" width={bounds.width} height={bounds.height} aria-hidden="true">
	<defs>
		{#each lines as line (line.edge.id)}
			{#if canvasEdgeMarkerUrl(line.edge, 'from')}
				<marker
					id={canvasEdgeMarkerId(line.edge, 'from')}
					viewBox="0 0 8 8"
					refX="7"
					refY="4"
					markerWidth="6"
					markerHeight="6"
					orient="auto-start-reverse"
					markerUnits="strokeWidth"
				>
					<path class="edge-marker" style={canvasEdgeMarkerStyle(line.edge)} d="M 0 0 L 8 4 L 0 8 z" />
				</marker>
			{/if}
			{#if canvasEdgeMarkerUrl(line.edge, 'to')}
				<marker
					id={canvasEdgeMarkerId(line.edge, 'to')}
					viewBox="0 0 8 8"
					refX="7"
					refY="4"
					markerWidth="6"
					markerHeight="6"
					orient="auto-start-reverse"
					markerUnits="strokeWidth"
				>
					<path class="edge-marker" style={canvasEdgeMarkerStyle(line.edge)} d="M 0 0 L 8 4 L 0 8 z" />
				</marker>
			{/if}
		{/each}
	</defs>
	{#each lines as line (line.edge.id)}
		<line
			x1={line.x1}
			y1={line.y1}
			x2={line.x2}
			y2={line.y2}
			class="edge"
			style={canvasEdgeStyle(line.edge)}
			marker-start={canvasEdgeMarkerUrl(line.edge, 'from')}
			marker-end={canvasEdgeMarkerUrl(line.edge, 'to')}
		/>
		{#if line.edge.label}
			<text
				x={(line.x1 + line.x2) / 2}
				y={(line.y1 + line.y2) / 2 - 6}
				class="edge-label"
			>{line.edge.label}</text>
		{/if}
	{/each}
</svg>

<style>
	.edge-layer {
		position: absolute;
		inset: 0;
		pointer-events: none;
		overflow: visible;
	}
	.edge {
		stroke: var(--border-strong);
		stroke-width: 2;
		opacity: 0.75;
	}
	.edge-marker {
		fill: var(--border-strong);
	}
	.edge-label {
		fill: var(--fg-dim);
		font-family: var(--mono);
		font-size: 11px;
		paint-order: stroke;
		stroke: var(--bg);
		stroke-width: 4px;
		stroke-linejoin: round;
	}
</style>
