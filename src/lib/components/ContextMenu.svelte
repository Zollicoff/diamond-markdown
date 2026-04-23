<script lang="ts" module>
	export interface MenuItem {
		label: string;
		icon?: string;
		shortcut?: string;
		action?: () => void;
		separator?: boolean;
		danger?: boolean;
		disabled?: boolean;
	}

	export interface Position { x: number; y: number; }
</script>

<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		items: MenuItem[];
		pos: Position;
		onClose: () => void;
	}

	let { items, pos, onClose }: Props = $props();

	let menuEl: HTMLDivElement | null = $state(null);
	let placed = $state<{ left: number; top: number }>({ left: pos.x, top: pos.y });

	onMount(() => {
		// Clamp to viewport after mount so we know the rendered size.
		requestAnimationFrame(() => {
			if (!menuEl) return;
			const rect = menuEl.getBoundingClientRect();
			let left = pos.x;
			let top = pos.y;
			if (left + rect.width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - rect.width - 8);
			if (top + rect.height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - rect.height - 8);
			placed = { left, top };
		});

		const onDoc = (e: MouseEvent) => {
			if (!menuEl) return;
			if (menuEl.contains(e.target as Node)) return;
			onClose();
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') { e.preventDefault(); onClose(); }
		};
		document.addEventListener('mousedown', onDoc);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onDoc);
			document.removeEventListener('keydown', onKey);
		};
	});

	function pick(item: MenuItem): void {
		if (item.disabled || item.separator) return;
		onClose();
		setTimeout(() => item.action?.(), 0);
	}
</script>

<div
	bind:this={menuEl}
	class="menu"
	role="menu"
	style="left: {placed.left}px; top: {placed.top}px"
>
	{#each items as item}
		{#if item.separator}
			<hr class="sep" />
		{:else}
			<button
				class="item"
				class:danger={item.danger}
				class:disabled={item.disabled}
				onclick={() => pick(item)}
				role="menuitem"
				disabled={item.disabled}
			>
				<span class="icon">{item.icon ?? ''}</span>
				<span class="label">{item.label}</span>
				{#if item.shortcut}
					<span class="shortcut">{item.shortcut}</span>
				{/if}
			</button>
		{/if}
	{/each}
</div>

<style>
	.menu {
		position: fixed;
		min-width: 180px;
		background: var(--bg-elev);
		border: 1px solid var(--border-strong);
		border-radius: 8px;
		box-shadow: 0 12px 36px rgba(0, 0, 0, 0.35);
		padding: 4px;
		z-index: 2000;
		font-size: 0.88rem;
		color: var(--fg);
	}
	.item {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 6px 10px;
		background: transparent;
		border: 0;
		border-radius: 4px;
		color: inherit;
		cursor: pointer;
		font: inherit;
		text-align: left;
	}
	.item:hover:not(.disabled) { background: var(--bg-hover); }
	.item.danger { color: var(--danger); }
	.item.disabled { opacity: 0.4; cursor: default; }
	.icon { width: 18px; display: inline-flex; justify-content: center; }
	.label { flex: 1; }
	.shortcut { color: var(--fg-dim); font-family: var(--mono); font-size: 0.78rem; }
	.sep { border: 0; border-top: 1px solid var(--border); margin: 4px 2px; }
</style>
