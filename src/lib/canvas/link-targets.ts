import type { NoteLinkTarget } from '$lib/types';

export type CanvasLinkTargetFetcher = (vaultId: string) => Promise<NoteLinkTarget[]>;

export interface CanvasLinkTargetLoadResult {
	requestId: number;
	targets: NoteLinkTarget[];
}

export interface CanvasLinkTargetRefreshEvent {
	vaultId: string;
}

export class CanvasLinkTargetRequestQueue {
	private requestId = 0;

	async load(vaultId: string, fetcher: CanvasLinkTargetFetcher): Promise<CanvasLinkTargetLoadResult> {
		const requestId = ++this.requestId;
		try {
			return { requestId, targets: await fetcher(vaultId) };
		} catch {
			return { requestId, targets: [] };
		}
	}

	isCurrent(result: CanvasLinkTargetLoadResult): boolean {
		return result.requestId === this.requestId;
	}
}

export function isCanvasLinkTargetRefreshEvent(
	vaultId: string,
	event: CanvasLinkTargetRefreshEvent
): boolean {
	return event.vaultId === vaultId;
}
