import type { CanvasNode, CanvasNotePreview } from '$lib/types';
import { LatestRequestQueue } from '$lib/util/latest-request';
import { canvasFileOpenTarget } from './files';

export type CanvasNotePreviewMap = Record<string, CanvasNotePreview>;
export type CanvasNotePreviewFetcher = (vaultId: string, paths: string[]) => Promise<CanvasNotePreview[]>;
export type CanvasNotePreviewApplier = (previews: CanvasNotePreviewMap) => void;
export type CanvasNotePreviewLoader = () => void | Promise<void>;

export interface CanvasNotePreviewLoadResult {
	requestId: number;
	previews: CanvasNotePreview[];
}

export interface CanvasNotePreviewRefreshEvent {
	vaultId: string;
}

export class CanvasNotePreviewRequestQueue {
	private queue = new LatestRequestQueue();

	async load(
		vaultId: string,
		paths: string[],
		fetcher: CanvasNotePreviewFetcher
	): Promise<CanvasNotePreviewLoadResult> {
		const result = await this.queue.load(
			() => paths.length > 0 ? fetcher(vaultId, paths) : Promise.resolve([]),
			[] as CanvasNotePreview[]
		);
		return { requestId: result.requestId, previews: result.value };
	}

	isCurrent(result: CanvasNotePreviewLoadResult): boolean {
		return this.queue.isCurrent(result);
	}
}

export async function refreshCanvasNotePreviews(
	queue: CanvasNotePreviewRequestQueue,
	vaultId: string,
	paths: string[],
	fetcher: CanvasNotePreviewFetcher,
	applyPreviews: CanvasNotePreviewApplier
): Promise<CanvasNotePreviewLoadResult> {
	const result = await queue.load(vaultId, paths, fetcher);
	if (queue.isCurrent(result)) applyPreviews(canvasNotePreviewMap(result.previews));
	return result;
}

export function isCanvasNotePreviewRefreshEvent(
	vaultId: string,
	event: CanvasNotePreviewRefreshEvent
): boolean {
	return event.vaultId === vaultId;
}

export function refreshCanvasNotePreviewsForVaultEvent(
	vaultId: string,
	event: CanvasNotePreviewRefreshEvent,
	loadPreviews: CanvasNotePreviewLoader
): boolean {
	if (!isCanvasNotePreviewRefreshEvent(vaultId, event)) return false;
	void loadPreviews();
	return true;
}

export function canvasNotePreviewPaths(nodes: CanvasNode[]): string[] {
	const paths = nodes
		.map((node) => canvasFileOpenTarget(node))
		.filter((target): target is NonNullable<ReturnType<typeof canvasFileOpenTarget>> => target?.kind === 'note')
		.map((target) => target.path);
	return [...new Set(paths)];
}

export function canvasNotePreviewMap(previews: CanvasNotePreview[]): CanvasNotePreviewMap {
	return Object.fromEntries(previews.map((preview) => [preview.path, preview]));
}

export function canvasNotePreviewForNode(
	node: CanvasNode,
	previews: CanvasNotePreviewMap
): CanvasNotePreview | null {
	const target = canvasFileOpenTarget(node);
	return target?.kind === 'note' ? previews[target.path] ?? null : null;
}
