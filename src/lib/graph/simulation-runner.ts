import { simulateStep, type GEdge, type GNode, type SimParams } from './sim';

export type GraphSimulationParamsSource = SimParams | (() => SimParams);

export interface GraphFrameApi {
	requestFrame: (callback: FrameRequestCallback) => number;
	cancelFrame: (id: number) => void;
	now: () => number;
}

export interface GraphSimulationRunner {
	start: (
		nodes: GNode[],
		edges: GEdge[],
		params: GraphSimulationParamsSource,
		onTick: () => void
	) => void;
	stop: () => void;
	isRunning: () => boolean;
}

function fallbackRequestFrame(callback: FrameRequestCallback): number {
	return globalThis.setTimeout(() => callback(Date.now()), 16) as unknown as number;
}

function fallbackCancelFrame(id: number): void {
	globalThis.clearTimeout(id as unknown as ReturnType<typeof globalThis.setTimeout>);
}

function defaultFrameApi(): GraphFrameApi {
	return {
		requestFrame: globalThis.requestAnimationFrame?.bind(globalThis) ?? fallbackRequestFrame,
		cancelFrame: globalThis.cancelAnimationFrame?.bind(globalThis) ?? fallbackCancelFrame,
		now: () => globalThis.performance?.now() ?? Date.now()
	};
}

function resolveParams(params: GraphSimulationParamsSource): SimParams {
	return typeof params === 'function' ? params() : params;
}

export function createGraphSimulationRunner(frameApi: GraphFrameApi = defaultFrameApi()): GraphSimulationRunner {
	let frameId: number | null = null;
	let lastTick = 0;

	function stop(): void {
		if (frameId === null) return;
		frameApi.cancelFrame(frameId);
		frameId = null;
	}

	function start(
		nodes: GNode[],
		edges: GEdge[],
		params: GraphSimulationParamsSource,
		onTick: () => void
	): void {
		stop();
		lastTick = frameApi.now();
		const step = (now: number): void => {
			const dt = Math.min(32, now - lastTick) / 16;
			lastTick = now;
			simulateStep(nodes, edges, dt, resolveParams(params));
			onTick();
			frameId = frameApi.requestFrame(step);
		};
		frameId = frameApi.requestFrame(step);
	}

	return {
		start,
		stop,
		isRunning: () => frameId !== null
	};
}
