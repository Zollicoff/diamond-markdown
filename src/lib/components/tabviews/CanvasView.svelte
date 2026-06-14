<script lang="ts">
	import { api } from '$lib/vault-api';
	import type { CanvasDoc, CanvasNode, NoteLinkTarget } from '$lib/types';
	import { confirmDialog } from '$lib/dialogs';
	import { emit, on as onBus } from '$lib/events';
	import { openCanvas, openNote } from '$lib/workspace/actions';
	import { replaceLocationHash } from '$lib/workspace/hash';
	import {
		canvasBounds,
		canvasDraftStateForDoc,
		canvasDraftChanged,
		canvasDraftFor,
		canvasEdgeLabelChanged,
		canvasEdgeLabelDraftFor,
		canvasEdgeRoutingChanged,
		canvasEdgeRoutingDraftFor,
		canvasGroupLabelDraftFor,
		canConnectCanvasNodes,
		canSaveCanvasGroupLabel,
		canvasEdgeSummaries,
		canvasNodePositionChanged,
		canvasNodeSizeChanged,
		canvasNodeOptions,
		canvasFileOpenTarget,
		canvasNodeRefDraftFor,
		canvasNodesWithPosition,
		canvasNodesWithSize,
		canvasNodeTitle,
		canSaveCanvasNodeRefDraft,
		edgeLines,
		type CanvasAddNodeType,
		type CanvasEdgeLabelDrafts,
		type CanvasEdgeRoutingDraft,
		type CanvasEdgeRoutingDrafts,
		type CanvasGroupLabelDrafts,
		type CanvasNodeRefDraft,
		type CanvasNodeRefDrafts,
		type CanvasEdgeSummary,
		type CanvasTextDrafts
	} from '$lib/canvas/view';
	import {
		canvasTextNoteEmbedResolver,
		canvasTextNoteWikilinkResolver,
		type CanvasTextEmbedResolver,
		type CanvasTextWikilinkResolver
	} from '$lib/canvas/text-preview';
	import {
		canvasNodeDragPosition,
		canvasNodeResizeSize,
		createCanvasNodeDragState,
		createCanvasNodeResizeState,
		isCanvasNodeDragPointer,
		isCanvasNodeResizePointer,
		updateCanvasNodeDragState,
		updateCanvasNodeResizeState,
		type CanvasNodeDragState,
		type CanvasNodeResizeState
	} from '$lib/canvas/drag';
	import {
		canZoomCanvasIn,
		canZoomCanvasOut,
		canvasZoomLabel,
		fitCanvasZoom,
		normalizeCanvasZoom,
		stepCanvasZoom
	} from '$lib/canvas/viewport';
	import {
		CanvasLinkTargetRequestQueue,
		isCanvasLinkTargetRefreshEvent
	} from '$lib/canvas/link-targets';
	import {
		canDeleteCanvasNode,
		canMutateCanvasEdge,
		canSaveCanvasNodeContent,
		canSaveCanvasNodeColor,
		canStartCanvasNodeMove,
		canStartCanvasNodeResize
	} from '$lib/canvas/mutations';
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
	let resizingNodeId = $state<string | null>(null);
	let resizeSavingNodeId = $state<string | null>(null);
	let deletingNodeId = $state<string | null>(null);
	let savingEdgeId = $state<string | null>(null);
	let deletingEdgeId = $state<string | null>(null);
	let edgeLabelDrafts = $state<CanvasEdgeLabelDrafts>({});
	let edgeRoutingDrafts = $state<CanvasEdgeRoutingDrafts>({});
	let edgeFromNodeId = $state('');
	let edgeToNodeId = $state('');
	let edgeLabel = $state('');
	let dragState = $state<CanvasNodeDragState | null>(null);
	let resizeState = $state<CanvasNodeResizeState | null>(null);
	let canvasZoom = $state(1);
	let linkTargets = $state<NoteLinkTarget[]>([]);
	const linkTargetRequests = new CanvasLinkTargetRequestQueue();

	const mutationState = $derived({
		savingNodeId,
		movingNodeId,
		moveSavingNodeId,
		resizingNodeId,
		resizeSavingNodeId,
		deletingNodeId,
		savingEdgeId,
		deletingEdgeId
	});
	const movedNodes = $derived(canvasNodesWithPosition(
		doc?.nodes ?? [],
		dragState ? canvasNodeDragPosition(dragState) : null
	));
	const displayNodes = $derived(canvasNodesWithSize(
		movedNodes,
		resizeState ? canvasNodeResizeSize(resizeState) : null
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
	const zoomLabel = $derived(canvasZoomLabel(canvasZoom));
	const canZoomIn = $derived(canZoomCanvasIn(canvasZoom));
	const canZoomOut = $derived(canZoomCanvasOut(canvasZoom));
	const resolveWikilinkTarget = $derived(canvasTextNoteWikilinkResolver(linkTargets));
	const resolveEmbedTarget = $derived(canvasTextNoteEmbedResolver(linkTargets));

	async function loadLinkTargets(): Promise<void> {
		const result = await linkTargetRequests.load(vaultId, api.linkTargets);
		if (linkTargetRequests.isCurrent(result)) linkTargets = result.targets;
	}

	function setCanvasZoom(zoom: number): void {
		canvasZoom = normalizeCanvasZoom(zoom);
	}

	function zoomCanvasIn(): void {
		setCanvasZoom(stepCanvasZoom(canvasZoom, 'in'));
	}

	function zoomCanvasOut(): void {
		setCanvasZoom(stepCanvasZoom(canvasZoom, 'out'));
	}

	function resetCanvasZoom(): void {
		setCanvasZoom(1);
	}

	function fitCanvasToViewport(viewportWidth: number, viewportHeight: number): void {
		setCanvasZoom(fitCanvasZoom(bounds, viewportWidth, viewportHeight));
	}

	function setDoc(next: CanvasDoc): void {
		const drafts = canvasDraftStateForDoc(next, edgeFromNodeId, edgeToNodeId);
		doc = next;
		textDrafts = drafts.textDrafts;
		groupLabelDrafts = drafts.groupLabelDrafts;
		refDrafts = drafts.refDrafts;
		edgeLabelDrafts = drafts.edgeLabelDrafts;
		edgeRoutingDrafts = drafts.edgeRoutingDrafts;
		edgeFromNodeId = drafts.edgeFromNodeId;
		edgeToNodeId = drafts.edgeToNodeId;
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

	function setEdgeRoutingDraft(edge: CanvasEdgeSummary, draft: CanvasEdgeRoutingDraft): void {
		edgeRoutingDrafts = { ...edgeRoutingDrafts, [edge.id]: draft };
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
			replaceLocationHash(target.hash);
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
		if (!doc || !canSaveCanvasNodeContent(mutationState) || !canvasDraftChanged(node, textDrafts)) return;
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
		if (!doc || !canSaveCanvasNodeContent(mutationState) || !canSaveCanvasGroupLabel(node, groupLabelDrafts)) return;
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
		if (!doc || !canSaveCanvasNodeContent(mutationState) || !canSaveCanvasNodeRefDraft(node, refDrafts)) return;
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
				draft.subpath,
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

	async function saveNodeColor(node: CanvasNode, color: string): Promise<void> {
		if (!doc || !canSaveCanvasNodeColor(mutationState)) return;
		savingNodeId = node.id;
		error = null;
		try {
			const res = await api.updateCanvasNodeColor(vaultId, path, node.id, color, doc.revision);
			setDoc(res.doc);
			emit('toast:show', { title: 'Canvas node color saved', tone: 'success' });
		} catch (e) {
			error = (e as Error).message;
		} finally {
			savingNodeId = null;
		}
	}

	async function deleteNode(node: CanvasNode): Promise<void> {
		if (!doc || !canDeleteCanvasNode(mutationState)) return;
		const confirmed = await confirmDialog({
			title: 'Remove Canvas node',
			message: `Remove canvas node "${canvasNodeTitle(node)}"? Connected edges will also be removed.`,
			confirmLabel: 'Remove',
			tone: 'danger'
		});
		if (!confirmed) return;
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

	async function deleteEdge(edge: CanvasEdgeSummary): Promise<void> {
		if (!doc || !canMutateCanvasEdge(mutationState)) return;
		const confirmed = await confirmDialog({
			title: 'Remove Canvas edge',
			message: `Remove canvas edge "${edge.description}"?`,
			confirmLabel: 'Remove',
			tone: 'danger'
		});
		if (!confirmed) return;
		deletingEdgeId = edge.id;
		error = null;
		try {
			const res = await api.deleteCanvasEdge(vaultId, path, edge.id, doc.revision);
			setDoc(res.doc);
			emit('toast:show', { title: 'Canvas edge removed', tone: 'success' });
		} catch (e) {
			error = (e as Error).message;
		} finally {
			deletingEdgeId = null;
		}
	}

	async function saveEdgeLabel(edge: CanvasEdgeSummary): Promise<void> {
		if (!doc || !canMutateCanvasEdge(mutationState) || !canvasEdgeLabelChanged(edge, edgeLabelDrafts)) return;
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

	async function saveEdgeColor(edge: CanvasEdgeSummary, color: string): Promise<void> {
		if (!doc || !canMutateCanvasEdge(mutationState)) return;
		savingEdgeId = edge.id;
		error = null;
		try {
			const res = await api.updateCanvasEdgeColor(vaultId, path, edge.id, color, doc.revision);
			setDoc(res.doc);
			emit('toast:show', { title: 'Canvas edge color saved', tone: 'success' });
		} catch (e) {
			error = (e as Error).message;
		} finally {
			savingEdgeId = null;
		}
	}

	async function saveEdgeRouting(edge: CanvasEdgeSummary): Promise<void> {
		if (!doc || !canMutateCanvasEdge(mutationState) || !canvasEdgeRoutingChanged(edge, edgeRoutingDrafts)) return;
		savingEdgeId = edge.id;
		error = null;
		try {
			const res = await api.updateCanvasEdgeRouting(
				vaultId,
				path,
				edge.id,
				canvasEdgeRoutingDraftFor(edge, edgeRoutingDrafts),
				doc.revision
			);
			setDoc(res.doc);
			emit('toast:show', { title: 'Canvas edge routing saved', tone: 'success' });
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

	function cleanupResizeListeners(): void {
		window.removeEventListener('pointermove', resizeNodePointer);
		window.removeEventListener('pointerup', handleResizePointerUp);
		window.removeEventListener('pointercancel', handleResizePointerCancel);
	}

	function moveNodePointer(event: PointerEvent): void {
		if (!isCanvasNodeDragPointer(dragState, event)) return;
		dragState = updateCanvasNodeDragState(dragState, event);
	}

	function resizeNodePointer(event: PointerEvent): void {
		if (!isCanvasNodeResizePointer(resizeState, event)) return;
		resizeState = updateCanvasNodeResizeState(resizeState, event);
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
		if (!doc || !canStartCanvasNodeMove(mutationState)) return;
		event.preventDefault();
		movingNodeId = node.id;
		dragState = createCanvasNodeDragState(node, event, canvasZoom);
		window.addEventListener('pointermove', moveNodePointer);
		window.addEventListener('pointerup', handleMovePointerUp);
		window.addEventListener('pointercancel', handleMovePointerCancel);
	}

	async function finishResizePointer(event: PointerEvent): Promise<void> {
		if (!isCanvasNodeResizePointer(resizeState, event)) return;
		const finished = resizeState;
		cleanupResizeListeners();
		resizeState = null;
		resizingNodeId = null;

		const node = doc?.nodes.find((candidate) => candidate.id === finished.nodeId);
		if (!doc || !node || !canvasNodeSizeChanged(node, finished.currentWidth, finished.currentHeight)) return;

		resizeSavingNodeId = node.id;
		error = null;
		try {
			const res = await api.resizeCanvasNode(
				vaultId,
				path,
				node.id,
				finished.currentWidth,
				finished.currentHeight,
				doc.revision
			);
			setDoc(res.doc);
			emit('toast:show', { title: 'Canvas node resized', tone: 'success' });
		} catch (e) {
			error = (e as Error).message;
		} finally {
			resizeSavingNodeId = null;
		}
	}

	function handleResizePointerUp(event: PointerEvent): void {
		void finishResizePointer(event);
	}

	function handleResizePointerCancel(event: PointerEvent): void {
		if (!isCanvasNodeResizePointer(resizeState, event)) return;
		cleanupResizeListeners();
		resizeState = null;
		resizingNodeId = null;
	}

	function startResizeNode(node: CanvasNode, event: PointerEvent): void {
		if (!doc || !canStartCanvasNodeResize(mutationState)) return;
		event.preventDefault();
		event.stopPropagation();
		resizingNodeId = node.id;
		resizeState = createCanvasNodeResizeState(node, event, canvasZoom);
		window.addEventListener('pointermove', resizeNodePointer);
		window.addEventListener('pointerup', handleResizePointerUp);
		window.addEventListener('pointercancel', handleResizePointerCancel);
	}

	$effect(() => {
		const currentPath = path;
		let alive = true;
		cleanupDragListeners();
		cleanupResizeListeners();
		dragState = null;
		resizeState = null;
		movingNodeId = null;
		resizingNodeId = null;
		canvasZoom = 1;
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

	$effect(() => {
		vaultId;
		void loadLinkTargets();
	});

	$effect(() => {
		const refresh = (event: { vaultId: string }): void => {
			if (isCanvasLinkTargetRefreshEvent(vaultId, event)) void loadLinkTargets();
		};
		const offs = [
			onBus('note:saved', refresh),
			onBus('note:created', refresh),
			onBus('note:deleted', refresh),
			onBus('note:renamed', refresh),
			onBus('folder:renamed', refresh),
			onBus('folder:deleted', refresh),
			onBus('tree:invalidate', refresh)
		];
		return () => offs.forEach((off) => off());
	});

	$effect(() => () => {
		cleanupDragListeners();
		cleanupResizeListeners();
	});
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
		{vaultId}
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
		{edgeRoutingDrafts}
		{resolveEmbedTarget}
		{mutationState}
		{resolveWikilinkTarget}
		zoom={canvasZoom}
		{zoomLabel}
		{canZoomIn}
		{canZoomOut}
		onEdgeLabelDraftChange={setEdgeLabelDraft}
		onEdgeRoutingDraftChange={setEdgeRoutingDraft}
		onSaveEdgeLabel={saveEdgeLabel}
		onSaveEdgeColor={saveEdgeColor}
		onSaveEdgeRouting={saveEdgeRouting}
		onDeleteEdge={deleteEdge}
		onDraftChange={setDraft}
		onGroupLabelDraftChange={setGroupLabelDraft}
		onRefDraftChange={setRefDraft}
		onSaveNode={saveTextNode}
		onSaveGroupLabel={saveGroupLabel}
		onSaveRefNode={saveRefNode}
		onOpenRefNode={openRefNode}
		onSaveNodeColor={saveNodeColor}
		onDeleteNode={deleteNode}
		onMovePointerDown={startMoveNode}
		onResizePointerDown={startResizeNode}
		onZoomIn={zoomCanvasIn}
		onZoomOut={zoomCanvasOut}
		onZoomReset={resetCanvasZoom}
		onZoomFit={fitCanvasToViewport}
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
