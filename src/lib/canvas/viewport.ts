import type { CanvasBounds } from './view';

export const CANVAS_ZOOM_MIN = 0.25;
export const CANVAS_ZOOM_MAX = 2;
export const CANVAS_ZOOM_LEVELS = [0.25, 0.33, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2] as const;

const FIT_PADDING = 64;

export function normalizeCanvasZoom(value: number): number {
	if (!Number.isFinite(value) || value <= 0) return 1;
	const clamped = Math.min(CANVAS_ZOOM_MAX, Math.max(CANVAS_ZOOM_MIN, value));
	return Math.round(clamped * 100) / 100;
}

export function canvasZoomLabel(zoom: number): string {
	return `${Math.round(normalizeCanvasZoom(zoom) * 100)}%`;
}

export function canZoomCanvasIn(zoom: number): boolean {
	return normalizeCanvasZoom(zoom) < CANVAS_ZOOM_MAX;
}

export function canZoomCanvasOut(zoom: number): boolean {
	return normalizeCanvasZoom(zoom) > CANVAS_ZOOM_MIN;
}

export function stepCanvasZoom(zoom: number, direction: 'in' | 'out'): number {
	const normalized = normalizeCanvasZoom(zoom);
	if (direction === 'in') {
		return CANVAS_ZOOM_LEVELS.find((level) => level > normalized) ?? CANVAS_ZOOM_MAX;
	}
	return [...CANVAS_ZOOM_LEVELS].reverse().find((level) => level < normalized) ?? CANVAS_ZOOM_MIN;
}

export function fitCanvasZoom(bounds: Pick<CanvasBounds, 'width' | 'height'>, viewportWidth: number, viewportHeight: number): number {
	if (bounds.width <= 0 || bounds.height <= 0 || viewportWidth <= 0 || viewportHeight <= 0) return 1;
	const usableWidth = Math.max(1, viewportWidth - FIT_PADDING);
	const usableHeight = Math.max(1, viewportHeight - FIT_PADDING);
	return normalizeCanvasZoom(Math.min(usableWidth / bounds.width, usableHeight / bounds.height));
}

export function scaledCanvasLength(length: number, zoom: number): number {
	return Math.max(1, Math.ceil(length * normalizeCanvasZoom(zoom)));
}

export function canvasZoomLayerStyle(bounds: Pick<CanvasBounds, 'width' | 'height'>, zoom: number): string {
	return [
		`width: ${scaledCanvasLength(bounds.width, zoom)}px`,
		`height: ${scaledCanvasLength(bounds.height, zoom)}px`
	].join('; ');
}

export function canvasBoardZoomStyle(bounds: Pick<CanvasBounds, 'width' | 'height'>, zoom: number): string {
	return [
		`width: ${bounds.width}px`,
		`height: ${bounds.height}px`,
		`transform: scale(${normalizeCanvasZoom(zoom)})`
	].join('; ');
}

export function canvasGridBackgroundSize(zoom: number): string {
	const size = Math.max(12, Math.round(36 * normalizeCanvasZoom(zoom)));
	return `${size}px ${size}px`;
}
