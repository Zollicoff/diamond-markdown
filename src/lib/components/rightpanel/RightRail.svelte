<script lang="ts">
	import CollapseToggle from '$lib/components/CollapseToggle.svelte';

	interface Props {
		collapsed: boolean;
		onToggle: () => void;
	}
	let { collapsed, onToggle }: Props = $props();
</script>

<nav class="rail" aria-label="Right activity bar">
	<div class="rail-top">
		<CollapseToggle side="right" {collapsed} {onToggle} />
	</div>
	<div class="rail-spacer"></div>
</nav>

<style>
	.rail {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 8px 0;
		background: var(--bg);
		border-left: 1px solid var(--border);
		height: 100%;
	}
	.rail-top { padding-bottom: 4px; }
	.rail-spacer { flex: 1; }

	@media (max-width: 640px) {
		.rail { padding: 10px 0; }
	}
</style>
