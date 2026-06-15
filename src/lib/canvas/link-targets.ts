import type { NoteLinkTarget } from '$lib/types';
import { LatestRequestQueue } from '$lib/util/latest-request';

export type CanvasLinkTargetFetcher = (vaultId: string) => Promise<NoteLinkTarget[]>;

export interface CanvasLinkTargetLoadResult {
	requestId: number;
	targets: NoteLinkTarget[];
}

export interface CanvasLinkTargetRefreshEvent {
	vaultId: string;
}

export class CanvasLinkTargetRequestQueue {
	private queue = new LatestRequestQueue();

	async load(vaultId: string, fetcher: CanvasLinkTargetFetcher): Promise<CanvasLinkTargetLoadResult> {
		const result = await this.queue.load(() => fetcher(vaultId), [] as NoteLinkTarget[]);
		return { requestId: result.requestId, targets: result.value };
	}

	isCurrent(result: CanvasLinkTargetLoadResult): boolean {
		return this.queue.isCurrent(result);
	}
}

export function isCanvasLinkTargetRefreshEvent(
	vaultId: string,
	event: CanvasLinkTargetRefreshEvent
): boolean {
	return event.vaultId === vaultId;
}
