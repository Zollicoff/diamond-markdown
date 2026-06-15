import type { CanvasDoc, CanvasEdge, CanvasNode } from '$lib/types';
import {
	canvasNodeRefDrafts,
	canvasFileNodeDisplayPath,
	canvasFileOpenTarget,
	canvasLinkNodeHref
} from '$lib/canvas/files';
import type { CanvasNodeRefDrafts } from '$lib/canvas/files';
import { canvasNodeColorStyle } from '$lib/canvas/colors';

export {
	CANVAS_COLOR_OPTIONS,
	canvasDisplayColor,
	canvasEdgeMarkerStyle,
	canvasEdgeStyle,
	canvasNodeColorStyle,
	canvasPaletteColorValue,
	canvasSvgEdgeStroke,
	canvasSvgNodeColors,
	normalizeCanvasColor
} from '$lib/canvas/colors';
export type { CanvasColorOption, CanvasDisplayColor } from '$lib/canvas/colors';
export {
	canSaveCanvasNodeRefDraft,
	canvasFileAssetKind,
	canvasFileAssetPreview,
	canvasFileNodeDisplayPath,
	canvasFileNodeFragment,
	canvasFileNodePath,
	canvasFileNodeSubpath,
	canvasFileNodeTitle,
	canvasFileOpenTarget,
	canvasLinkNodeHref,
	canvasNodeRefDraftChanged,
	canvasNodeRefDraftFor,
	canvasNodeRefDrafts,
	canvasNodeRefValue,
	canvasRawAssetHref,
	isCanvasVaultRelativeAssetPath,
	normalizeCanvasFileSubpath,
	splitCanvasAssetReference
} from '$lib/canvas/files';
export type { CanvasFileAssetKind, CanvasFileAssetPreview, CanvasFileOpenTarget, CanvasNodeRefDraft, CanvasNodeRefDrafts } from '$lib/canvas/files';
export {
	canvasTextEmbedHref,
	canvasTextEmbedOpenTarget,
	canvasTextEmbedRouteHref,
	canvasTextInlineTargetHref,
	canvasTextNoteEmbedResolver,
	canvasTextNoteWikilinkResolver,
	canvasTextPreviewBlocks,
	canvasTextPreviewInlines
} from '$lib/canvas/text-preview';
export type {
	CanvasTextEmbedKind,
	CanvasTextEmbedOpenTarget,
	CanvasTextEmbedResolver,
	CanvasTextInlineTarget,
	CanvasTextPreviewBlock,
	CanvasTextPreviewCalloutFold,
	CanvasTextPreviewEmbed,
	CanvasTextPreviewInline,
	CanvasTextPreviewInlineKind,
	CanvasTextPreviewListItem,
	CanvasTextPreviewOptions,
	CanvasTextPreviewTable,
	CanvasTextPreviewTableCell,
	CanvasTextWikilinkResolver
} from '$lib/canvas/text-preview';

export interface CanvasBounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	width: number;
	height: number;
}

export interface CanvasEdgeLine {
	edge: CanvasEdge;
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

export type CanvasEdgeSide = 'top' | 'right' | 'bottom' | 'left' | 'center';
export type CanvasEdgeEnd = 'none' | 'arrow';
export type CanvasEdgeMarkerPosition = 'from' | 'to';

export interface CanvasNodePosition {
	nodeId: string;
	x: number;
	y: number;
}

export interface CanvasNodeSize {
	nodeId: string;
	width: number;
	height: number;
}

export interface CanvasNodeOption {
	id: string;
	label: string;
}

export interface CanvasConnectionDraft {
	fromNodeId: string;
	toNodeId: string;
}

export interface CanvasEdgeSummary {
	id: string;
	label: string;
	editableLabel: string;
	fromLabel: string;
	toLabel: string;
	description: string;
	fromSide: CanvasEdgeSide;
	toSide: CanvasEdgeSide;
	fromEnd: CanvasEdgeEnd;
	toEnd: CanvasEdgeEnd;
	color?: string;
}

export interface CanvasEdgeRoutingDraft {
	fromSide: CanvasEdgeSide;
	toSide: CanvasEdgeSide;
	fromEnd: CanvasEdgeEnd;
	toEnd: CanvasEdgeEnd;
}

export type CanvasTextDrafts = Record<string, string>;
export type CanvasGroupLabelDrafts = Record<string, string>;
export type CanvasEdgeLabelDrafts = Record<string, string>;
export type CanvasEdgeRoutingDrafts = Record<string, CanvasEdgeRoutingDraft>;
export type CanvasAddNodeType = 'text' | 'file' | 'link' | 'group';

export interface CanvasDraftState {
	textDrafts: CanvasTextDrafts;
	groupLabelDrafts: CanvasGroupLabelDrafts;
	refDrafts: CanvasNodeRefDrafts;
	edgeLabelDrafts: CanvasEdgeLabelDrafts;
	edgeRoutingDrafts: CanvasEdgeRoutingDrafts;
	edgeFromNodeId: string;
	edgeToNodeId: string;
}

export const CANVAS_EDGE_SIDE_OPTIONS: { value: CanvasEdgeSide; label: string }[] = [
	{ value: 'center', label: 'center' },
	{ value: 'top', label: 'top' },
	{ value: 'right', label: 'right' },
	{ value: 'bottom', label: 'bottom' },
	{ value: 'left', label: 'left' }
];

export const CANVAS_EDGE_END_OPTIONS: { value: CanvasEdgeEnd; label: string }[] = [
	{ value: 'none', label: 'none' },
	{ value: 'arrow', label: 'arrow' }
];

const PADDING = 80;

export function canvasAddNodePlaceholder(type: CanvasAddNodeType): string {
	if (type === 'file') return 'Note.md';
	if (type === 'link') return 'https://example.com';
	if (type === 'group') return 'Group label';
	return 'New text card';
}

export function canvasAddNodeButtonLabel(type: CanvasAddNodeType): string {
	if (type === 'file') return 'Add file';
	if (type === 'link') return 'Add URL';
	if (type === 'group') return 'Add group';
	return 'Add text';
}

export function canSubmitCanvasAddNode(type: CanvasAddNodeType, value: string): boolean {
	return type === 'text' || type === 'group' || value.trim().length > 0;
}

export function canvasBounds(nodes: CanvasNode[]): CanvasBounds {
	if (nodes.length === 0) {
		return { minX: 0, minY: 0, maxX: 640, maxY: 360, width: 640, height: 360 };
	}

	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const node of nodes) {
		minX = Math.min(minX, node.x);
		minY = Math.min(minY, node.y);
		maxX = Math.max(maxX, node.x + node.width);
		maxY = Math.max(maxY, node.y + node.height);
	}

	minX -= PADDING;
	minY -= PADDING;
	maxX += PADDING;
	maxY += PADDING;
	return {
		minX,
		minY,
		maxX,
		maxY,
		width: Math.max(320, maxX - minX),
		height: Math.max(220, maxY - minY)
	};
}

export function nodeStyle(node: CanvasNode, bounds: CanvasBounds): string {
	return [
		`left: ${node.x - bounds.minX}px`,
		`top: ${node.y - bounds.minY}px`,
		`width: ${node.width}px`,
		`height: ${node.height}px`
	].join('; ');
}

export function canvasNodeStyle(node: CanvasNode, bounds: CanvasBounds): string {
	return [nodeStyle(node, bounds), canvasNodeColorStyle(node)].filter(Boolean).join('; ');
}

export function canvasNodeClass(node: CanvasNode): string {
	return `canvas-node canvas-node-${node.type.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase() || 'unknown'}`;
}

export function isCanvasGroupNode(node: CanvasNode): boolean {
	return node.type === 'group';
}

export function canvasContentNodes(nodes: CanvasNode[]): CanvasNode[] {
	return nodes.filter((node) => !isCanvasGroupNode(node));
}

export function canvasLayeredNodes(nodes: CanvasNode[]): CanvasNode[] {
	return [
		...nodes.filter(isCanvasGroupNode),
		...canvasContentNodes(nodes)
	];
}

export function canvasEdgeSide(value: string | undefined): CanvasEdgeSide {
	if (value === 'top' || value === 'right' || value === 'bottom' || value === 'left') return value;
	return 'center';
}

export function canvasEdgeEnd(value: string | undefined, fallback: CanvasEdgeEnd): CanvasEdgeEnd {
	if (value === 'none' || value === 'arrow') return value;
	return fallback;
}

export function canvasEdgeEndpoint(edge: Pick<CanvasEdge, 'fromEnd' | 'toEnd'>, position: CanvasEdgeMarkerPosition): CanvasEdgeEnd {
	return position === 'from'
		? canvasEdgeEnd(edge.fromEnd, 'none')
		: canvasEdgeEnd(edge.toEnd, 'arrow');
}

export function canvasEdgeMarkerId(edge: Pick<CanvasEdge, 'id'>, position: CanvasEdgeMarkerPosition): string {
	let hash = 0;
	for (const char of edge.id) {
		hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
	}
	const safeId = edge.id.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'edge';
	return `canvas-edge-${safeId}-${hash.toString(36)}-${position}`;
}

export function canvasEdgeMarkerUrl(edge: Pick<CanvasEdge, 'id' | 'fromEnd' | 'toEnd'>, position: CanvasEdgeMarkerPosition): string | null {
	return canvasEdgeEndpoint(edge, position) === 'arrow'
		? `url(#${canvasEdgeMarkerId(edge, position)})`
		: null;
}

export function canvasNodeAnchor(
	node: CanvasNode,
	bounds: CanvasBounds,
	side: string | undefined
): { x: number; y: number } {
	const left = node.x - bounds.minX;
	const top = node.y - bounds.minY;
	const right = left + node.width;
	const bottom = top + node.height;
	const centerX = left + node.width / 2;
	const centerY = top + node.height / 2;

	switch (canvasEdgeSide(side)) {
		case 'top':
			return { x: centerX, y: top };
		case 'right':
			return { x: right, y: centerY };
		case 'bottom':
			return { x: centerX, y: bottom };
		case 'left':
			return { x: left, y: centerY };
		default:
			return { x: centerX, y: centerY };
	}
}

export function edgeLines(doc: CanvasDoc, bounds: CanvasBounds): CanvasEdgeLine[] {
	const byId = new Map(doc.nodes.map((node) => [node.id, node]));
	const lines: CanvasEdgeLine[] = [];
	for (const edge of doc.edges) {
		const from = byId.get(edge.fromNode);
		const to = byId.get(edge.toNode);
		if (!from || !to) continue;
		const a = canvasNodeAnchor(from, bounds, edge.fromSide);
		const b = canvasNodeAnchor(to, bounds, edge.toSide);
		lines.push({ edge, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
	}
	return lines;
}

export function canvasSummary(doc: Pick<CanvasDoc, 'nodes' | 'edges'>): string {
	return `${doc.nodes.length} ${plural(doc.nodes.length, 'node')} · ${doc.edges.length} ${plural(doc.edges.length, 'edge')}`;
}

export function canvasNodeTitle(node: CanvasNode): string {
	if (node.label) return node.label;
	if (node.type === 'file' && node.file) return node.file;
	if (node.type === 'link' && node.url) return node.url;
	if (node.type === 'group') return 'Group';
	return node.label ?? node.type;
}

export function canvasNodeBody(node: CanvasNode): string {
	if (node.type === 'group') return '';
	if (node.text) return node.text;
	if (node.file) return canvasFileNodeDisplayPath(node);
	if (node.url) return node.url;
	return '';
}

export function canOpenCanvasNode(node: CanvasNode): boolean {
	return Boolean(canvasFileOpenTarget(node) || canvasLinkNodeHref(node));
}

export function canvasOpenNodeLabel(node: CanvasNode): string {
	const title = canvasNodeTitle(node);
	if (node.type === 'file') return `Open canvas file node ${title}`;
	if (node.type === 'link') return `Open canvas URL node ${title}`;
	return `Open canvas node ${title}`;
}

export function canvasTextDrafts(nodes: CanvasNode[]): CanvasTextDrafts {
	return Object.fromEntries(
		nodes
			.filter((node) => node.type === 'text')
			.map((node) => [node.id, node.text ?? ''])
	);
}

export function canvasDraftFor(node: CanvasNode, drafts: CanvasTextDrafts): string {
	return drafts[node.id] ?? node.text ?? '';
}

export function canvasDraftChanged(node: CanvasNode, drafts: CanvasTextDrafts): boolean {
	return canvasDraftFor(node, drafts) !== (node.text ?? '');
}

export function canvasGroupLabelDrafts(nodes: CanvasNode[]): CanvasGroupLabelDrafts {
	return Object.fromEntries(
		nodes
			.filter((node) => node.type === 'group')
			.map((node) => [node.id, node.label ?? ''])
	);
}

export function canvasGroupLabelDraftFor(node: CanvasNode, drafts: CanvasGroupLabelDrafts): string {
	return drafts[node.id] ?? node.label ?? '';
}

export function canvasGroupLabelChanged(node: CanvasNode, drafts: CanvasGroupLabelDrafts): boolean {
	return canvasGroupLabelDraftFor(node, drafts).trim() !== (node.label ?? '');
}

export function canSaveCanvasGroupLabel(node: CanvasNode, drafts: CanvasGroupLabelDrafts): boolean {
	return node.type === 'group' && canvasGroupLabelChanged(node, drafts);
}

export function canvasNodePositionChanged(node: CanvasNode, x: number, y: number): boolean {
	return Math.round(node.x) !== Math.round(x) || Math.round(node.y) !== Math.round(y);
}

export function canvasNodeSizeChanged(node: CanvasNode, width: number, height: number): boolean {
	return Math.round(node.width) !== Math.round(width) || Math.round(node.height) !== Math.round(height);
}

export function canvasNodesWithPosition(nodes: CanvasNode[], position: CanvasNodePosition | null): CanvasNode[] {
	if (!position) return nodes;
	let changed = false;
	const next = nodes.map((node) => {
		if (node.id !== position.nodeId) return node;
		changed = true;
		return { ...node, x: Math.round(position.x), y: Math.round(position.y) };
	});
	return changed ? next : nodes;
}

export function canvasNodesWithSize(nodes: CanvasNode[], size: CanvasNodeSize | null): CanvasNode[] {
	if (!size) return nodes;
	let changed = false;
	const next = nodes.map((node) => {
		if (node.id !== size.nodeId) return node;
		changed = true;
		return { ...node, width: Math.round(size.width), height: Math.round(size.height) };
	});
	return changed ? next : nodes;
}

export function canvasNodeOptions(nodes: CanvasNode[]): CanvasNodeOption[] {
	return canvasContentNodes(nodes).map((node) => ({
		id: node.id,
		label: `${canvasNodeTitle(node)} (${node.type})`
	}));
}

export function canConnectCanvasNodes(fromNodeId: string, toNodeId: string): boolean {
	return Boolean(fromNodeId && toNodeId && fromNodeId !== toNodeId);
}

export function canvasConnectionDraft(
	nodes: CanvasNode[],
	currentFromNodeId = '',
	currentToNodeId = ''
): CanvasConnectionDraft {
	const connectableNodes = canvasContentNodes(nodes);
	const ids = new Set(connectableNodes.map((node) => node.id));
	const fromNodeId = ids.has(currentFromNodeId)
		? currentFromNodeId
		: connectableNodes[0]?.id ?? '';
	const toNodeId = ids.has(currentToNodeId) && currentToNodeId !== fromNodeId
		? currentToNodeId
		: connectableNodes.find((node) => node.id !== fromNodeId)?.id ?? '';
	return { fromNodeId, toNodeId };
}

export function canvasEdgeSummaries(doc: Pick<CanvasDoc, 'nodes' | 'edges'>): CanvasEdgeSummary[] {
	const nodes = new Map(doc.nodes.map((node) => [node.id, canvasNodeTitle(node)]));
	return doc.edges.map((edge) => {
		const fromLabel = nodes.get(edge.fromNode) ?? edge.fromNode;
		const toLabel = nodes.get(edge.toNode) ?? edge.toNode;
		const editableLabel = edge.label?.trim() ?? '';
		const label = editableLabel || 'unlabeled';
		return {
			id: edge.id,
			label,
			editableLabel,
			fromLabel,
			toLabel,
			description: `${fromLabel} to ${toLabel}${label !== 'unlabeled' ? `: ${label}` : ''}`,
			fromSide: canvasEdgeSide(edge.fromSide),
			toSide: canvasEdgeSide(edge.toSide),
			fromEnd: canvasEdgeEndpoint(edge, 'from'),
			toEnd: canvasEdgeEndpoint(edge, 'to'),
			color: edge.color
		};
	});
}

export function canvasEdgeLabelDrafts(edges: CanvasEdgeSummary[]): CanvasEdgeLabelDrafts {
	return Object.fromEntries(edges.map((edge) => [edge.id, edge.editableLabel]));
}

export function canvasEdgeLabelDraftFor(edge: CanvasEdgeSummary, drafts: CanvasEdgeLabelDrafts): string {
	return drafts[edge.id] ?? edge.editableLabel;
}

export function canvasEdgeLabelChanged(edge: CanvasEdgeSummary, drafts: CanvasEdgeLabelDrafts): boolean {
	return canvasEdgeLabelDraftFor(edge, drafts).trim() !== edge.editableLabel;
}

export function canvasEdgeRoutingDrafts(edges: CanvasEdgeSummary[]): CanvasEdgeRoutingDrafts {
	return Object.fromEntries(edges.map((edge) => [edge.id, canvasEdgeRoutingDraftFor(edge, {})]));
}

export function canvasEdgeRoutingDraftFor(edge: CanvasEdgeSummary, drafts: CanvasEdgeRoutingDrafts): CanvasEdgeRoutingDraft {
	return drafts[edge.id] ?? {
		fromSide: edge.fromSide,
		toSide: edge.toSide,
		fromEnd: edge.fromEnd,
		toEnd: edge.toEnd
	};
}

export function canvasDraftStateForDoc(
	doc: Pick<CanvasDoc, 'nodes' | 'edges'>,
	currentFromNodeId = '',
	currentToNodeId = ''
): CanvasDraftState {
	const edgeSummaries = canvasEdgeSummaries(doc);
	const edgeDraft = canvasConnectionDraft(doc.nodes, currentFromNodeId, currentToNodeId);
	return {
		textDrafts: canvasTextDrafts(doc.nodes),
		groupLabelDrafts: canvasGroupLabelDrafts(doc.nodes),
		refDrafts: canvasNodeRefDrafts(doc.nodes),
		edgeLabelDrafts: canvasEdgeLabelDrafts(edgeSummaries),
		edgeRoutingDrafts: canvasEdgeRoutingDrafts(edgeSummaries),
		edgeFromNodeId: edgeDraft.fromNodeId,
		edgeToNodeId: edgeDraft.toNodeId
	};
}

export function canvasEdgeRoutingChanged(edge: CanvasEdgeSummary, drafts: CanvasEdgeRoutingDrafts): boolean {
	const draft = canvasEdgeRoutingDraftFor(edge, drafts);
	return draft.fromSide !== edge.fromSide ||
		draft.toSide !== edge.toSide ||
		draft.fromEnd !== edge.fromEnd ||
		draft.toEnd !== edge.toEnd;
}

function plural(count: number, singular: string): string {
	return count === 1 ? singular : `${singular}s`;
}
