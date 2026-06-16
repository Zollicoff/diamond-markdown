type CanvasPointerEventName = 'pointermove' | 'pointerup' | 'pointercancel';
type CanvasPointerListener = (event: PointerEvent) => void;

export interface CanvasPointerSessionHandlers {
	move: CanvasPointerListener;
	up: CanvasPointerListener;
	cancel: CanvasPointerListener;
}

export interface CanvasPointerSessionTarget {
	addEventListener(type: CanvasPointerEventName, listener: CanvasPointerListener): void;
	removeEventListener(type: CanvasPointerEventName, listener: CanvasPointerListener): void;
}

export type CanvasPointerSessionCleanup = () => void;

const CANVAS_POINTER_SESSION_EVENTS = [
	['pointermove', 'move'],
	['pointerup', 'up'],
	['pointercancel', 'cancel']
] as const satisfies readonly (readonly [CanvasPointerEventName, keyof CanvasPointerSessionHandlers])[];

export function bindCanvasPointerSession(
	target: CanvasPointerSessionTarget,
	handlers: CanvasPointerSessionHandlers
): CanvasPointerSessionCleanup {
	let active = true;
	for (const [eventName, handlerName] of CANVAS_POINTER_SESSION_EVENTS) {
		target.addEventListener(eventName, handlers[handlerName]);
	}
	return () => {
		if (!active) return;
		active = false;
		for (const [eventName, handlerName] of CANVAS_POINTER_SESSION_EVENTS) {
			target.removeEventListener(eventName, handlers[handlerName]);
		}
	};
}
