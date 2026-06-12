<script lang="ts">
	import { api } from '$lib/vault-api';
	import type { CanvasDoc, CanvasNode } from '$lib/types';
	import {
		canvasBounds,
		canvasNodeBody,
		canvasNodeTitle,
		canvasSummary,
		edgeLines,
		nodeStyle
	} from '$lib/canvas/view';

	interface Props {
		vaultId: string;
		path: string;
	}

	let { vaultId, path }: Props = $props();

	let doc = $state<CanvasDoc | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);

	const bounds = $derived(canvasBounds(doc?.nodes ?? []));
	const lines = $derived(doc ? edgeLines(doc, bounds) : []);
	const exportHref = $derived(`/api/vaults/${vaultId}/canvas/export?path=${encodeURIComponent(path)}`);
	const exportName = $derived(`${path.split('/').pop()?.replace(/\.canvas$/i, '') || 'canvas'}.svg`);

	function nodeClass(node: CanvasNode): string {
		return `canvas-node canvas-node-${node.type.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase() || 'unknown'}`;
	}

	$effect(() => {
		const currentPath = path;
		let alive = true;
		loading = true;
		error = null;
		doc = null;
		api.canvas(vaultId, currentPath)
			.then((loaded) => {
				if (!alive || currentPath !== path) return;
				doc = loaded;
			})
			.catch((e) => {
				if (!alive || currentPath !== path) return;
				error = (e as Error).message;
			})
			.finally(() => {
				if (!alive || currentPath !== path) return;
				loading = false;
			});
		return () => { alive = false; };
	});
</script>

<section class="canvas-view">
	<header class="canvas-head">
		<div>
			<h2>{doc?.title ?? path.split('/').pop()?.replace(/\.canvas$/i, '') ?? 'Canvas'}</h2>
			<p class="mono">{path}</p>
		</div>
		{#if doc}
			<div class="canvas-actions">
				<div class="canvas-stats mono">{canvasSummary(doc)} · read-only</div>
				<a class="mini" href={exportHref} download={exportName}>Download SVG</a>
			</div>
		{/if}
	</header>

	{#if loading}
		<div class="state">Loading Canvas…</div>
	{:else if error}
		<div class="state error">{error}</div>
	{:else if doc && doc.nodes.length === 0}
		<div class="state">This Canvas has no readable nodes yet.</div>
	{:else if doc}
		{#if doc.warnings.length > 0}
			<ul class="warnings">
				{#each doc.warnings as warning}
					<li>{warning}</li>
				{/each}
			</ul>
		{/if}
		<div class="canvas-scroll">
			<div class="canvas-board" style={`width: ${bounds.width}px; height: ${bounds.height}px;`}>
				<svg class="edge-layer" width={bounds.width} height={bounds.height} aria-hidden="true">
					{#each lines as line (line.edge.id)}
						<line
							x1={line.x1}
							y1={line.y1}
							x2={line.x2}
							y2={line.y2}
							class="edge"
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

				{#each doc.nodes as node (node.id)}
					<article class={nodeClass(node)} style={nodeStyle(node, bounds)}>
						<div class="node-type">{node.type}</div>
						<h3 title={canvasNodeTitle(node)}>{canvasNodeTitle(node)}</h3>
						{#if canvasNodeBody(node)}
							<p>{canvasNodeBody(node)}</p>
						{:else}
							<p class="empty">No preview content</p>
						{/if}
					</article>
				{/each}
			</div>
		</div>
	{/if}
</section>

<style>
	.canvas-view {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		background: var(--bg);
	}
	.canvas-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 10px 14px;
		border-bottom: 1px solid var(--border);
	}
	h2 {
		margin: 0;
		font-family: 'Bricolage Grotesque', var(--sans);
		font-size: 0.96rem;
	}
	.canvas-head p {
		margin: 3px 0 0;
		color: var(--fg-dim);
		font-size: 0.72rem;
	}
	.canvas-stats {
		color: var(--fg-dim);
		font-size: 0.72rem;
		white-space: nowrap;
	}
	.canvas-actions {
		display: flex;
		align-items: center;
		gap: 10px;
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
	.canvas-scroll {
		flex: 1;
		min-height: 0;
		overflow: auto;
		background:
			linear-gradient(var(--border) 1px, transparent 1px),
			linear-gradient(90deg, var(--border) 1px, transparent 1px),
			var(--bg);
		background-size: 36px 36px;
	}
	.canvas-board {
		position: relative;
		min-width: 100%;
		min-height: 100%;
	}
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
	.edge-label {
		fill: var(--fg-dim);
		font-family: var(--mono);
		font-size: 11px;
		paint-order: stroke;
		stroke: var(--bg);
		stroke-width: 4px;
		stroke-linejoin: round;
	}
	.canvas-node {
		position: absolute;
		display: flex;
		flex-direction: column;
		gap: 6px;
		overflow: hidden;
		padding: 12px;
		border: 1px solid var(--border-strong);
		border-radius: 7px;
		background: color-mix(in srgb, var(--bg-elev), var(--bg) 20%);
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.22);
	}
	.canvas-node-text {
		border-color: color-mix(in srgb, var(--accent), var(--border-strong) 70%);
	}
	.canvas-node-file {
		border-style: dashed;
	}
	.canvas-node-link {
		border-color: color-mix(in srgb, var(--brand-cyan), var(--border-strong) 60%);
	}
	.node-type {
		align-self: flex-start;
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 1px 7px;
		color: var(--fg-dim);
		font-family: var(--mono);
		font-size: 0.65rem;
		text-transform: uppercase;
	}
	h3 {
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.86rem;
	}
	.canvas-node p {
		margin: 0;
		overflow: hidden;
		color: var(--fg-muted);
		font-size: 0.78rem;
		line-height: 1.35;
		white-space: pre-wrap;
	}
	.canvas-node p.empty {
		color: var(--fg-dim);
		font-style: italic;
	}
	.warnings {
		margin: 0;
		padding: 8px 14px 8px 28px;
		border-bottom: 1px solid color-mix(in srgb, var(--warning, #fbbf24), var(--border) 70%);
		background: color-mix(in srgb, var(--warning, #fbbf24), transparent 92%);
		color: var(--fg-muted);
		font-size: 0.78rem;
	}
	.state {
		display: grid;
		place-items: center;
		height: 100%;
		color: var(--fg-dim);
		font-size: 0.88rem;
	}
	.state.error {
		color: var(--danger);
		padding: 20px;
		text-align: center;
	}
	.mono {
		font-family: var(--mono);
		font-variant-numeric: tabular-nums;
	}
</style>
