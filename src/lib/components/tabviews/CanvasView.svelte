<script lang="ts">
	import { api } from '$lib/vault-api';
	import type { CanvasDoc, CanvasNode } from '$lib/types';
	import { emit } from '$lib/events';
	import { openCanvas, openNote } from '$lib/workspace/actions';
	import {
		canvasBounds,
		canvasConnectionDraft,
		canvasDraftChanged,
		canvasDraftFor,
		canvasEdgeLabelChanged,
		canvasEdgeLabelDraftFor,
		canvasEdgeLabelDrafts,
		canvasGroupLabelDraftFor,
		canvasGroupLabelDrafts,
		canConnectCanvasNodes,
		canSaveCanvasGroupLabel,
		canvasEdgeSummaries,
		canvasNodePositionChanged,
		canvasNodeOptions,
		canvasFileOpenTarget,
		canvasNodeRefDraftFor,
		canvasNodeRefDrafts,
		canvasNodesWithPosition,
		canvasTextDrafts,
		canSaveCanvasNodeRefDraft,
		edgeLines,
		type CanvasAddNodeType,
		type CanvasEdgeLabelDrafts,
		type CanvasGroupLabelDrafts,
		type CanvasNodeRefDraft,
		type CanvasNodeRefDrafts,
		type CanvasEdgeSummary,
		type CanvasTextDrafts
	} from '$lib/canvas/view';
	import {
		canvasNodeDragPosition,
		createCanvasNodeDragState,
		isCanvasNodeDragPointer,
		updateCanvasNodeDragState,
		type CanvasNodeDragState
	} from '$lib/canvas/drag';
	import CanvasHeader from './canvas/CanvasHeader.svelte';
	import CanvasStage from './canvas/CanvasStage.svelte';

	interface Props {
		vaultId: string;
		path: string;
	}

	let { vaultId, path }: Props = $props();

	let doc = $state<CanvasDoc | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let textDrafts = $state<CanvasTextDrafts>({});
	let groupLabelDrafts = $state<CanvasGroupLabelDrafts>({});
	let refDrafts = $state<CanvasNodeRefDrafts>({});
	let addingNode = $state(false);
	let addingEdge = $state(false);
	let savingNodeId = $state<string | null>(null);
	let movingNodeId = $state<string | null>(null);
	let moveSavingNodeId = $state<string | null>(null);
	let deletingNodeId = $state<string | null>(null);
	let savingEdgeId = $state<string | null>(null);
	let deletingEdgeId = $state<string | null>(null);
	let edgeLabelDrafts = $state<CanvasEdgeLabelDrafts>({});
	let edgeFromNodeId = $state('');
	let edgeToNodeId = $state('');
	let edgeLabel = $state('');
	let dragState = $state<CanvasNodeDragState | null>(null);

	const displayNodes = $derived(canvasNodesWithPosition(
		doc?.nodes ?? [],
		dragState ? canvasNodeDragPosition(dragState) : null
	));
	const displayDoc = $derived(doc ? { ...doc, nodes: displayNodes } : null);
	const bounds = $derived(canvasBounds(displayNodes));
	const lines = $derived(displayDoc ? edgeLines(displayDoc, bounds) : []);
	const edgeSummaries = $derived(doc ? canvasEdgeSummaries(doc) : []);
	const nodeOptions = $derived(canvasNodeOptions(doc?.nodes ?? []));
	const canAddEdge = $derived(Boolean(
		doc &&
		nodeOptions.length >= 2 &&
		canConnectCanvasNodes(edgeFromNodeId, edgeToNodeId) &&
		!addingEdge
	));
	const exportHref = $derived(`/api/vaults/${vaultId}/canvas/export?path=${encodeURIComponent(path)}`);
	const exportName = $derived(`${path.split('/').pop()?.replace(/\.canvas$/i, '') || 'canvas'}.svg`);

	function setDoc(next: CanvasDoc): void {
		doc = next;
		textDrafts = canvasTextDrafts(next.nodes);
		groupLabelDrafts = canvasGroupLabelDrafts(next.nodes);
		refDrafts = canvasNodeRefDrafts(next.nodes);
		edgeLabelDrafts = canvasEdgeLabelDrafts(canvasEdgeSummaries(next));
		const edgeDraft = canvasConnectionDraft(next.nodes, edgeFromNodeId, edgeToNodeId);
		edgeFromNodeId = edgeDraft.fromNodeId;
		edgeToNodeId = edgeDraft.toNodeId;
	}

	function setDraft(node: CanvasNode, value: string): void {
		textDrafts = { ...textDrafts, [node.id]: value };
	}

	function setGroupLabelDraft(node: CanvasNode, value: string): void {
		groupLabelDrafts = { ...groupLabelDrafts, [node.id]: value };
	}

	function setRefDraft(node: CanvasNode, draft: CanvasNodeRefDraft): void {
		refDrafts = { ...refDrafts, [node.id]: draft };
	}

	function setEdgeLabelDraft(edge: CanvasEdgeSummary, value: string): void {
		edgeLabelDrafts = { ...edgeLabelDrafts, [edge.id]: value };
	}

	function setEdgeFromNodeId(nodeId: string): void {
		edgeFromNodeId = nodeId;
	}

	function setEdgeToNodeId(nodeId: string): void {
		edgeToNodeId = nodeId;
	}

	function setNewEdgeLabel(label: string): void {
		edgeLabel = label;
	}

	function openRefNode(node: CanvasNode): void {
		const target = canvasFileOpenTarget(node);
		if (!target) return;
		if (target.kind === 'canvas') {
			openCanvas(vaultId, target.path, target.title, 'new-tab');
		} else {
			openNote(vaultId, target.path, target.title, 'new-tab');
		}
	}

	async function addNode(type: CanvasAddNodeType, value: string): Promise<void> {
		if (!doc || addingNode) return;
		addingNode = true;
		error = null;
		try {
			const res = await api.addCanvasNode(vaultId, path, type, value, doc.revision);
			setDoc(res.doc);
			emit('toast:show', { title: 'Canvas node added', tone: 'success' });
		} catch (e) {
			error = (e as Error).message;
		} finally {
			addingNode = false;
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

	async function saveGroupLabel(node: CanvasNode): Promise<void> {
		if (!doc || savingNodeId || !canSaveCanvasGroupLabel(node, groupLabelDrafts)) return;
		savingNodeId = node.id;
		error = null;
		try {
			const res = await api.updateCanvasGroupLabel(
				vaultId,
				path,
				node.id,
				canvasGroupLabelDraftFor(node, groupLabelDrafts),
				doc.revision
			);
			setDoc(res.doc);
			emit('toast:show', { title: 'Group label saved', tone: 'success' });
		} catch (e) {
			error = (e as Error).message;
		} finally {
			savingNodeId = null;
		}
	}

	async function saveRefNode(node: CanvasNode): Promise<void> {
		if (!doc || savingNodeId || !canSaveCanvasNodeRefDraft(node, refDrafts)) return;
		if (node.type !== 'file' && node.type !== 'link') return;
		const draft = canvasNodeRefDraftFor(node, refDrafts);
		savingNodeId = node.id;
		error = null;
		try {
			const res = await api.updateCanvasNodeReference(
				vaultId,
				path,
				node.id,
				node.type,
				draft.value,
				draft.label,
				doc.revision
			);
			setDoc(res.doc);
			emit('toast:show', { title: `${node.type === 'file' ? 'File' : 'URL'} card saved`, tone: 'success' });
		} catch (e) {
			error = (e as Error).message;
		} finally {
			savingNodeId = null;
		}
	}

	async function deleteNode(node: CanvasNode): Promise<void> {
		if (!doc || deletingNodeId || savingNodeId || movingNodeId || moveSavingNodeId || savingEdgeId || deletingEdgeId) return;
		deletingNodeId = node.id;
		error = null;
		try {
			const res = await api.deleteCanvasNode(vaultId, path, node.id, doc.revision);
			setDoc(res.doc);
			emit('toast:show', { title: 'Canvas node removed', tone: 'success' });
		} catch (e) {
			error = (e as Error).message;
		} finally {
			deletingNodeId = null;
		}
	}

	async function addEdge(): Promise<void> {
		if (!doc || !canAddEdge) return;
		addingEdge = true;
		error = null;
		try {
			const res = await api.addCanvasEdge(
				vaultId,
				path,
				edgeFromNodeId,
				edgeToNodeId,
				edgeLabel,
				doc.revision
			);
			setDoc(res.doc);
			edgeLabel = '';
			emit('toast:show', { title: 'Canvas edge added', tone: 'success' });
		} catch (e) {
			error = (e as Error).message;
		} finally {
			addingEdge = false;
		}
	}

	async function deleteEdge(edgeId: string): Promise<void> {
		if (!doc || deletingEdgeId || savingEdgeId) return;
		deletingEdgeId = edgeId;
		error = null;
		try {
			const res = await api.deleteCanvasEdge(vaultId, path, edgeId, doc.revision);
			setDoc(res.doc);
			emit('toast:show', { title: 'Canvas edge removed', tone: 'success' });
		} catch (e) {
			error = (e as Error).message;
		} finally {
			deletingEdgeId = null;
		}
	}

	async function saveEdgeLabel(edge: CanvasEdgeSummary): Promise<void> {
		if (!doc || savingEdgeId || deletingEdgeId || !canvasEdgeLabelChanged(edge, edgeLabelDrafts)) return;
		savingEdgeId = edge.id;
		error = null;
		try {
			const res = await api.updateCanvasEdgeLabel(
				vaultId,
				path,
				edge.id,
				canvasEdgeLabelDraftFor(edge, edgeLabelDrafts),
				doc.revision
			);
			setDoc(res.doc);
			emit('toast:show', { title: 'Canvas edge saved', tone: 'success' });
		} catch (e) {
			error = (e as Error).message;
		} finally {
			savingEdgeId = null;
		}
	}

	function cleanupDragListeners(): void {
		window.removeEventListener('pointermove', moveNodePointer);
		window.removeEventListener('pointerup', handleMovePointerUp);
		window.removeEventListener('pointercancel', handleMovePointerCancel);
	}

	function moveNodePointer(event: PointerEvent): void {
		if (!isCanvasNodeDragPointer(dragState, event)) return;
		dragState = updateCanvasNodeDragState(dragState, event);
	}

	async function finishMovePointer(event: PointerEvent): Promise<void> {
		if (!isCanvasNodeDragPointer(dragState, event)) return;
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
		if (!isCanvasNodeDragPointer(dragState, event)) return;
		cleanupDragListeners();
		dragState = null;
		movingNodeId = null;
	}

	function startMoveNode(node: CanvasNode, event: PointerEvent): void {
		if (!doc || moveSavingNodeId) return;
		event.preventDefault();
		movingNodeId = node.id;
		dragState = createCanvasNodeDragState(node, event);
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
	<CanvasHeader
		{doc}
		{path}
		{addingNode}
		{addingEdge}
		{canAddEdge}
		{nodeOptions}
		{edgeFromNodeId}
		{edgeToNodeId}
		{edgeLabel}
		{exportHref}
		{exportName}
		onAddNode={addNode}
		onAddEdge={addEdge}
		onEdgeFromNodeChange={setEdgeFromNodeId}
		onEdgeToNodeChange={setEdgeToNodeId}
		onEdgeLabelChange={setNewEdgeLabel}
	/>

	<CanvasStage
		{loading}
		{error}
		{doc}
		nodes={displayNodes}
		{bounds}
		{lines}
		{edgeSummaries}
		{textDrafts}
		{groupLabelDrafts}
		{refDrafts}
		{edgeLabelDrafts}
		{savingNodeId}
		{movingNodeId}
		{moveSavingNodeId}
		{deletingNodeId}
		{savingEdgeId}
		{deletingEdgeId}
		onEdgeLabelDraftChange={setEdgeLabelDraft}
		onSaveEdgeLabel={saveEdgeLabel}
		onDeleteEdge={deleteEdge}
		onDraftChange={setDraft}
		onGroupLabelDraftChange={setGroupLabelDraft}
		onRefDraftChange={setRefDraft}
		onSaveNode={saveTextNode}
		onSaveGroupLabel={saveGroupLabel}
		onSaveRefNode={saveRefNode}
		onOpenRefNode={openRefNode}
		onDeleteNode={deleteNode}
		onMovePointerDown={startMoveNode}
	/>
</section>

<style>
	.canvas-view {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		background: var(--bg);
	}
</style>
