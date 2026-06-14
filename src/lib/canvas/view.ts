import type { CanvasDoc, CanvasEdge, CanvasNode, NoteLinkTarget } from '$lib/types';
import { parseWikilinkSubpath, wikilinkFragment } from '$lib/markdown/wikilinks';

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

export interface CanvasNodeRefDraft {
	value: string;
	label: string;
	subpath: string;
}

export interface CanvasDisplayColor {
	accent: string;
	fill: string;
	text: string;
	label: string;
}

export interface CanvasColorOption {
	value: string;
	label: string;
	swatch: string;
}

export interface CanvasFileOpenTarget {
	kind: 'note' | 'canvas';
	path: string;
	title: string;
	actionLabel: string;
	subpath: string | null;
	hash: string | null;
}

export type CanvasFileAssetKind = 'image' | 'pdf' | 'audio' | 'video' | 'file';
export type CanvasTextEmbedKind = CanvasFileAssetKind | 'note' | 'canvas';

export interface CanvasFileAssetPreview {
	kind: CanvasFileAssetKind;
	path: string;
	title: string;
	href: string;
	actionLabel: string;
}

export type CanvasTextPreviewInlineKind = 'text' | 'strong' | 'emphasis' | 'strikethrough' | 'highlight' | 'code' | 'wikilink' | 'link';
export type CanvasTextPreviewCalloutFold = 'open' | 'closed' | null;

export interface CanvasTextInlineTarget {
	kind: 'note' | 'canvas';
	path: string;
	title: string;
	subpath: string | null;
	hash: string | null;
}

export interface CanvasTextPreviewInline {
	kind: CanvasTextPreviewInlineKind;
	text: string;
	href?: string;
	target?: CanvasTextInlineTarget;
}

export type CanvasTextWikilinkResolver = (target: string, label: string | undefined) => CanvasTextInlineTarget | null;
export type CanvasTextEmbedResolver = (
	target: string,
	meta: Pick<CanvasTextPreviewEmbed, 'alt' | 'width' | 'height'>
) => CanvasTextPreviewEmbed | null;

export interface CanvasTextPreviewOptions {
	resolveWikilinkTarget?: CanvasTextWikilinkResolver;
	resolveEmbedTarget?: CanvasTextEmbedResolver;
}

export interface CanvasTextPreviewListItem {
	inline: CanvasTextPreviewInline[];
	checked?: boolean;
}

export interface CanvasTextPreviewTableCell {
	inline: CanvasTextPreviewInline[];
}

export interface CanvasTextPreviewTable {
	headers: CanvasTextPreviewTableCell[];
	rows: CanvasTextPreviewTableCell[][];
}

export interface CanvasTextPreviewEmbed {
	path: string;
	suffix: string;
	kind: CanvasTextEmbedKind;
	title: string;
	alt: string | null;
	width: number | null;
	height: number | null;
}

export interface CanvasTextEmbedOpenTarget {
	kind: 'note' | 'canvas';
	path: string;
	title: string;
	subpath: string | null;
	hash: string | null;
}

export type CanvasTextPreviewBlock =
	| { type: 'heading'; level: 1 | 2 | 3; inline: CanvasTextPreviewInline[] }
	| { type: 'paragraph'; inline: CanvasTextPreviewInline[] }
	| { type: 'quote'; inline: CanvasTextPreviewInline[] }
	| {
		type: 'callout';
		kind: string;
		title: CanvasTextPreviewInline[];
		fold: CanvasTextPreviewCalloutFold;
		body: CanvasTextPreviewBlock[];
	}
	| { type: 'unordered-list'; items: CanvasTextPreviewListItem[] }
	| { type: 'ordered-list'; items: CanvasTextPreviewListItem[] }
	| { type: 'table'; table: CanvasTextPreviewTable }
	| { type: 'embed'; embed: CanvasTextPreviewEmbed }
	| { type: 'code'; language: string; code: string };

export type CanvasTextDrafts = Record<string, string>;
export type CanvasGroupLabelDrafts = Record<string, string>;
export type CanvasNodeRefDrafts = Record<string, CanvasNodeRefDraft>;
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
const OBSIDIAN_CANVAS_COLOR_VALUES: Record<string, string> = {
	red: '1',
	orange: '2',
	yellow: '3',
	green: '4',
	cyan: '5',
	purple: '6'
};
const CANVAS_IMAGE_ASSET_RE = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i;
const CANVAS_PDF_ASSET_RE = /\.pdf$/i;
const CANVAS_AUDIO_ASSET_RE = /\.(mp3|wav|ogg|oga|m4a|flac|aac|opus)$/i;
const CANVAS_VIDEO_ASSET_RE = /\.(mp4|webm|ogv|mov|m4v)$/i;
const CANVAS_URI_RE = /^[a-z][a-z0-9+.-]*:/i;
const CANVAS_SUBPATH_MAX = 240;

export const CANVAS_COLOR_OPTIONS: CanvasColorOption[] = [
	{ value: '', label: 'default', swatch: '#94a3b8' },
	{ value: '1', label: 'red', swatch: OBSIDIAN_CANVAS_COLORS['1'].accent },
	{ value: '2', label: 'orange', swatch: OBSIDIAN_CANVAS_COLORS['2'].accent },
	{ value: '3', label: 'yellow', swatch: OBSIDIAN_CANVAS_COLORS['3'].accent },
	{ value: '4', label: 'green', swatch: OBSIDIAN_CANVAS_COLORS['4'].accent },
	{ value: '5', label: 'cyan', swatch: OBSIDIAN_CANVAS_COLORS['5'].accent },
	{ value: '6', label: 'purple', swatch: OBSIDIAN_CANVAS_COLORS['6'].accent }
];

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

export function normalizeCanvasColor(value: string): string | null {
	const key = value.trim().toLowerCase();
	if (/^[1-6]$/.test(key)) return key;
	if (OBSIDIAN_CANVAS_COLOR_VALUES[key]) return OBSIDIAN_CANVAS_COLOR_VALUES[key];
	return normalizedHexColor(value);
}

export function canvasPaletteColorValue(value: string | undefined): string {
	if (!value) return '';
	const normalized = normalizeCanvasColor(value);
	return normalized ?? '';
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
	if (node.file) return canvasFileNodeDisplayPath(node);
	if (node.url) return node.url;
	return '';
}

export function canvasTextPreviewInlines(value: string, options: CanvasTextPreviewOptions = {}): CanvasTextPreviewInline[] {
	const inlines: CanvasTextPreviewInline[] = [];
	let remaining = value;
	while (remaining.length > 0) {
		const match = firstInlineMatch(remaining, options);
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

export function canvasTextPreviewBlocks(text: string, options: CanvasTextPreviewOptions = {}): CanvasTextPreviewBlock[] {
	const lines = text.replace(/\r\n?/g, '\n').split('\n');
	const blocks: CanvasTextPreviewBlock[] = [];
	let paragraphLines: string[] = [];
	let currentList: Extract<CanvasTextPreviewBlock, { type: 'ordered-list' | 'unordered-list' }> | null = null;
	let codeLanguage: string | null = null;
	let codeLines: string[] = [];

	function flushParagraph(): void {
		const paragraph = paragraphLines.join(' ').trim();
		if (paragraph) blocks.push({ type: 'paragraph', inline: canvasTextPreviewInlines(paragraph, options) });
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

	for (let index = 0; index < lines.length;) {
		const line = lines[index];
		if (codeLanguage !== null) {
			if (/^\s*```/.test(line)) {
				flushCode();
			} else {
				codeLines.push(line);
			}
			index += 1;
			continue;
		}

		const fence = line.match(/^\s*```([a-z0-9_-]*)\s*$/i);
		if (fence) {
			flushParagraph();
			flushList();
			codeLanguage = fence[1] ?? '';
			codeLines = [];
			index += 1;
			continue;
		}

		if (!line.trim()) {
			flushParagraph();
			flushList();
			index += 1;
			continue;
		}

		const embed = canvasTextEmbedPreview(line, options);
		if (embed) {
			flushParagraph();
			flushList();
			blocks.push({ type: 'embed', embed });
			index += 1;
			continue;
		}
		if (isCanvasStandaloneEmbedSyntax(line)) {
			flushParagraph();
			flushList();
			blocks.push({ type: 'paragraph', inline: [{ kind: 'text', text: line.trim() }] });
			index += 1;
			continue;
		}

		const heading = line.match(/^\s{0,3}(#{1,3})\s+(.+)$/);
		if (heading) {
			flushParagraph();
			flushList();
			blocks.push({
				type: 'heading',
				level: heading[1].length as 1 | 2 | 3,
				inline: canvasTextPreviewInlines(heading[2].trim(), options)
			});
			index += 1;
			continue;
		}

		const table = canvasTablePreviewAt(lines, index, options);
		if (table) {
			flushParagraph();
			flushList();
			blocks.push({ type: 'table', table: table.table });
			index = table.nextIndex;
			continue;
		}

		const callout = line.match(/^\s{0,3}>\s?\[!([a-z][a-z0-9_-]*)](?:([+-])?)\s*(.*)$/i);
		if (callout) {
			flushParagraph();
			flushList();
			const bodyLines: string[] = [];
			index += 1;
			while (index < lines.length) {
				const body = lines[index].match(/^\s{0,3}>\s?(.*)$/);
				if (!body) break;
				bodyLines.push(body[1]);
				index += 1;
			}
			const kind = canvasCalloutKind(callout[1]);
			blocks.push({
				type: 'callout',
				kind,
				title: canvasTextPreviewInlines(canvasCalloutTitle(kind, callout[3]), options),
				fold: callout[2] === '-' ? 'closed' : callout[2] === '+' ? 'open' : null,
				body: canvasTextPreviewBlocks(bodyLines.join('\n'), options)
			});
			continue;
		}

		const quote = line.match(/^\s{0,3}>\s?(.*)$/);
		if (quote) {
			flushParagraph();
			flushList();
			blocks.push({ type: 'quote', inline: canvasTextPreviewInlines(quote[1].trim(), options) });
			index += 1;
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
				inline: canvasTextPreviewInlines((task?.[2] ?? unordered?.[1] ?? ordered?.[1] ?? '').trim(), options),
				checked: task ? task[1].toLowerCase() === 'x' : undefined
			});
			index += 1;
			continue;
		}

		flushList();
		paragraphLines.push(line.trim());
		index += 1;
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

export function normalizeCanvasFileSubpath(value: string | undefined): string | null {
	const trimmed = value?.trim() ?? '';
	if (!trimmed) return null;
	if (!trimmed.startsWith('#')) return null;
	if (trimmed.length > CANVAS_SUBPATH_MAX || trimmed.includes('\0') || /[\r\n]/.test(trimmed)) return null;
	const body = trimmed.slice(1).trim();
	if (!body) return null;
	return `#${body}`;
}

export function canvasFileNodeSubpath(node: CanvasNode): string | null {
	if (node.type !== 'file') return null;
	return normalizeCanvasFileSubpath(node.subpath);
}

export function canvasFileNodeFragment(node: CanvasNode): string | null {
	const subpath = canvasFileNodeSubpath(node);
	if (!subpath) return null;
	const fragment = wikilinkFragment(parseWikilinkSubpath(subpath.slice(1)));
	return fragment || null;
}

export function canvasFileNodeDisplayPath(node: CanvasNode): string {
	const filePath = canvasFileNodePath(node) ?? '';
	return `${filePath}${canvasFileNodeSubpath(node) ?? ''}`;
}

export function canvasFileNodeTitle(node: CanvasNode): string {
	const filePath = canvasFileNodePath(node) ?? '';
	return node.label?.trim() || filePath.split('/').pop()?.replace(/\.(md|markdown|canvas)$/i, '') || filePath;
}

export function canvasFileOpenTarget(node: CanvasNode): CanvasFileOpenTarget | null {
	const filePath = canvasFileNodePath(node);
	if (!filePath) return null;
	const title = canvasFileNodeTitle(node);
	const subpath = canvasFileNodeSubpath(node);
	const fragment = canvasFileNodeFragment(node);
	const hash = fragment ? fragment.slice(1) : null;
	if (/\.(md|markdown)$/i.test(filePath)) {
		return { kind: 'note', path: filePath, title, actionLabel: 'Open note', subpath, hash };
	}
	if (/\.canvas$/i.test(filePath)) {
		return { kind: 'canvas', path: filePath, title, actionLabel: 'Open Canvas', subpath, hash: null };
	}
	return null;
}

export function canvasFileAssetKind(assetPath: string): CanvasFileAssetKind {
	const cleanPath = splitCanvasAssetReference(assetPath).path;
	if (CANVAS_IMAGE_ASSET_RE.test(cleanPath)) return 'image';
	if (CANVAS_PDF_ASSET_RE.test(cleanPath)) return 'pdf';
	if (CANVAS_AUDIO_ASSET_RE.test(cleanPath)) return 'audio';
	if (CANVAS_VIDEO_ASSET_RE.test(cleanPath)) return 'video';
	return 'file';
}

export function isCanvasVaultRelativeAssetPath(assetPath: string): boolean {
	const normalized = assetPath.trim().replace(/\\/g, '/');
	if (!normalized || normalized.startsWith('/') || CANVAS_URI_RE.test(normalized) || normalized.includes('\0')) {
		return false;
	}
	return !normalized.split('/').some((segment) => segment === '..');
}

export function splitCanvasAssetReference(target: string): { path: string; suffix: string } {
	const normalized = target.trim().replace(/\\/g, '/');
	const marker = normalized.search(/[?#]/);
	if (marker < 0) return { path: normalized, suffix: '' };
	return {
		path: normalized.slice(0, marker),
		suffix: normalized.slice(marker)
	};
}

export function canvasRawAssetHref(vaultId: string, assetPath: string): string | null {
	const ref = splitCanvasAssetReference(assetPath);
	if (!isCanvasVaultRelativeAssetPath(ref.path)) return null;
	const encodedPath = ref.path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
	return `/api/vaults/${encodeURIComponent(vaultId)}/raw/${encodedPath}${ref.suffix}`;
}

export function canvasFileAssetPreview(node: CanvasNode, vaultId: string): CanvasFileAssetPreview | null {
	const filePath = canvasFileNodePath(node);
	if (!filePath || canvasFileOpenTarget(node)) return null;
	const href = canvasRawAssetHref(vaultId, filePath);
	if (!href) return null;
	const kind = canvasFileAssetKind(filePath);
	const labels: Record<CanvasFileAssetKind, string> = {
		image: 'Open image',
		pdf: 'Open PDF',
		audio: 'Open audio',
		video: 'Open video',
		file: 'Open asset'
	};
	return {
		kind,
		path: filePath,
		title: canvasFileNodeTitle(node),
		href,
		actionLabel: labels[kind]
	};
}

export function canvasTextEmbedHref(
	vaultId: string,
	embed: Pick<CanvasTextPreviewEmbed, 'path' | 'suffix'> & Partial<Pick<CanvasTextPreviewEmbed, 'kind'>>
): string | null {
	if (embed.kind === 'note' || embed.kind === 'canvas') return null;
	return canvasRawAssetHref(vaultId, `${embed.path}${embed.suffix}`);
}

export function canvasTextEmbedOpenTarget(embed: CanvasTextPreviewEmbed): CanvasTextEmbedOpenTarget | null {
	if (embed.kind !== 'note' && embed.kind !== 'canvas') return null;
	return canvasTextInternalTarget(embed.kind, embed.path, embed.suffix, embed.title);
}

export function canvasTextEmbedRouteHref(vaultId: string, embed: CanvasTextPreviewEmbed): string | null {
	const target = canvasTextEmbedOpenTarget(embed);
	return target ? canvasTextInternalTargetHref(vaultId, target) : null;
}

export function canvasTextInlineTargetHref(vaultId: string, inline: CanvasTextPreviewInline): string | null {
	return inline.target ? canvasTextInternalTargetHref(vaultId, inline.target) : null;
}

export function canvasTextNoteWikilinkResolver(targets: NoteLinkTarget[]): CanvasTextWikilinkResolver {
	const lookup = canvasNoteLinkTargetLookup(targets);
	return (target, label) => {
		const { note, ref } = canvasNoteLinkTargetFor(lookup, target);
		if (!note) return null;
		return canvasTextInternalTarget('note', note.path, ref.suffix, label?.trim() || note.title);
	};
}

export function canvasTextNoteEmbedResolver(targets: NoteLinkTarget[]): CanvasTextEmbedResolver {
	const lookup = canvasNoteLinkTargetLookup(targets);
	return (target, meta) => {
		const { note, ref } = canvasNoteLinkTargetFor(lookup, target);
		if (!note) return null;
		if (ref.suffix && !normalizeCanvasFileSubpath(ref.suffix)) return null;
		return {
			path: note.path,
			suffix: ref.suffix,
			kind: 'note',
			title: meta.alt ?? note.title,
			...meta
		};
	};
}

function canvasNoteLinkTargetLookup(targets: NoteLinkTarget[]): Map<string, NoteLinkTarget> {
	const lookup = new Map<string, NoteLinkTarget>();
	for (const target of targets) {
		for (const key of canvasNoteLinkTargetKeys(target)) {
			lookup.set(key, target);
		}
	}
	return lookup;
}

function canvasNoteLinkTargetFor(
	lookup: Map<string, NoteLinkTarget>,
	target: string
): { note: NoteLinkTarget | null; ref: { path: string; suffix: string } } {
	const ref = splitCanvasWikilinkTarget(target);
	if (target.includes('?') || !ref.path) return { note: null, ref };
	const key = ref.path.trim().toLowerCase();
	return { note: lookup.get(key) ?? lookup.get(`${key}.md`) ?? null, ref };
}

function canvasNoteLinkTargetKeys(target: NoteLinkTarget): string[] {
	const path = target.path.trim().toLowerCase();
	const keys = [
		path,
		path.replace(/\.md$/i, ''),
		target.stem.trim().toLowerCase(),
		target.title.trim().toLowerCase(),
		...target.aliases.map((alias) => alias.trim().toLowerCase())
	].filter(Boolean);
	return [...new Set(keys)];
}

function canvasTextInternalTargetHref(vaultId: string, target: CanvasTextInlineTarget): string {
	const encodedPath = target.path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
	const base = `/vault/${encodeURIComponent(vaultId)}/${target.kind === 'canvas' ? 'canvas' : 'note'}/${encodedPath}`;
	return target.hash ? `${base}#${encodeURIComponent(target.hash)}` : base;
}

function canvasTextInternalTarget(
	kind: 'note' | 'canvas',
	path: string,
	suffix: string,
	title: string
): CanvasTextInlineTarget | null {
	if (!isCanvasVaultRelativeAssetPath(path)) return null;
	const subpath = suffix ? normalizeCanvasFileSubpath(suffix) : null;
	if (suffix && !subpath) return null;
	if (kind === 'canvas' && subpath) return null;
	return {
		kind,
		path,
		title,
		subpath,
		hash: kind === 'note' && subpath ? wikilinkFragment(parseWikilinkSubpath(subpath.slice(1))).slice(1) || null : null
	};
}

function canvasTextInlineTargetFromWikilink(target: string, label: string | undefined): CanvasTextInlineTarget | null {
	if (target.includes('?')) return null;
	const ref = splitCanvasWikilinkTarget(target);
	if (!ref.path) return null;
	const title = label?.trim() || ref.path.split('/').pop()?.replace(/\.(md|markdown|canvas)$/i, '') || ref.path;
	if (/\.(md|markdown)$/i.test(ref.path)) return canvasTextInternalTarget('note', ref.path, ref.suffix, title);
	if (/\.canvas$/i.test(ref.path)) return canvasTextInternalTarget('canvas', ref.path, ref.suffix, title);
	return null;
}

function splitCanvasWikilinkTarget(target: string): { path: string; suffix: string } {
	const normalized = target.trim().replace(/\\/g, '/');
	const marker = normalized.indexOf('#');
	if (marker < 0) return { path: normalized, suffix: '' };
	return {
		path: normalized.slice(0, marker),
		suffix: normalized.slice(marker)
	};
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
			.map((node) => [node.id, {
				value: canvasNodeRefValue(node),
				label: node.label ?? '',
				subpath: node.type === 'file' ? canvasFileNodeSubpath(node) ?? '' : ''
			}])
	);
}

export function canvasNodeRefDraftFor(node: CanvasNode, drafts: CanvasNodeRefDrafts): CanvasNodeRefDraft {
	return drafts[node.id] ?? {
		value: canvasNodeRefValue(node),
		label: node.label ?? '',
		subpath: node.type === 'file' ? canvasFileNodeSubpath(node) ?? '' : ''
	};
}

export function canvasNodeRefDraftChanged(node: CanvasNode, drafts: CanvasNodeRefDrafts): boolean {
	const draft = canvasNodeRefDraftFor(node, drafts);
	const subpathChanged = node.type === 'file' && draft.subpath.trim() !== (canvasFileNodeSubpath(node) ?? '');
	return draft.value.trim() !== canvasNodeRefValue(node) || draft.label.trim() !== (node.label ?? '') || subpathChanged;
}

export function canSaveCanvasNodeRefDraft(node: CanvasNode, drafts: CanvasNodeRefDrafts): boolean {
	if (node.type !== 'file' && node.type !== 'link') return false;
	if (!canvasNodeRefDraftChanged(node, drafts)) return false;
	const draft = canvasNodeRefDraftFor(node, drafts);
	if (!draft.value.trim()) return false;
	if (node.type === 'file' && draft.subpath.trim() && !normalizeCanvasFileSubpath(draft.subpath)) return false;
	return true;
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

function canvasCalloutKind(value: string): string {
	return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || 'note';
}

function canvasCalloutTitle(kind: string, title: string | undefined): string {
	const cleanedTitle = title?.trim();
	if (cleanedTitle) return cleanedTitle;
	return kind.replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function canvasTablePreviewAt(
	lines: string[],
	index: number,
	options: CanvasTextPreviewOptions
): { table: CanvasTextPreviewTable; nextIndex: number } | null {
	const header = canvasTableRow(lines[index]);
	const separator = canvasTableSeparator(lines[index + 1]);
	if (!header || !separator || header.length < 2) return null;

	const columnCount = header.length;
	const rows: CanvasTextPreviewTableCell[][] = [];
	let nextIndex = index + 2;
	while (nextIndex < lines.length) {
		const row = canvasTableRow(lines[nextIndex]);
		if (!row) break;
		rows.push(canvasTableCells(row, columnCount, options));
		nextIndex += 1;
	}

	return {
		table: {
			headers: canvasTableCells(header, columnCount, options),
			rows
		},
		nextIndex
	};
}

function canvasTableRow(line: string | undefined): string[] | null {
	if (!line || !line.includes('|')) return null;
	const trimmed = line.trim();
	if (!trimmed || /^[-:|\s]+$/.test(trimmed)) return null;
	const body = trimmed.replace(/^\|/, '').replace(/\|$/, '');
	const cells = body.split('|').map((cell) => cell.trim());
	return cells.length >= 2 ? cells : null;
}

function canvasTableSeparator(line: string | undefined): boolean {
	if (!line || !line.includes('|')) return false;
	const body = line.trim().replace(/^\|/, '').replace(/\|$/, '');
	const cells = body.split('|').map((cell) => cell.trim());
	return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function canvasTableCells(values: string[], columnCount: number, options: CanvasTextPreviewOptions): CanvasTextPreviewTableCell[] {
	return Array.from({ length: columnCount }, (_, index) => ({
		inline: canvasTextPreviewInlines(values[index] ?? '', options)
	}));
}

function canvasImageSizeSpec(raw: string): Pick<CanvasTextPreviewEmbed, 'width' | 'height'> | null {
	const size = raw.trim().match(/^(\d{1,5})(?:\s*x\s*(\d{1,5}))?$/i);
	if (!size) return null;
	const width = Number.parseInt(size[1], 10);
	const height = size[2] ? Number.parseInt(size[2], 10) : null;
	if (!Number.isFinite(width) || width <= 0 || (height != null && (!Number.isFinite(height) || height <= 0))) {
		return null;
	}
	return { width, height };
}

function canvasObsidianEmbedMeta(raw: string | undefined): Pick<CanvasTextPreviewEmbed, 'alt' | 'width' | 'height'> {
	const meta = raw?.trim();
	if (!meta) return { alt: null, width: null, height: null };
	const parts = meta.split('|').map((part) => part.trim());
	const size = canvasImageSizeSpec(parts.at(-1) ?? '');
	if (!size) return { alt: meta, width: null, height: null };
	const alt = parts.slice(0, -1).join('|').trim();
	return { alt: alt || null, ...size };
}

function canvasMarkdownImageMeta(raw: string): Pick<CanvasTextPreviewEmbed, 'alt' | 'width' | 'height'> {
	const directSize = canvasImageSizeSpec(raw);
	if (directSize) return { alt: null, ...directSize };
	const parts = raw.split('|').map((part) => part.trim());
	const size = parts.length > 1 ? canvasImageSizeSpec(parts.at(-1) ?? '') : null;
	if (!size) return { alt: raw.trim() || null, width: null, height: null };
	const alt = parts.slice(0, -1).join('|').trim();
	return { alt: alt || null, ...size };
}

function canvasTextEmbedFromTarget(
	target: string,
	meta: Pick<CanvasTextPreviewEmbed, 'alt' | 'width' | 'height'>
): CanvasTextPreviewEmbed | null {
	const ref = splitCanvasAssetReference(target);
	if (!ref.path || !isCanvasVaultRelativeAssetPath(ref.path)) return null;
	const title = meta.alt ?? ref.path.split('/').pop()?.replace(/\.(md|markdown|canvas)$/i, '') ?? ref.path;
	if (/\.(md|markdown)$/i.test(ref.path)) {
		if (ref.suffix && !normalizeCanvasFileSubpath(ref.suffix)) return null;
		return {
			path: ref.path,
			suffix: ref.suffix,
			kind: 'note',
			title,
			...meta
		};
	}
	if (/\.canvas$/i.test(ref.path)) {
		if (ref.suffix) return null;
		return {
			path: ref.path,
			suffix: '',
			kind: 'canvas',
			title,
			...meta
		};
	}
	const kind = canvasFileAssetKind(ref.path);
	return {
		path: ref.path,
		suffix: ref.suffix,
		kind,
		title,
		...meta
	};
}

function canvasTextEmbedPreview(line: string, options: CanvasTextPreviewOptions = {}): CanvasTextPreviewEmbed | null {
	const trimmed = line.trim();
	const obsidian = trimmed.match(/^!\[\[([^\[\]|\n]+?)(?:\|([^\[\]\n]+?))?]]$/);
	if (obsidian) {
		const target = obsidian[1].trim();
		const meta = canvasObsidianEmbedMeta(obsidian[2]);
		const direct = canvasTextEmbedFromTarget(target, meta);
		if (direct && (direct.kind !== 'file' || canvasAssetReferenceHasExtension(target))) return direct;
		return options.resolveEmbedTarget?.(target, meta) ?? null;
	}

	const markdown = trimmed.match(/^!\[([^\]\n]*)]\(([^)\s]+)\)$/);
	if (markdown) {
		return canvasTextEmbedFromTarget(markdown[2].trim(), canvasMarkdownImageMeta(markdown[1]));
	}

	return null;
}

function canvasAssetReferenceHasExtension(target: string): boolean {
	const ref = splitCanvasAssetReference(target);
	return /\.[^./]+$/.test(ref.path);
}

function isCanvasStandaloneEmbedSyntax(line: string): boolean {
	const trimmed = line.trim();
	return /^!\[\[[^\[\]\n]+]]$/.test(trimmed) || /^!\[[^\]\n]*]\([^\n)]+\)$/.test(trimmed);
}

function firstInlineMatch(
	value: string,
	options: CanvasTextPreviewOptions
): { index: number; raw: string; inline: CanvasTextPreviewInline } | null {
	const candidates = [
		inlineCandidate(value, /`([^`]+)`/, (match) => ({ kind: 'code', text: match[1] })),
		inlineCandidate(value, /\*\*([^*\n]+)\*\*/, (match) => ({ kind: 'strong', text: match[1] })),
		inlineCandidate(value, /~~([^~\n]+)~~/, (match) => ({ kind: 'strikethrough', text: match[1] })),
		inlineCandidate(value, /==([^=\n]+)==/, (match) => ({ kind: 'highlight', text: match[1] })),
		inlineCandidate(value, /\[([^\]\n]+)]\((https?:\/\/[^)\s]+)\)/i, (match) => ({
			kind: 'link',
			text: match[1],
			href: match[2]
		})),
		inlineCandidate(value, /\[\[([^\]|\n]+)(?:\|([^\]\n]+))?]]/, (match) => {
			const rawTarget = match[1].trim();
			const label = match[2]?.trim();
			const target = canvasTextInlineTargetFromWikilink(rawTarget, label) ?? options.resolveWikilinkTarget?.(rawTarget, label);
			const displayTarget = splitCanvasWikilinkTarget(rawTarget).path || rawTarget;
			return {
				kind: 'wikilink',
				text: label || displayTarget,
				...(target ? { target } : {})
			};
		}),
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
		strikethrough: 2,
		highlight: 3,
		link: 4,
		wikilink: 5,
		emphasis: 6,
		text: 7
	};
	return priorities[kind];
}
