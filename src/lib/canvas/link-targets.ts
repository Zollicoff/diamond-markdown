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

export type CanvasLinkTargetApplier = (targets: NoteLinkTarget[]) => void;
export type CanvasLinkTargetLoader = () => void | Promise<void>;

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

export async function refreshCanvasLinkTargets(
	queue: CanvasLinkTargetRequestQueue,
	vaultId: string,
	fetcher: CanvasLinkTargetFetcher,
	applyTargets: CanvasLinkTargetApplier
): Promise<CanvasLinkTargetLoadResult> {
	const result = await queue.load(vaultId, fetcher);
	if (queue.isCurrent(result)) applyTargets(result.targets);
	return result;
}

export function isCanvasLinkTargetRefreshEvent(
	vaultId: string,
	event: CanvasLinkTargetRefreshEvent
): boolean {
	return event.vaultId === vaultId;
}

export function refreshCanvasLinkTargetsForVaultEvent(
	vaultId: string,
	event: CanvasLinkTargetRefreshEvent,
	loadTargets: CanvasLinkTargetLoader
): boolean {
	if (!isCanvasLinkTargetRefreshEvent(vaultId, event)) return false;
	void loadTargets();
	return true;
}
