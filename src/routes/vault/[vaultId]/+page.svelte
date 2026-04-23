<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<div class="empty">
	<div class="center">
		<h1>{data.vault.name}</h1>
		<p class="muted">Pick a note from the sidebar, press <kbd>⌘K</kbd> to jump by title, or <kbd>⌘⇧F</kbd> to search.</p>
	</div>
</div>

<style>
	.empty {
		height: 100%;
		display: grid;
		place-items: center;
		padding: 3rem;
		text-align: center;
	}
	h1 {
		font-size: 2.5rem;
		font-weight: 800;
		margin: 0 0 0.5rem;
		letter-spacing: -0.02em;
	}
	.muted { color: var(--fg-muted); font-size: 1rem; }
	kbd {
		font-family: var(--mono);
		background: var(--bg-elev);
		border: 1px solid var(--border);
		border-radius: 5px;
		padding: 2px 8px;
		margin: 0 2px;
		font-size: 0.88em;
	}
</style>
