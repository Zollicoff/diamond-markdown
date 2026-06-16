<script lang="ts">
	import type { SettingsSectionItem } from '$lib/settings/view';

	interface Props {
		sections: SettingsSectionItem[];
		onJump: (id: string) => void;
	}

	let { sections, onJump }: Props = $props();
</script>

<nav class="settings-nav" aria-label="Settings sections">
	{#each sections as item (item.id)}
		<button class="nav-btn" onclick={() => onJump(item.id)}>{item.label}</button>
	{/each}
</nav>

<style>
	.settings-nav {
		position: sticky;
		top: 22px;
		display: grid;
		gap: 3px;
		padding: 4px 0;
		border-right: 1px solid var(--border);
	}
	.nav-btn {
		width: calc(100% - 12px);
		text-align: left;
		border: 0;
		border-radius: 5px;
		background: transparent;
		color: var(--fg-muted);
		font: inherit;
		font-size: 0.8rem;
		padding: 6px 8px;
		cursor: pointer;
	}
	.nav-btn:hover,
	.nav-btn:focus-visible {
		color: var(--accent);
		background: var(--bg-hover);
		outline: none;
	}

	@media (max-width: 760px) {
		.settings-nav {
			position: sticky;
			top: 0;
			z-index: 2;
			display: flex;
			gap: 4px;
			overflow-x: auto;
			border-right: 0;
			border-bottom: 1px solid var(--border);
			background: var(--bg);
			padding: 0 0 8px;
		}
		.nav-btn {
			width: auto;
			white-space: nowrap;
			flex: none;
		}
	}
</style>
