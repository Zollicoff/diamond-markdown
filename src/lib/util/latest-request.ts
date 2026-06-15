export interface LatestRequestResult<T> {
	requestId: number;
	value: T;
}

export interface LatestRequestIdentity {
	requestId: number;
}

/**
 * Tracks "latest request wins" async flows without tying callers to a UI
 * framework. Failed loaders return the supplied fallback so view orchestration
 * can stay simple and stale results can still be ignored deterministically.
 */
export class LatestRequestQueue {
	private requestId = 0;

	async load<T>(loader: () => Promise<T>, fallback: T): Promise<LatestRequestResult<T>> {
		const requestId = ++this.requestId;
		try {
			return { requestId, value: await loader() };
		} catch {
			return { requestId, value: fallback };
		}
	}

	isCurrent(result: LatestRequestIdentity): boolean {
		return result.requestId === this.requestId;
	}
}
