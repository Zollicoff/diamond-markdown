import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { CanvasDoc, CanvasEdge, CanvasNode } from '$lib/types';
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
