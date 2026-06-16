<script lang="ts">
	import { theme, setMode } from '$lib/theme.svelte';
	import { themeModeOptions } from '$lib/settings/view';
</script>

<section class="group" id="appearance">
	<h2>Appearance</h2>
	<div class="row">
		<div class="row-label">
			<div class="row-title">Theme</div>
			<div class="row-hint">Choose the editor's color scheme. Auto follows your system.</div>
		</div>
		<div class="seg" role="radiogroup" aria-label="Theme">
			{#each themeModeOptions as m (m.id)}
				<button
					class="seg-btn"
					class:active={theme.mode === m.id}
					role="radio"
					aria-checked={theme.mode === m.id}
					onclick={() => setMode(m.id)}
				>
					<span class="seg-icon">{m.icon}</span>{m.label}
				</button>
			{/each}
		</div>
	</div>
</section>

<style>
	.group {
		scroll-margin-top: 20px;
		margin-bottom: 28px;
		padding-bottom: 20px;
		border-bottom: 1px solid var(--border);
	}
	.group h2 {
		font-family: 'Bricolage Grotesque', var(--sans);
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--fg-muted);
		margin: 0 0 14px;
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
		padding: 10px 0;
	}
	.row-label { min-width: 0; flex: 1; }
	.row-title { font-size: 0.92rem; color: var(--fg); }
	.row-hint { font-size: 0.78rem; color: var(--fg-dim); margin-top: 2px; }
	.seg {
		display: flex;
		gap: 2px;
		background: var(--bg);
		border: 1px solid var(--border);
		padding: 2px;
		border-radius: 7px;
	}
	.seg-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: transparent;
		border: 0;
		color: var(--fg-muted);
		padding: 5px 12px;
		border-radius: 5px;
		font: inherit;
		font-size: 0.82rem;
		cursor: pointer;
	}
	.seg-btn:hover { color: var(--fg); }
	.seg-btn.active {
		background: var(--bg-elev);
		color: var(--accent);
	}
	.seg-icon { font-size: 0.92rem; }

	@media (max-width: 760px) {
		.row {
			align-items: flex-start;
			flex-direction: column;
			gap: 10px;
		}
	}
</style>
