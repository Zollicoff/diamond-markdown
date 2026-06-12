import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { CanvasDoc, CanvasEdge, CanvasNode } from '$lib/types';
import { canvasBounds, canvasNodeBody, canvasNodeTitle, edgeLines } from '$lib/canvas/view';
import { escAttr, escHtml } from '$lib/util/strings';
import { normalizeVaultPath, resolveInVault } from './paths';
import type { Vault } from './vault';
import { commitChange } from './git';

interface RawCanvasFile {
	nodes?: unknown;
	edges?: unknown;
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
	return {
		id,
		type,
		x: number(node.x),
		y: number(node.y),
		width: Math.max(80, number(node.width, 240)),
		height: Math.max(60, number(node.height, 120)),
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
		toSide: text(edge.toSide),
		label: text(edge.label),
		color: text(edge.color)
	};
}

export function parseCanvasContent(content: string): Pick<CanvasDoc, 'nodes' | 'edges' | 'warnings'> {
	const warnings: string[] = [];
	let parsed: RawCanvasFile;
	try {
		parsed = JSON.parse(content) as RawCanvasFile;
	} catch {
		throw new CanvasFileError('invalid Obsidian Canvas JSON');
	}

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

function nodeClassColor(node: CanvasNode): { fill: string; stroke: string } {
	if (node.type === 'file') return { fill: '#f8fafc', stroke: '#64748b' };
	if (node.type === 'link') return { fill: '#ecfeff', stroke: '#0891b2' };
	if (node.type === 'text') return { fill: '#fffbeb', stroke: '#d97706' };
	return { fill: '#f1f5f9', stroke: '#94a3b8' };
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
		return `<line class="edge" x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}"></line>${label}`;
	}).join('');

	const nodeMarkup = doc.nodes.map((node) => {
		const colors = nodeClassColor(node);
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
</style>
<title>${escHtml(doc.title)} Canvas export</title>
<desc>${doc.nodes.length} nodes and ${doc.edges.length} edges exported from Diamond Markdown.</desc>
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
