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
		bindCanvasPointerSession,
		type CanvasPointerSessionCleanup
	} from '$lib/canvas/pointer-session';
	import {
		CanvasLinkTargetRequestQueue,
		refreshCanvasLinkTargets,
		refreshCanvasLinkTargetsForVaultEvent
	} from '$lib/canvas/link-targets';
	import {
		CanvasNotePreviewRequestQueue,
		canvasNotePreviewMap,
		canvasNotePreviewPaths,
		type CanvasNotePreviewMap
	} from '$lib/canvas/note-previews';
	import {
		canDeleteCanvasNode,
		canDuplicateCanvasNode,
		canMutateCanvasEdge,
		canSaveCanvasNodeContent,
		canSaveCanvasNodeColor,
		canStartCanvasNodeMove,
		canStartCanvasNodeResize,
		clearCanvasPointerMutationState,
		idleCanvasMutationState,
		patchCanvasMutationState,
		type CanvasMutationState
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
	let mutationState = $state<CanvasMutationState>(idleCanvasMutationState());
	let edgeLabelDrafts = $state<CanvasEdgeLabelDrafts>({});
	let edgeRoutingDrafts = $state<CanvasEdgeRoutingDrafts>({});
	let edgeFromNodeId = $state('');
	let edgeToNodeId = $state('');
	let edgeLabel = $state('');
	let dragState = $state<CanvasNodeDragState | null>(null);
	let resizeState = $state<CanvasNodeResizeState | null>(null);
	let canvasZoom = $state(1);
	let dragSessionCleanup: CanvasPointerSessionCleanup | null = null;
	let resizeSessionCleanup: CanvasPointerSessionCleanup | null = null;
	let linkTargets = $state<NoteLinkTarget[]>([]);
	let notePreviews = $state<CanvasNotePreviewMap>({});
	const linkTargetRequests = new CanvasLinkTargetRequestQueue();
	const notePreviewRequests = new CanvasNotePreviewRequestQueue();

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
		await refreshCanvasLinkTargets(linkTargetRequests, vaultId, api.linkTargets, (targets) => {
			linkTargets = targets;
		});
	}

	async function loadNotePreviews(paths: string[] = canvasNotePreviewPaths(doc?.nodes ?? [])): Promise<void> {
		const result = await notePreviewRequests.load(vaultId, paths, api.canvasNotePreviews);
		if (notePreviewRequests.isCurrent(result)) notePreviews = canvasNotePreviewMap(result.previews);
	}

	function setMutationState(patch: Partial<CanvasMutationState>): void {
		mutationState = patchCanvasMutationState(mutationState, patch);
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
		setMutationState({ savingNodeId: node.id });
		error = null;
		try {
			const res = await api.updateCanvasTextNode(vaultId, path, node.id, canvasDraftFor(node, textDrafts), doc.revision);
			setDoc(res.doc);
			emit('toast:show', { title: 'Text card saved', tone: 'success' });
		} catch (e) {
			error = (e as Error).message;
		} finally {
			setMutationState({ savingNodeId: null });
		}
	}

	async function saveGroupLabel(node: CanvasNode): Promise<void> {
		if (!doc || !canSaveCanvasNodeContent(mutationState) || !canSaveCanvasGroupLabel(node, groupLabelDrafts)) return;
		setMutationState({ savingNodeId: node.id });
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
			setMutationState({ savingNodeId: null });
		}
	}

	async function saveRefNode(node: CanvasNode): Promise<void> {
		if (!doc || !canSaveCanvasNodeContent(mutationState) || !canSaveCanvasNodeRefDraft(node, refDrafts)) return;
		if (node.type !== 'file' && node.type !== 'link') return;
		const draft = canvasNodeRefDraftFor(node, refDrafts);
		setMutationState({ savingNodeId: node.id });
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
			setMutationState({ savingNodeId: null });
		}
	}

	async function saveNodeColor(node: CanvasNode, color: string): Promise<void> {
		if (!doc || !canSaveCanvasNodeColor(mutationState)) return;
		setMutationState({ savingNodeId: node.id });
		error = null;
		try {
			const res = await api.updateCanvasNodeColor(vaultId, path, node.id, color, doc.revision);
			setDoc(res.doc);
			emit('toast:show', { title: 'Canvas node color saved', tone: 'success' });
		} catch (e) {
			error = (e as Error).message;
		} finally {
			setMutationState({ savingNodeId: null });
		}
	}

	async function duplicateNode(node: CanvasNode): Promise<void> {
		if (!doc || !canDuplicateCanvasNode(mutationState)) return;
		setMutationState({ duplicatingNodeId: node.id });
		error = null;
		try {
			const res = await api.duplicateCanvasNode(vaultId, path, node.id, doc.revision);
			setDoc(res.doc);
			emit('toast:show', { title: 'Canvas node duplicated', tone: 'success' });
		} catch (e) {
			error = (e as Error).message;
		} finally {
			setMutationState({ duplicatingNodeId: null });
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
		setMutationState({ deletingNodeId: node.id });
		error = null;
		try {
			const res = await api.deleteCanvasNode(vaultId, path, node.id, doc.revision);
			setDoc(res.doc);
			emit('toast:show', { title: 'Canvas node removed', tone: 'success' });
		} catch (e) {
			error = (e as Error).message;
		} finally {
			setMutationState({ deletingNodeId: null });
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
		setMutationState({ deletingEdgeId: edge.id });
		error = null;
		try {
			const res = await api.deleteCanvasEdge(vaultId, path, edge.id, doc.revision);
			setDoc(res.doc);
			emit('toast:show', { title: 'Canvas edge removed', tone: 'success' });
		} catch (e) {
			error = (e as Error).message;
		} finally {
			setMutationState({ deletingEdgeId: null });
		}
	}

	async function saveEdgeLabel(edge: CanvasEdgeSummary): Promise<void> {
		if (!doc || !canMutateCanvasEdge(mutationState) || !canvasEdgeLabelChanged(edge, edgeLabelDrafts)) return;
		setMutationState({ savingEdgeId: edge.id });
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
			setMutationState({ savingEdgeId: null });
		}
	}

	async function saveEdgeColor(edge: CanvasEdgeSummary, color: string): Promise<void> {
		if (!doc || !canMutateCanvasEdge(mutationState)) return;
		setMutationState({ savingEdgeId: edge.id });
		error = null;
		try {
			const res = await api.updateCanvasEdgeColor(vaultId, path, edge.id, color, doc.revision);
			setDoc(res.doc);
			emit('toast:show', { title: 'Canvas edge color saved', tone: 'success' });
		} catch (e) {
			error = (e as Error).message;
		} finally {
			setMutationState({ savingEdgeId: null });
		}
	}

	async function saveEdgeRouting(edge: CanvasEdgeSummary): Promise<void> {
		if (!doc || !canMutateCanvasEdge(mutationState) || !canvasEdgeRoutingChanged(edge, edgeRoutingDrafts)) return;
		setMutationState({ savingEdgeId: edge.id });
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
			setMutationState({ savingEdgeId: null });
		}
	}

	function cleanupDragListeners(): void {
		dragSessionCleanup?.();
		dragSessionCleanup = null;
	}

	function cleanupResizeListeners(): void {
		resizeSessionCleanup?.();
		resizeSessionCleanup = null;
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
		mutationState = clearCanvasPointerMutationState(mutationState);

		const node = doc?.nodes.find((candidate) => candidate.id === finished.nodeId);
		if (!doc || !node || !canvasNodePositionChanged(node, finished.currentX, finished.currentY)) return;

		setMutationState({ moveSavingNodeId: node.id });
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
			setMutationState({ moveSavingNodeId: null });
		}
	}

	function handleMovePointerUp(event: PointerEvent): void {
		void finishMovePointer(event);
	}

	function handleMovePointerCancel(event: PointerEvent): void {
		if (!isCanvasNodeDragPointer(dragState, event)) return;
		cleanupDragListeners();
		dragState = null;
		mutationState = clearCanvasPointerMutationState(mutationState);
	}

	function startMoveNode(node: CanvasNode, event: PointerEvent): void {
		if (!doc || !canStartCanvasNodeMove(mutationState)) return;
		event.preventDefault();
		setMutationState({ movingNodeId: node.id });
		dragState = createCanvasNodeDragState(node, event, canvasZoom);
		cleanupDragListeners();
		dragSessionCleanup = bindCanvasPointerSession(window, {
			move: moveNodePointer,
			up: handleMovePointerUp,
			cancel: handleMovePointerCancel
		});
	}

	async function finishResizePointer(event: PointerEvent): Promise<void> {
		if (!isCanvasNodeResizePointer(resizeState, event)) return;
		const finished = resizeState;
		cleanupResizeListeners();
		resizeState = null;
		mutationState = clearCanvasPointerMutationState(mutationState);

		const node = doc?.nodes.find((candidate) => candidate.id === finished.nodeId);
		if (!doc || !node || !canvasNodeSizeChanged(node, finished.currentWidth, finished.currentHeight)) return;

		setMutationState({ resizeSavingNodeId: node.id });
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
			setMutationState({ resizeSavingNodeId: null });
		}
	}

	function handleResizePointerUp(event: PointerEvent): void {
		void finishResizePointer(event);
	}

	function handleResizePointerCancel(event: PointerEvent): void {
		if (!isCanvasNodeResizePointer(resizeState, event)) return;
		cleanupResizeListeners();
		resizeState = null;
		mutationState = clearCanvasPointerMutationState(mutationState);
	}

	function startResizeNode(node: CanvasNode, event: PointerEvent): void {
		if (!doc || !canStartCanvasNodeResize(mutationState)) return;
		event.preventDefault();
		event.stopPropagation();
		setMutationState({ resizingNodeId: node.id });
		resizeState = createCanvasNodeResizeState(node, event, canvasZoom);
		cleanupResizeListeners();
		resizeSessionCleanup = bindCanvasPointerSession(window, {
			move: resizeNodePointer,
			up: handleResizePointerUp,
			cancel: handleResizePointerCancel
		});
	}

	$effect(() => {
		const currentPath = path;
		let alive = true;
		cleanupDragListeners();
		cleanupResizeListeners();
		dragState = null;
		resizeState = null;
		mutationState = idleCanvasMutationState();
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
		void loadNotePreviews(canvasNotePreviewPaths(doc?.nodes ?? []));
	});

	$effect(() => {
		const refresh = (event: { vaultId: string }): void => {
			refreshCanvasLinkTargetsForVaultEvent(vaultId, event, loadLinkTargets);
		};
		const refreshPreviews = (event: { vaultId: string }): void => {
			if (event.vaultId === vaultId) void loadNotePreviews();
		};
		const offs = [
			onBus('note:saved', (event) => { refresh(event); refreshPreviews(event); }),
			onBus('note:created', (event) => { refresh(event); refreshPreviews(event); }),
			onBus('note:deleted', (event) => { refresh(event); refreshPreviews(event); }),
			onBus('note:renamed', (event) => { refresh(event); refreshPreviews(event); }),
			onBus('folder:renamed', (event) => { refresh(event); refreshPreviews(event); }),
			onBus('folder:deleted', (event) => { refresh(event); refreshPreviews(event); }),
			onBus('tree:invalidate', (event) => { refresh(event); refreshPreviews(event); })
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
		sourcePath={path}
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
		{notePreviews}
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
		onDuplicateNode={duplicateNode}
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
