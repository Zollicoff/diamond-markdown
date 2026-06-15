import type { CanvasEdge, CanvasNode } from '$lib/types';

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

export const CANVAS_COLOR_OPTIONS: CanvasColorOption[] = [
	{ value: '', label: 'default', swatch: '#94a3b8' },
	{ value: '1', label: 'red', swatch: OBSIDIAN_CANVAS_COLORS['1'].accent },
	{ value: '2', label: 'orange', swatch: OBSIDIAN_CANVAS_COLORS['2'].accent },
	{ value: '3', label: 'yellow', swatch: OBSIDIAN_CANVAS_COLORS['3'].accent },
	{ value: '4', label: 'green', swatch: OBSIDIAN_CANVAS_COLORS['4'].accent },
	{ value: '5', label: 'cyan', swatch: OBSIDIAN_CANVAS_COLORS['5'].accent },
	{ value: '6', label: 'purple', swatch: OBSIDIAN_CANVAS_COLORS['6'].accent }
];

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
