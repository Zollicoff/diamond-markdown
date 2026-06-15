import type { CanvasNode, CanvasNotePreview } from '$lib/types';
import { canvasFileOpenTarget } from './files';

export type CanvasNotePreviewMap = Record<string, CanvasNotePreview>;
export type CanvasNotePreviewFetcher = (vaultId: string, paths: string[]) => Promise<CanvasNotePreview[]>;

export interface CanvasNotePreviewLoadResult {
	requestId: number;
	previews: CanvasNotePreview[];
}

export class CanvasNotePreviewRequestQueue {
	private requestId = 0;

	async load(
		vaultId: string,
		paths: string[],
		fetcher: CanvasNotePreviewFetcher
	): Promise<CanvasNotePreviewLoadResult> {
		const requestId = ++this.requestId;
		if (paths.length === 0) return { requestId, previews: [] };
		try {
			return { requestId, previews: await fetcher(vaultId, paths) };
		} catch {
			return { requestId, previews: [] };
		}
	}

	isCurrent(result: CanvasNotePreviewLoadResult): boolean {
		return result.requestId === this.requestId;
	}
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
