<script lang="ts">
	interface Props {
		side: 'left' | 'right';
		collapsed: boolean;
		onToggle: () => void;
		title?: string;
	}
	let { side, collapsed, onToggle, title }: Props = $props();
</script>

<button
	class="chev"
	class:right={side === 'right'}
	class:collapsed
	onclick={onToggle}
	title={title ?? `Toggle ${side} sidebar`}
	aria-label={title ?? `Toggle ${side} sidebar`}
>
	{#if side === 'left'}
		{collapsed ? '›' : '‹'}
	{:else}
		{collapsed ? '‹' : '›'}
	{/if}
</button>

<style>
	.chev {
		background: transparent;
		border: 0;
		padding: 4px 6px;
		color: var(--fg-dim);
		cursor: pointer;
		font-family: var(--mono);
		font-size: 0.9rem;
		line-height: 1;
		border-radius: 4px;
	}
	.chev:hover { color: var(--accent); background: var(--bg-hover); }
</style>
