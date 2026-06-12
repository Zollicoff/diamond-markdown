import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { CanvasDoc, CanvasEdge, CanvasMutationResult, CanvasNode } from '$lib/types';
import {
	canvasBounds,
	canvasEdgeMarkerId,
	canvasEdgeMarkerUrl,
	canvasLayeredNodes,
	canvasNodeBody,
	canvasNodeTitle,
	canvasSvgEdgeStroke,
	canvasSvgNodeColors,
	edgeLines
} from '$lib/canvas/view';
import { escAttr, escHtml } from '$lib/util/strings';
import { normalizeVaultPath, resolveInVault } from './paths';
import type { Vault } from './vault';
import { commitChange } from './git';

interface RawCanvasFile {
	nodes?: unknown;
	edges?: unknown;
	[key: string]: unknown;
}

export class CanvasFileError extends Error {
	constructor(message: string, readonly status = 400) {
		super(message);
		this.name = 'CanvasFileError';
	}
}

export interface RenameCanvasResult {
	ok: true;
	from: string;
	to: string;
	sha: string | null;
}

export interface DeleteCanvasResult {
	ok: true;
	path: string;
	sha: string | null;
}

export interface CanvasSvgExport {
	filename: string;
	svg: string;
}

export type CanvasEditAction =
	| 'add-node'
	| 'add-text-node'
	| 'update-node-text'
	| 'update-node-reference'
	| 'move-node'
	| 'delete-node'
	| 'add-edge'
	| 'update-edge-label'
	| 'delete-edge';

export interface MutateCanvasInput {
	path: string;
	action: CanvasEditAction;
	expectedRevision?: string;
	nodeId?: string;
	edgeId?: string;
	nodeType?: 'text' | 'file' | 'link' | 'group';
	fromNode?: string;
	toNode?: string;
	label?: string;
	text?: string;
	file?: string;
	url?: string;
	x?: number;
	y?: number;
	width?: number;
	height?: number;
}

function contentRevision(content: string): string {
	return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

export function ensureCanvasPath(inputPath: string): string {
	const rel = normalizeVaultPath(inputPath);
	if (!rel.toLowerCase().endsWith('.canvas')) {
		throw new CanvasFileError('canvas path must end with .canvas');
	}
	return rel;
}

function text(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

function number(value: unknown, fallback = 0): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function record(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? value as Record<string, unknown>
		: null;
}

function rawCanvasFile(content: string): RawCanvasFile {
	let parsed: unknown;
	try {
		parsed = JSON.parse(content);
	} catch {
		throw new CanvasFileError('invalid Obsidian Canvas JSON');
	}
	const file = record(parsed);
	if (!file) throw new CanvasFileError('invalid Obsidian Canvas JSON');
	return file;
}

function normalizeNode(value: unknown, index: number, warnings: string[]): CanvasNode | null {
	const node = record(value);
	if (!node) {
		warnings.push(`Skipped malformed canvas node at index ${index}.`);
		return null;
	}
	const id = text(node.id);
	if (!id) {
		warnings.push(`Skipped canvas node at index ${index} without an id.`);
		return null;
	}
	const type = text(node.type) ?? 'unknown';
	const minHeight = type === 'file' || type === 'link' ? 150 : 60;
	return {
		id,
		type,
		x: number(node.x),
		y: number(node.y),
		width: Math.max(80, number(node.width, 240)),
		height: Math.max(minHeight, number(node.height, type === 'text' ? 120 : type === 'group' ? 240 : minHeight)),
		text: text(node.text),
		file: text(node.file),
		url: text(node.url),
		label: text(node.label),
		color: text(node.color)
	};
}

function normalizeEdge(value: unknown, index: number, knownNodeIds: Set<string>, warnings: string[]): CanvasEdge | null {
	const edge = record(value);
	if (!edge) {
		warnings.push(`Skipped malformed canvas edge at index ${index}.`);
		return null;
	}
	const fromNode = text(edge.fromNode);
	const toNode = text(edge.toNode);
	if (!fromNode || !toNode) {
		warnings.push(`Skipped canvas edge at index ${index} without both endpoints.`);
		return null;
	}
	if (!knownNodeIds.has(fromNode) || !knownNodeIds.has(toNode)) {
		warnings.push(`Skipped canvas edge at index ${index} because an endpoint is missing.`);
		return null;
	}
	return {
		id: text(edge.id) ?? `${fromNode}->${toNode}:${index}`,
		fromNode,
		toNode,
		fromSide: text(edge.fromSide),
		fromEnd: text(edge.fromEnd),
		toSide: text(edge.toSide),
		toEnd: text(edge.toEnd),
		label: text(edge.label),
		color: text(edge.color)
	};
}

export function parseCanvasContent(content: string): Pick<CanvasDoc, 'nodes' | 'edges' | 'warnings'> {
	const warnings: string[] = [];
	const parsed = rawCanvasFile(content);

	const rawNodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
	const rawEdges = Array.isArray(parsed.edges) ? parsed.edges : [];
	if (!Array.isArray(parsed.nodes)) warnings.push('Canvas file has no nodes array.');
	if (!Array.isArray(parsed.edges)) warnings.push('Canvas file has no edges array.');

	const nodes = rawNodes
		.map((node, index) => normalizeNode(node, index, warnings))
		.filter((node): node is CanvasNode => Boolean(node));
	const knownNodeIds = new Set(nodes.map((node) => node.id));
	const edges = rawEdges
		.map((edge, index) => normalizeEdge(edge, index, knownNodeIds, warnings))
		.filter((edge): edge is CanvasEdge => Boolean(edge));

	return { nodes, edges, warnings };
}

export function loadCanvas(vault: Vault, inputPath: string): CanvasDoc {
	const rel = ensureCanvasPath(inputPath);
	const abs = resolveInVault(vault, rel);
	if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
		throw new CanvasFileError('canvas file not found', 404);
	}

	const content = fs.readFileSync(abs, 'utf-8');
	const stat = fs.statSync(abs);
	const { nodes, edges, warnings } = parseCanvasContent(content);
	return {
		path: rel,
		title: path.basename(rel, '.canvas'),
		revision: contentRevision(content),
		mtime: stat.mtimeMs,
		nodes,
		edges,
		warnings
	};
}

function wrapSvgText(textValue: string, maxChars: number, maxLines: number): string[] {
	const words = textValue.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
	const lines: string[] = [];
	let current = '';
	for (const word of words) {
		const next = current ? `${current} ${word}` : word;
		if (next.length > maxChars && current) {
			lines.push(current);
			current = word;
		} else {
			current = next;
		}
		if (lines.length >= maxLines) break;
	}
	if (current && lines.length < maxLines) lines.push(current);
	if (lines.length === 0 && textValue.trim()) lines.push(textValue.trim().slice(0, maxChars));
	if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
		lines[lines.length - 1] = `${lines[lines.length - 1].replace(/\s+$/, '')}...`;
	}
	return lines;
}

function svgNodeClass(node: CanvasNode): string {
	return node.type.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase() || 'unknown';
}

export function canvasToSvg(doc: CanvasDoc): string {
	const bounds = canvasBounds(doc.nodes);
	const lines = edgeLines(doc, bounds);
	const width = Math.ceil(bounds.width);
	const height = Math.ceil(bounds.height);

	const edgeMarkup = lines.map((line) => {
		const label = line.edge.label
			? `<text class="edge-label" x="${(line.x1 + line.x2) / 2}" y="${(line.y1 + line.y2) / 2 - 8}">${escHtml(line.edge.label)}</text>`
			: '';
		const markerStart = canvasEdgeMarkerUrl(line.edge, 'from') ? ` marker-start="url(#${canvasEdgeMarkerId(line.edge, 'from')})"` : '';
		const markerEnd = canvasEdgeMarkerUrl(line.edge, 'to') ? ` marker-end="url(#${canvasEdgeMarkerId(line.edge, 'to')})"` : '';
		return `<line class="edge" x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}" stroke="${canvasSvgEdgeStroke(line.edge)}"${markerStart}${markerEnd}></line>${label}`;
	}).join('');

	const markerMarkup = lines.flatMap((line) => ([
		canvasEdgeMarkerUrl(line.edge, 'from')
			? `<marker id="${canvasEdgeMarkerId(line.edge, 'from')}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse" markerUnits="strokeWidth"><path d="M 0 0 L 8 4 L 0 8 z" fill="${canvasSvgEdgeStroke(line.edge)}"></path></marker>`
			: '',
		canvasEdgeMarkerUrl(line.edge, 'to')
			? `<marker id="${canvasEdgeMarkerId(line.edge, 'to')}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse" markerUnits="strokeWidth"><path d="M 0 0 L 8 4 L 0 8 z" fill="${canvasSvgEdgeStroke(line.edge)}"></path></marker>`
			: ''
	])).filter(Boolean).join('');

	const nodeMarkup = canvasLayeredNodes(doc.nodes).map((node) => {
		const colors = canvasSvgNodeColors(node);
		const x = node.x - bounds.minX;
		const y = node.y - bounds.minY;
		const title = canvasNodeTitle(node);
		const body = canvasNodeBody(node);
		const titleLines = wrapSvgText(title, Math.max(12, Math.floor((node.width - 24) / 8)), 2);
		const bodyLines = wrapSvgText(body, Math.max(14, Math.floor((node.width - 24) / 7)), 4);
		const titleMarkup = titleLines.map((line, index) => (
			`<tspan x="${x + 12}" dy="${index === 0 ? 0 : 16}">${escHtml(line)}</tspan>`
		)).join('');
		const bodyMarkup = bodyLines.map((line, index) => (
			`<tspan x="${x + 12}" dy="${index === 0 ? 24 : 15}">${escHtml(line)}</tspan>`
		)).join('');
		return [
			`<g class="node node-${svgNodeClass(node)}">`,
			`<rect x="${x}" y="${y}" width="${node.width}" height="${node.height}" rx="8" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="2"></rect>`,
			`<text class="node-type" x="${x + 12}" y="${y + 18}">${escHtml(node.type.toUpperCase())}</text>`,
			`<text class="node-title" x="${x + 12}" y="${y + 42}">${titleMarkup}</text>`,
			bodyMarkup ? `<text class="node-body" x="${x + 12}" y="${y + 62}">${bodyMarkup}</text>` : '',
			'</g>'
		].join('');
	}).join('');

	return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escAttr(doc.title)} Canvas export">
<style>
svg { background: #f8fafc; color: #0f172a; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.edge { stroke: #94a3b8; stroke-width: 2; stroke-linecap: round; }
.edge-label { fill: #475569; font-size: 12px; paint-order: stroke; stroke: #f8fafc; stroke-width: 4px; stroke-linejoin: round; }
.node-type { fill: #64748b; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; }
.node-title { fill: #0f172a; font-size: 14px; font-weight: 700; }
.node-body { fill: #475569; font-size: 12px; }
.node-group rect { stroke-dasharray: 8 6; opacity: 0.72; }
</style>
<title>${escHtml(doc.title)} Canvas export</title>
<desc>${doc.nodes.length} nodes and ${doc.edges.length} edges exported from Diamond Markdown.</desc>
${markerMarkup ? `<defs>${markerMarkup}</defs>` : ''}
${edgeMarkup}
${nodeMarkup}
</svg>`;
}

export function exportCanvasSvg(vault: Vault, inputPath: string): CanvasSvgExport {
	const doc = loadCanvas(vault, inputPath);
	const base = path.basename(doc.path, '.canvas').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'canvas';
	return {
		filename: `${base}.svg`,
		svg: canvasToSvg(doc)
	};
}

function nodeRecord(value: unknown): Record<string, unknown> | null {
	const node = record(value);
	return typeof node?.id === 'string' ? node : null;
}

function edgeRecord(value: unknown): Record<string, unknown> | null {
	const edge = record(value);
	return typeof edge?.id === 'string' ? edge : null;
}

function rawEdgeId(value: unknown, index: number): string | null {
	const edge = record(value);
	if (!edge) return null;
	const explicitId = text(edge.id);
	if (explicitId) return explicitId;
	const fromNode = text(edge.fromNode);
	const toNode = text(edge.toNode);
	return fromNode && toNode ? `${fromNode}->${toNode}:${index}` : null;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
	return typeof value === 'number' && Number.isFinite(value)
		? Math.min(max, Math.max(min, value))
		: fallback;
}

function requiredBoundedNumber(value: unknown, name: string, min: number, max: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw new CanvasFileError(`${name} is required`);
	}
	return boundedNumber(value, value, min, max);
}

function createCanvasNodeId(nodes: unknown[], prefix: string): string {
	const used = new Set(nodes.map((node) => nodeRecord(node)?.id).filter((id): id is string => Boolean(id)));
	for (let attempt = 0; attempt < 20; attempt += 1) {
		const id = `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
		if (!used.has(id)) return id;
	}
	return `${prefix}-${Date.now().toString(36)}`;
}

function createCanvasEdgeId(edges: unknown[]): string {
	const used = new Set(edges.map((edge) => edgeRecord(edge)?.id).filter((id): id is string => Boolean(id)));
	for (let attempt = 0; attempt < 20; attempt += 1) {
		const id = `edge-${crypto.randomUUID().slice(0, 8)}`;
		if (!used.has(id)) return id;
	}
	return `edge-${Date.now().toString(36)}`;
}

function nextNodePosition(nodes: unknown[]): { x: number; y: number } {
	let maxRight = -Infinity;
	let minY = Infinity;
	for (const raw of nodes) {
		const node = nodeRecord(raw);
		if (!node) continue;
		const x = number(node.x);
		const y = number(node.y);
		const width = Math.max(80, number(node.width, 240));
		maxRight = Math.max(maxRight, x + width);
		minY = Math.min(minY, y);
	}
	if (!Number.isFinite(maxRight)) return { x: 0, y: 0 };
	return { x: maxRight + 80, y: Number.isFinite(minY) ? minY : 0 };
}

function cleanOptionalLabel(value: unknown): string {
	return typeof value === 'string' ? value.trim().slice(0, 200) : '';
}

function requiredText(value: unknown, name: string, maxLength: number): string {
	const cleaned = typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
	if (!cleaned) throw new CanvasFileError(`${name} is required`);
	return cleaned;
}

function cleanCanvasUrl(value: unknown): string {
	const cleaned = requiredText(value, 'url', 2_000);
	let parsed: URL;
	try {
		parsed = new URL(cleaned);
	} catch {
		throw new CanvasFileError('url must be a valid URL');
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new CanvasFileError('url must use http or https');
	}
	return parsed.toString();
}

function canvasNodeType(value: unknown): 'text' | 'file' | 'link' | 'group' {
	if (value === undefined || value === 'text') return 'text';
	if (value === 'file' || value === 'link' || value === 'group') return value;
	throw new CanvasFileError('unsupported canvas node type');
}

export async function mutateCanvas(vault: Vault, input: MutateCanvasInput): Promise<CanvasMutationResult> {
	const rel = ensureCanvasPath(input.path);
	const abs = resolveInVault(vault, rel);
	if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
		throw new CanvasFileError('canvas file not found', 404);
	}

	const content = fs.readFileSync(abs, 'utf-8');
	if (input.expectedRevision && contentRevision(content) !== input.expectedRevision) {
		throw new CanvasFileError('canvas changed on disk; reload before saving', 409);
	}

	const parsed = rawCanvasFile(content);
	const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
	const edges = Array.isArray(parsed.edges) ? parsed.edges : [];
	if (!Array.isArray(parsed.nodes)) {
		parsed.nodes = nodes;
	}
	if (!Array.isArray(parsed.edges)) {
		parsed.edges = edges;
	}

	if (input.action === 'add-node' || input.action === 'add-text-node') {
		const type = input.action === 'add-text-node' ? 'text' : canvasNodeType(input.nodeType);
		const position = nextNodePosition(nodes);
		const minHeight = type === 'text' ? 80 : type === 'group' ? 120 : 150;
		const defaultWidth = type === 'group' ? 480 : 260;
		const defaultHeight = type === 'text' ? 140 : type === 'group' ? 260 : 160;
		const node: Record<string, unknown> = {
			id: createCanvasNodeId(nodes, type),
			type,
			x: boundedNumber(input.x, position.x, -100_000, 100_000),
			y: boundedNumber(input.y, position.y, -100_000, 100_000),
			width: boundedNumber(input.width, defaultWidth, 120, 1200),
			height: boundedNumber(input.height, defaultHeight, minHeight, 900)
		};
		if (type === 'text') {
			node.text = typeof input.text === 'string' && input.text.trim() ? input.text : 'New text card';
		} else if (type === 'file') {
			node.file = normalizeVaultPath(requiredText(input.file, 'file', 500));
			const label = cleanOptionalLabel(input.label);
			if (label) node.label = label;
		} else if (type === 'link') {
			node.url = cleanCanvasUrl(input.url);
			const label = cleanOptionalLabel(input.label);
			if (label) node.label = label;
		} else {
			node.label = cleanOptionalLabel(input.label ?? input.text) || 'Group';
		}
		nodes.push(node);
	} else if (input.action === 'update-node-text') {
		if (!input.nodeId) throw new CanvasFileError('nodeId is required');
		if (typeof input.text !== 'string') throw new CanvasFileError('text is required');
		const node = nodes.map(nodeRecord).find((candidate) => candidate?.id === input.nodeId);
		if (!node) throw new CanvasFileError('canvas node not found', 404);
		if (node.type !== 'text') throw new CanvasFileError('only text canvas nodes can be edited inline');
		node.text = input.text;
	} else if (input.action === 'update-node-reference') {
		if (!input.nodeId) throw new CanvasFileError('nodeId is required');
		const node = nodes.map(nodeRecord).find((candidate) => candidate?.id === input.nodeId);
		if (!node) throw new CanvasFileError('canvas node not found', 404);
		if (node.type === 'file') {
			node.file = normalizeVaultPath(requiredText(input.file, 'file', 500));
		} else if (node.type === 'link') {
			node.url = cleanCanvasUrl(input.url);
		} else {
			throw new CanvasFileError('only file and link canvas nodes can edit references inline');
		}
		const label = cleanOptionalLabel(input.label);
		if (label) node.label = label;
		else delete node.label;
	} else if (input.action === 'move-node') {
		if (!input.nodeId) throw new CanvasFileError('nodeId is required');
		const node = nodes.map(nodeRecord).find((candidate) => candidate?.id === input.nodeId);
		if (!node) throw new CanvasFileError('canvas node not found', 404);
		node.x = requiredBoundedNumber(input.x, 'x', -100_000, 100_000);
		node.y = requiredBoundedNumber(input.y, 'y', -100_000, 100_000);
	} else if (input.action === 'delete-node') {
		if (!input.nodeId) throw new CanvasFileError('nodeId is required');
		const index = nodes.findIndex((node) => nodeRecord(node)?.id === input.nodeId);
		if (index < 0) throw new CanvasFileError('canvas node not found', 404);
		nodes.splice(index, 1);
		for (let edgeIndex = edges.length - 1; edgeIndex >= 0; edgeIndex -= 1) {
			const edge = record(edges[edgeIndex]);
			if (edge && (edge.fromNode === input.nodeId || edge.toNode === input.nodeId)) {
				edges.splice(edgeIndex, 1);
			}
		}
	} else if (input.action === 'add-edge') {
		const fromNode = text(input.fromNode);
		const toNode = text(input.toNode);
		if (!fromNode || !toNode) throw new CanvasFileError('fromNode and toNode are required');
		if (fromNode === toNode) throw new CanvasFileError('canvas edge endpoints must be different');
		const nodeIds = new Set(nodes.map((node) => nodeRecord(node)?.id).filter((id): id is string => Boolean(id)));
		if (!nodeIds.has(fromNode) || !nodeIds.has(toNode)) {
			throw new CanvasFileError('canvas edge endpoint not found', 404);
		}
		const label = typeof input.label === 'string' ? input.label.trim().slice(0, 200) : '';
		const edge: Record<string, unknown> = {
			id: createCanvasEdgeId(edges),
			fromNode,
			toNode,
			fromSide: 'right',
			toSide: 'left'
		};
		if (label) edge.label = label;
		edges.push(edge);
	} else if (input.action === 'update-edge-label') {
		if (!input.edgeId) throw new CanvasFileError('edgeId is required');
		if (typeof input.label !== 'string') throw new CanvasFileError('label is required');
		const edge = edges.map((candidate, edgeIndex) => ({
			id: rawEdgeId(candidate, edgeIndex),
			record: record(candidate)
		})).find((candidate) => candidate.id === input.edgeId)?.record;
		if (!edge) throw new CanvasFileError('canvas edge not found', 404);
		const label = input.label.trim().slice(0, 200);
		if (label) edge.label = label;
		else delete edge.label;
	} else if (input.action === 'delete-edge') {
		if (!input.edgeId) throw new CanvasFileError('edgeId is required');
		const index = edges.findIndex((edge, edgeIndex) => rawEdgeId(edge, edgeIndex) === input.edgeId);
		if (index < 0) throw new CanvasFileError('canvas edge not found', 404);
		edges.splice(index, 1);
	} else {
		throw new CanvasFileError('unsupported canvas edit action');
	}

	const nextContent = `${JSON.stringify(parsed, null, 2)}\n`;
	const tmp = `${abs}.tmp`;
	fs.writeFileSync(tmp, nextContent);
	fs.renameSync(tmp, abs);
	const commit = await commitChange(vault, [rel], 'edit', rel);
	return {
		ok: true,
		path: rel,
		sha: commit?.sha ?? null,
		doc: loadCanvas(vault, rel)
	};
}

export async function renameCanvas(vault: Vault, fromInput: string, toInput: string): Promise<RenameCanvasResult> {
	const from = ensureCanvasPath(fromInput);
	const to = ensureCanvasPath(toInput);
	if (from === to) return { ok: true, from, to, sha: null };

	const fromAbs = resolveInVault(vault, from);
	const toAbs = resolveInVault(vault, to);
	if (!fs.existsSync(fromAbs) || !fs.statSync(fromAbs).isFile()) {
		throw new CanvasFileError('canvas file not found', 404);
	}
	if (fs.existsSync(toAbs)) {
		throw new CanvasFileError('destination already exists', 409);
	}

	fs.mkdirSync(path.dirname(toAbs), { recursive: true });
	fs.renameSync(fromAbs, toAbs);
	const commit = await commitChange(vault, [from, to], 'rename', `${from} → ${to}`);
	return { ok: true, from, to, sha: commit?.sha ?? null };
}

export async function deleteCanvas(vault: Vault, inputPath: string): Promise<DeleteCanvasResult> {
	const rel = ensureCanvasPath(inputPath);
	const abs = resolveInVault(vault, rel);
	if (fs.existsSync(abs)) {
		if (!fs.statSync(abs).isFile()) throw new CanvasFileError('canvas path is not a file', 400);
		fs.unlinkSync(abs);
	}
	const commit = await commitChange(vault, [rel], 'delete', rel);
	return { ok: true, path: rel, sha: commit?.sha ?? null };
}
