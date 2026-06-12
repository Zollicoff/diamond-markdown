import type { CanvasDoc, CanvasEdge, CanvasNode } from '$lib/types';

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
}

export interface CanvasNodeRefDraft {
	value: string;
	label: string;
}

export interface CanvasDisplayColor {
	accent: string;
	fill: string;
	text: string;
	label: string;
}

export interface CanvasFileOpenTarget {
	kind: 'note' | 'canvas';
	path: string;
	title: string;
	actionLabel: string;
}

export type CanvasTextPreviewInlineKind = 'text' | 'strong' | 'emphasis' | 'code' | 'wikilink' | 'link';

export interface CanvasTextPreviewInline {
	kind: CanvasTextPreviewInlineKind;
	text: string;
	href?: string;
}

export interface CanvasTextPreviewListItem {
	inline: CanvasTextPreviewInline[];
	checked?: boolean;
}

export type CanvasTextPreviewBlock =
	| { type: 'heading'; level: 1 | 2 | 3; inline: CanvasTextPreviewInline[] }
	| { type: 'paragraph'; inline: CanvasTextPreviewInline[] }
	| { type: 'quote'; inline: CanvasTextPreviewInline[] }
	| { type: 'unordered-list'; items: CanvasTextPreviewListItem[] }
	| { type: 'ordered-list'; items: CanvasTextPreviewListItem[] }
	| { type: 'code'; language: string; code: string };

export type CanvasTextDrafts = Record<string, string>;
export type CanvasGroupLabelDrafts = Record<string, string>;
export type CanvasNodeRefDrafts = Record<string, CanvasNodeRefDraft>;
export type CanvasEdgeLabelDrafts = Record<string, string>;
export type CanvasAddNodeType = 'text' | 'file' | 'link' | 'group';

const PADDING = 80;
const OBSIDIAN_CANVAS_COLORS: Record<string, CanvasDisplayColor> = {
	'1': { accent: '#dc2626', fill: '#fee2e2', text: '#7f1d1d', label: 'red' },
	red: { accent: '#dc2626', fill: '#fee2e2', text: '#7f1d1d', label: 'red' },
	'2': { accent: '#ea580c', fill: '#ffedd5', text: '#7c2d12', label: 'orange' },
	orange: { accent: '#ea580c', fill: '#ffedd5', text: '#7c2d12', label: 'orange' },
	'3': { accent: '#ca8a04', fill: '#fef9c3', text: '#713f12', label: 'yellow' },
	yellow: { accent: '#ca8a04', fill: '#fef9c3', text: '#713f12', label: 'yellow' },
	'4': { accent: '#16a34a', fill: '#dcfce7', text: '#14532d', label: 'green' },
	green: { accent: '#16a34a', fill: '#dcfce7', text: '#14532d', label: 'green' },
	'5': { accent: '#0891b2', fill: '#cffafe', text: '#164e63', label: 'cyan' },
	cyan: { accent: '#0891b2', fill: '#cffafe', text: '#164e63', label: 'cyan' },
	'6': { accent: '#9333ea', fill: '#f3e8ff', text: '#581c87', label: 'purple' },
	purple: { accent: '#9333ea', fill: '#f3e8ff', text: '#581c87', label: 'purple' }
};

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

function normalizedHexColor(value: string): string | null {
	const trimmed = value.trim();
	const short = trimmed.match(/^#([0-9a-f]{3})$/i);
	if (short) {
		return `#${short[1].split('').map((char) => char + char).join('').toLowerCase()}`;
	}
	const long = trimmed.match(/^#([0-9a-f]{6})$/i);
	return long ? `#${long[1].toLowerCase()}` : null;
}

export function canvasDisplayColor(value: string | undefined): CanvasDisplayColor | null {
	if (!value) return null;
	const key = value.trim().toLowerCase();
	if (OBSIDIAN_CANVAS_COLORS[key]) return OBSIDIAN_CANVAS_COLORS[key];

	const hex = normalizedHexColor(value);
	return hex
		? { accent: hex, fill: `${hex}22`, text: '#0f172a', label: 'custom' }
		: null;
}

export function canvasNodeColorStyle(node: Pick<CanvasNode, 'color'>): string {
	const color = canvasDisplayColor(node.color);
	if (!color) return '';
	return [
		`--canvas-node-border: ${color.accent}`,
		`--canvas-node-bg: ${color.fill}`,
		`--canvas-node-type-color: ${color.accent}`
	].join('; ');
}

export function canvasNodeStyle(node: CanvasNode, bounds: CanvasBounds): string {
	return [nodeStyle(node, bounds), canvasNodeColorStyle(node)].filter(Boolean).join('; ');
}

export function canvasEdgeStyle(edge: Pick<CanvasEdge, 'color'>): string {
	const color = canvasDisplayColor(edge.color);
	return color ? `stroke: ${color.accent};` : '';
}

export function canvasEdgeMarkerStyle(edge: Pick<CanvasEdge, 'color'>): string {
	const color = canvasDisplayColor(edge.color);
	return color ? `fill: ${color.accent};` : '';
}

export function canvasSvgNodeColors(node: CanvasNode): { fill: string; stroke: string } {
	const color = canvasDisplayColor(node.color);
	if (color) return { fill: color.fill, stroke: color.accent };
	if (node.type === 'group') return { fill: '#e2e8f0', stroke: '#64748b' };
	if (node.type === 'file') return { fill: '#f8fafc', stroke: '#64748b' };
	if (node.type === 'link') return { fill: '#ecfeff', stroke: '#0891b2' };
	if (node.type === 'text') return { fill: '#fffbeb', stroke: '#d97706' };
	return { fill: '#f1f5f9', stroke: '#94a3b8' };
}

export function canvasSvgEdgeStroke(edge: Pick<CanvasEdge, 'color'>): string {
	return canvasDisplayColor(edge.color)?.accent ?? '#94a3b8';
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
	if (node.file) return node.file;
	if (node.url) return node.url;
	return '';
}

export function canvasTextPreviewInlines(value: string): CanvasTextPreviewInline[] {
	const inlines: CanvasTextPreviewInline[] = [];
	let remaining = value;
	while (remaining.length > 0) {
		const match = firstInlineMatch(remaining);
		if (!match) {
			inlines.push({ kind: 'text', text: remaining });
			break;
		}
		if (match.index > 0) {
			inlines.push({ kind: 'text', text: remaining.slice(0, match.index) });
		}
		inlines.push(match.inline);
		remaining = remaining.slice(match.index + match.raw.length);
	}
	return inlines.filter((inline) => inline.text.length > 0);
}

export function canvasTextPreviewBlocks(text: string): CanvasTextPreviewBlock[] {
	const lines = text.replace(/\r\n?/g, '\n').split('\n');
	const blocks: CanvasTextPreviewBlock[] = [];
	let paragraphLines: string[] = [];
	let currentList: Extract<CanvasTextPreviewBlock, { type: 'ordered-list' | 'unordered-list' }> | null = null;
	let codeLanguage: string | null = null;
	let codeLines: string[] = [];

	function flushParagraph(): void {
		const paragraph = paragraphLines.join(' ').trim();
		if (paragraph) blocks.push({ type: 'paragraph', inline: canvasTextPreviewInlines(paragraph) });
		paragraphLines = [];
	}

	function flushList(): void {
		if (currentList && currentList.items.length > 0) blocks.push(currentList);
		currentList = null;
	}

	function flushCode(): void {
		blocks.push({ type: 'code', language: codeLanguage ?? '', code: codeLines.join('\n') });
		codeLanguage = null;
		codeLines = [];
	}

	for (const line of lines) {
		if (codeLanguage !== null) {
			if (/^\s*```/.test(line)) {
				flushCode();
			} else {
				codeLines.push(line);
			}
			continue;
		}

		const fence = line.match(/^\s*```([a-z0-9_-]*)\s*$/i);
		if (fence) {
			flushParagraph();
			flushList();
			codeLanguage = fence[1] ?? '';
			codeLines = [];
			continue;
		}

		if (!line.trim()) {
			flushParagraph();
			flushList();
			continue;
		}

		const heading = line.match(/^\s{0,3}(#{1,3})\s+(.+)$/);
		if (heading) {
			flushParagraph();
			flushList();
			blocks.push({
				type: 'heading',
				level: heading[1].length as 1 | 2 | 3,
				inline: canvasTextPreviewInlines(heading[2].trim())
			});
			continue;
		}

		const quote = line.match(/^\s{0,3}>\s?(.*)$/);
		if (quote) {
			flushParagraph();
			flushList();
			blocks.push({ type: 'quote', inline: canvasTextPreviewInlines(quote[1].trim()) });
			continue;
		}

		const task = line.match(/^\s*[-*]\s+\[([ xX])]\s+(.+)$/);
		const unordered = task ? null : line.match(/^\s*[-*]\s+(.+)$/);
		const ordered = task || unordered ? null : line.match(/^\s*\d+[.)]\s+(.+)$/);
		if (task || unordered || ordered) {
			const type = ordered ? 'ordered-list' : 'unordered-list';
			flushParagraph();
			if (!currentList || currentList.type !== type) {
				flushList();
				currentList = { type, items: [] };
			}
			currentList!.items.push({
				inline: canvasTextPreviewInlines((task?.[2] ?? unordered?.[1] ?? ordered?.[1] ?? '').trim()),
				checked: task ? task[1].toLowerCase() === 'x' : undefined
			});
			continue;
		}

		flushList();
		paragraphLines.push(line.trim());
	}

	if (codeLanguage !== null) flushCode();
	flushParagraph();
	flushList();
	return blocks;
}

export function canvasFileNodePath(node: CanvasNode): string | null {
	if (node.type !== 'file') return null;
	const filePath = node.file?.trim() ?? '';
	return filePath || null;
}

export function canvasFileNodeTitle(node: CanvasNode): string {
	const filePath = canvasFileNodePath(node) ?? '';
	return node.label?.trim() || filePath.split('/').pop()?.replace(/\.(md|markdown|canvas)$/i, '') || filePath;
}

export function canvasFileOpenTarget(node: CanvasNode): CanvasFileOpenTarget | null {
	const filePath = canvasFileNodePath(node);
	if (!filePath) return null;
	const title = canvasFileNodeTitle(node);
	if (/\.(md|markdown)$/i.test(filePath)) {
		return { kind: 'note', path: filePath, title, actionLabel: 'Open note' };
	}
	if (/\.canvas$/i.test(filePath)) {
		return { kind: 'canvas', path: filePath, title, actionLabel: 'Open Canvas' };
	}
	return null;
}

export function canvasLinkNodeHref(node: CanvasNode): string | null {
	if (node.type !== 'link') return null;
	const rawUrl = node.url?.trim();
	if (!rawUrl) return null;
	try {
		const url = new URL(rawUrl);
		return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
	} catch {
		return null;
	}
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

export function canvasNodeRefValue(node: CanvasNode): string {
	if (node.type === 'file') return node.file ?? '';
	if (node.type === 'link') return node.url ?? '';
	return '';
}

export function canvasNodeRefDrafts(nodes: CanvasNode[]): CanvasNodeRefDrafts {
	return Object.fromEntries(
		nodes
			.filter((node) => node.type === 'file' || node.type === 'link')
			.map((node) => [node.id, { value: canvasNodeRefValue(node), label: node.label ?? '' }])
	);
}

export function canvasNodeRefDraftFor(node: CanvasNode, drafts: CanvasNodeRefDrafts): CanvasNodeRefDraft {
	return drafts[node.id] ?? { value: canvasNodeRefValue(node), label: node.label ?? '' };
}

export function canvasNodeRefDraftChanged(node: CanvasNode, drafts: CanvasNodeRefDrafts): boolean {
	const draft = canvasNodeRefDraftFor(node, drafts);
	return draft.value.trim() !== canvasNodeRefValue(node) || draft.label.trim() !== (node.label ?? '');
}

export function canSaveCanvasNodeRefDraft(node: CanvasNode, drafts: CanvasNodeRefDrafts): boolean {
	return (node.type === 'file' || node.type === 'link') &&
		canvasNodeRefDraftChanged(node, drafts) &&
		canvasNodeRefDraftFor(node, drafts).value.trim().length > 0;
}

export function canvasNodePositionChanged(node: CanvasNode, x: number, y: number): boolean {
	return Math.round(node.x) !== Math.round(x) || Math.round(node.y) !== Math.round(y);
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
			description: `${fromLabel} to ${toLabel}${label !== 'unlabeled' ? `: ${label}` : ''}`
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

function plural(count: number, singular: string): string {
	return count === 1 ? singular : `${singular}s`;
}

function firstInlineMatch(value: string): { index: number; raw: string; inline: CanvasTextPreviewInline } | null {
	const candidates = [
		inlineCandidate(value, /`([^`]+)`/, (match) => ({ kind: 'code', text: match[1] })),
		inlineCandidate(value, /\*\*([^*\n]+)\*\*/, (match) => ({ kind: 'strong', text: match[1] })),
		inlineCandidate(value, /\[([^\]\n]+)]\((https?:\/\/[^)\s]+)\)/i, (match) => ({
			kind: 'link',
			text: match[1],
			href: match[2]
		})),
		inlineCandidate(value, /\[\[([^\]|\n]+)(?:\|([^\]\n]+))?]]/, (match) => ({
			kind: 'wikilink',
			text: match[2] ?? match[1]
		})),
		inlineCandidate(value, /\*([^*\n]+)\*/, (match) => ({ kind: 'emphasis', text: match[1] }))
	].filter((candidate): candidate is { index: number; raw: string; inline: CanvasTextPreviewInline } => Boolean(candidate));

	return candidates.sort((a, b) => a.index - b.index || inlinePriority(a.inline.kind) - inlinePriority(b.inline.kind))[0] ?? null;
}

function inlineCandidate(
	value: string,
	pattern: RegExp,
	createInline: (match: RegExpMatchArray) => CanvasTextPreviewInline
): { index: number; raw: string; inline: CanvasTextPreviewInline } | null {
	const match = value.match(pattern);
	if (!match || match.index === undefined || !match[0]) return null;
	return { index: match.index, raw: match[0], inline: createInline(match) };
}

function inlinePriority(kind: CanvasTextPreviewInlineKind): number {
	const priorities: Record<CanvasTextPreviewInlineKind, number> = {
		code: 0,
		strong: 1,
		link: 2,
		wikilink: 3,
		emphasis: 4,
		text: 5
	};
	return priorities[kind];
}
