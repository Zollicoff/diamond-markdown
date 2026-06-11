<script lang="ts">
	import type { Pane, Tab } from '$lib/workspace/types';
	import type { NoteDoc } from '$lib/types';
	import TabBar from './TabBar.svelte';
	import TabContent from './TabContent.svelte';
	import EmptyPane from './EmptyPane.svelte';
	import { activateAdjacentTabOrPane, setActivePane } from '$lib/workspace/actions';

	interface Props {
		vaultId: string;
		pane: Pane;
		isActivePane: boolean;
		canClose: boolean;
		onDocLoaded?: (doc: NoteDoc) => void;
		/** Suppress the per-pane TabBar — used when a parent (e.g. TopBar)
		 *  is rendering this pane's tabs instead. */
		hideTabBar?: boolean;
	}

	let { vaultId, pane, isActivePane, canClose, onDocLoaded, hideTabBar }: Props = $props();

	type Mode = 'live' | 'source' | 'read';
	let mode = $state<Mode>('live');

	let activeTab = $derived<Tab | null>(
		pane.tabs.find((t) => t.id === pane.activeTabId) ?? null
	);

	type SwipeStart = {
		pointerId: number;
		x: number;
		y: number;
		t: number;
	};

	const SWIPE_MIN_PX = 72;
	const SWIPE_MAX_OFF_AXIS_PX = 80;
	const SWIPE_MAX_MS = 900;

	let swipeStart = $state<SwipeStart | null>(null);

	function focus(): void {
		if (!isActivePane) setActivePane(vaultId, pane.id);
	}

	function shouldIgnoreSwipeTarget(target: EventTarget | null): boolean {
		if (!(target instanceof Element)) return false;
		return Boolean(target.closest('button, a, input, textarea, select, [role="button"], .tabs, .cm-tooltip, .cm-panel'));
	}

	function capturePointer(el: Element, pointerId: number): void {
		try { el.setPointerCapture?.(pointerId); } catch { /* synthetic or already-captured pointer */ }
	}

	function releasePointer(el: Element, pointerId: number): void {
		try { el.releasePointerCapture?.(pointerId); } catch { /* synthetic or already-released pointer */ }
	}

	function onPointerDown(e: PointerEvent): void {
		if (e.pointerType !== 'touch' || shouldIgnoreSwipeTarget(e.target)) return;
		focus();
		swipeStart = {
			pointerId: e.pointerId,
			x: e.clientX,
			y: e.clientY,
			t: Date.now()
		};
		capturePointer(e.currentTarget as Element, e.pointerId);
	}

	function onPointerMove(e: PointerEvent): void {
		if (!swipeStart || e.pointerId !== swipeStart.pointerId) return;
		const dx = e.clientX - swipeStart.x;
		const dy = e.clientY - swipeStart.y;
		if (Math.abs(dy) > SWIPE_MAX_OFF_AXIS_PX && Math.abs(dy) > Math.abs(dx)) {
			swipeStart = null;
			releasePointer(e.currentTarget as Element, e.pointerId);
		}
	}

	function onPointerUp(e: PointerEvent): void {
		if (!swipeStart || e.pointerId !== swipeStart.pointerId) return;
		const start = swipeStart;
		swipeStart = null;
		releasePointer(e.currentTarget as Element, e.pointerId);

		const dx = e.clientX - start.x;
		const dy = e.clientY - start.y;
		const elapsed = Date.now() - start.t;
		const horizontal = Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.35;
		if (!horizontal || Math.abs(dy) > SWIPE_MAX_OFF_AXIS_PX || elapsed > SWIPE_MAX_MS) return;

		const result = activateAdjacentTabOrPane(vaultId, pane.id, dx < 0 ? 'next' : 'previous');
		if (result !== 'none') e.preventDefault();
	}

	function onPointerCancel(e: PointerEvent): void {
		if (swipeStart?.pointerId === e.pointerId) {
			swipeStart = null;
			releasePointer(e.currentTarget as Element, e.pointerId);
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions - pane focus follows pointer/focus events across nested editor controls. -->
<section
	class="pane"
	class:active={isActivePane}
	onmousedown={focus}
	onfocusin={focus}
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerCancel}
	role="group"
	tabindex="-1"
	aria-label="Editor pane"
>
	{#if !hideTabBar}
		<TabBar {vaultId} {pane} {isActivePane} {canClose} />
	{/if}

	<div class="pane-body">
		{#if activeTab}
			<TabContent
				{vaultId}
				paneId={pane.id}
				tab={activeTab}
				{mode}
				isFocused={isActivePane}
				onModeChange={(m) => (mode = m)}
				{onDocLoaded}
			/>
		{:else}
			<EmptyPane />
		{/if}
	</div>
</section>

<style>
	.pane {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		background: var(--bg);
		border-right: 1px solid var(--border);
	}
	.pane:last-child { border-right: 0; }
	.pane-body {
		flex: 1;
		min-height: 0;
		overflow: hidden;
		touch-action: pan-y;
	}
</style>
