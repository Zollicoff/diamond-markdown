<script lang="ts">
	import { api } from '$lib/vault-api';
	import type { CanvasDoc, CanvasNode } from '$lib/types';
	import { emit } from '$lib/events';
	import {
		canvasBounds,
		canvasDraftChanged,
		canvasDraftFor,
		canvasNodePositionChanged,
		canvasNodesWithPosition,
		canvasSummary,
		canvasTextDrafts,
		edgeLines,
		type CanvasTextDrafts
	} from '$lib/canvas/view';
	import CanvasNodeCard from './canvas/CanvasNodeCard.svelte';

	interface Props {
		vaultId: string;
		path: string;
	}

	let { vaultId, path }: Props = $props();

	let doc = $state<CanvasDoc | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let textDrafts = $state<CanvasTextDrafts>({});
	let addingText = $state(false);
	let savingNodeId = $state<string | null>(null);
	let movingNodeId = $state<string | null>(null);
	let moveSavingNodeId = $state<string | null>(null);
	let dragState = $state<{
		nodeId: string;
		pointerId: number;
		startClientX: number;
		startClientY: number;
		originX: number;
		originY: number;
		currentX: number;
		currentY: number;
	} | null>(null);

	const displayNodes = $derived(canvasNodesWithPosition(
		doc?.nodes ?? [],
		dragState ? { nodeId: dragState.nodeId, x: dragState.currentX, y: dragState.currentY } : null
	));
	const displayDoc = $derived(doc ? { ...doc, nodes: displayNodes } : null);
	const bounds = $derived(canvasBounds(displayNodes));
	const lines = $derived(displayDoc ? edgeLines(displayDoc, bounds) : []);
	const exportHref = $derived(`/api/vaults/${vaultId}/canvas/export?path=${encodeURIComponent(path)}`);
	const exportName = $derived(`${path.split('/').pop()?.replace(/\.canvas$/i, '') || 'canvas'}.svg`);

	function setDoc(next: CanvasDoc): void {
		doc = next;
		textDrafts = canvasTextDrafts(next.nodes);
	}

	function setDraft(node: CanvasNode, value: string): void {
		textDrafts = { ...textDrafts, [node.id]: value };
	}

	async function addTextNode(): Promise<void> {
		if (!doc || addingText) return;
		addingText = true;
		error = null;
		try {
			const res = await api.addCanvasTextNode(vaultId, path, doc.revision);
			setDoc(res.doc);
			emit('toast:show', { title: 'Text card added', tone: 'success' });
		} catch (e) {
			error = (e as Error).message;
		} finally {
			addingText = false;
		}
	}

	async function saveTextNode(node: CanvasNode): Promise<void> {
		if (!doc || savingNodeId || !canvasDraftChanged(node, textDrafts)) return;
		savingNodeId = node.id;
		error = null;
		try {
			const res = await api.updateCanvasTextNode(vaultId, path, node.id, canvasDraftFor(node, textDrafts), doc.revision);
			setDoc(res.doc);
			emit('toast:show', { title: 'Text card saved', tone: 'success' });
		} catch (e) {
			error = (e as Error).message;
		} finally {
			savingNodeId = null;
		}
	}

	function cleanupDragListeners(): void {
		window.removeEventListener('pointermove', moveNodePointer);
		window.removeEventListener('pointerup', handleMovePointerUp);
		window.removeEventListener('pointercancel', handleMovePointerCancel);
	}

	function moveNodePointer(event: PointerEvent): void {
		if (!dragState || event.pointerId !== dragState.pointerId) return;
		dragState = {
			...dragState,
			currentX: Math.round(dragState.originX + event.clientX - dragState.startClientX),
			currentY: Math.round(dragState.originY + event.clientY - dragState.startClientY)
		};
	}

	async function finishMovePointer(event: PointerEvent): Promise<void> {
		if (!dragState || event.pointerId !== dragState.pointerId) return;
		const finished = dragState;
		cleanupDragListeners();
		dragState = null;
		movingNodeId = null;

		const node = doc?.nodes.find((candidate) => candidate.id === finished.nodeId);
		if (!doc || !node || !canvasNodePositionChanged(node, finished.currentX, finished.currentY)) return;

		moveSavingNodeId = node.id;
		error = null;
		try {
			const res = await api.moveCanvasNode(
				vaultId,
				path,
				node.id,
				finished.currentX,
				finished.currentY,
				doc.revision
			);
			setDoc(res.doc);
			emit('toast:show', { title: 'Canvas node moved', tone: 'success' });
		} catch (e) {
			error = (e as Error).message;
		} finally {
			moveSavingNodeId = null;
		}
	}

	function handleMovePointerUp(event: PointerEvent): void {
		void finishMovePointer(event);
	}

	function handleMovePointerCancel(event: PointerEvent): void {
		if (!dragState || event.pointerId !== dragState.pointerId) return;
		cleanupDragListeners();
		dragState = null;
		movingNodeId = null;
	}

	function startMoveNode(node: CanvasNode, event: PointerEvent): void {
		if (!doc || moveSavingNodeId) return;
		event.preventDefault();
		movingNodeId = node.id;
		dragState = {
			nodeId: node.id,
			pointerId: event.pointerId,
			startClientX: event.clientX,
			startClientY: event.clientY,
			originX: node.x,
			originY: node.y,
			currentX: node.x,
			currentY: node.y
		};
		window.addEventListener('pointermove', moveNodePointer);
		window.addEventListener('pointerup', handleMovePointerUp);
		window.addEventListener('pointercancel', handleMovePointerCancel);
	}

	$effect(() => {
		const currentPath = path;
		let alive = true;
		cleanupDragListeners();
		dragState = null;
		movingNodeId = null;
		loading = true;
		error = null;
		doc = null;
		api.canvas(vaultId, currentPath)
			.then((loaded) => {
				if (!alive || currentPath !== path) return;
				setDoc(loaded);
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

	$effect(() => cleanupDragListeners);
</script>

<section class="canvas-view">
	<header class="canvas-head">
		<div>
			<h2>{doc?.title ?? path.split('/').pop()?.replace(/\.canvas$/i, '') ?? 'Canvas'}</h2>
			<p class="mono">{path}</p>
		</div>
		{#if doc}
			<div class="canvas-actions">
				<div class="canvas-stats mono">{canvasSummary(doc)} · editable text cards</div>
				<button class="mini" disabled={addingText} onclick={addTextNode}>
					{addingText ? 'Adding…' : 'Add text'}
				</button>
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

				{#each displayNodes as node (node.id)}
					<CanvasNodeCard
						{node}
						{bounds}
						draft={canvasDraftFor(node, textDrafts)}
						changed={canvasDraftChanged(node, textDrafts)}
						saving={savingNodeId === node.id}
						moving={movingNodeId === node.id || moveSavingNodeId === node.id}
						onDraftChange={setDraft}
						onSave={saveTextNode}
						onMovePointerDown={startMoveNode}
					/>
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
	.mini:disabled {
		cursor: not-allowed;
		opacity: 0.55;
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
