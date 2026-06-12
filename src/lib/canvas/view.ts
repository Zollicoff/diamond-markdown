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

const PADDING = 80;

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

function center(node: CanvasNode, bounds: CanvasBounds): { x: number; y: number } {
	return {
		x: node.x - bounds.minX + node.width / 2,
		y: node.y - bounds.minY + node.height / 2
	};
}

export function edgeLines(doc: CanvasDoc, bounds: CanvasBounds): CanvasEdgeLine[] {
	const byId = new Map(doc.nodes.map((node) => [node.id, node]));
	const lines: CanvasEdgeLine[] = [];
	for (const edge of doc.edges) {
		const from = byId.get(edge.fromNode);
		const to = byId.get(edge.toNode);
		if (!from || !to) continue;
		const a = center(from, bounds);
		const b = center(to, bounds);
		lines.push({ edge, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
	}
	return lines;
}

export function canvasSummary(doc: Pick<CanvasDoc, 'nodes' | 'edges'>): string {
	return `${doc.nodes.length} ${plural(doc.nodes.length, 'node')} · ${doc.edges.length} ${plural(doc.edges.length, 'edge')}`;
}

export function canvasNodeTitle(node: CanvasNode): string {
	if (node.type === 'file' && node.file) return node.file;
	if (node.type === 'link' && node.url) return node.url;
	return node.label ?? node.type;
}

export function canvasNodeBody(node: CanvasNode): string {
	if (node.text) return node.text;
	if (node.file) return node.file;
	if (node.url) return node.url;
	return '';
}

function plural(count: number, singular: string): string {
	return count === 1 ? singular : `${singular}s`;
}
