<script lang="ts">
	import {
		CANVAS_COLOR_OPTIONS,
		canvasPaletteColorValue
	} from '$lib/canvas/view';

	interface Props {
		kind: 'node' | 'edge';
		label: string;
		color?: string;
		saving?: boolean;
		disabled?: boolean;
		onColorChange: (color: string) => void | Promise<void>;
	}

	let {
		kind,
		label,
		color,
		saving = false,
		disabled = false,
		onColorChange
	}: Props = $props();

	const currentValue = $derived(canvasPaletteColorValue(color));

	function chooseColor(value: string): void {
		if (disabled || saving || value === currentValue) return;
		void onColorChange(value);
	}
</script>

<div class="color-palette" aria-label={`Canvas ${kind} color for ${label}`}>
	{#each CANVAS_COLOR_OPTIONS as option}
		<button
			type="button"
			class={`swatch-button${currentValue === option.value ? ' active' : ''}${option.value === '' ? ' default-swatch' : ''}`}
			aria-label={`Set canvas ${kind} ${label} color ${option.label}`}
			aria-pressed={currentValue === option.value}
			title={saving ? 'Saving color' : option.label}
			disabled={disabled || saving}
			onclick={() => chooseColor(option.value)}
		>
			<span style={`background: ${option.swatch};`}></span>
		</button>
	{/each}
</div>

<style>
	.color-palette {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		min-width: 0;
		flex-wrap: wrap;
	}
	button {
		display: inline-grid;
		place-items: center;
		width: 17px;
		height: 17px;
		flex: 0 0 17px;
		border: 1px solid color-mix(in srgb, var(--border), transparent 12%);
		border-radius: 999px;
		background: color-mix(in srgb, var(--bg), transparent 10%);
		padding: 2px;
		cursor: pointer;
	}
	button:hover:not(:disabled),
	button:focus-visible {
		border-color: var(--accent);
		outline: none;
	}
	button.active {
		border-color: var(--accent);
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent), transparent 30%);
	}
	button:disabled {
		cursor: default;
		opacity: 0.55;
	}
	span {
		width: 100%;
		height: 100%;
		border-radius: inherit;
	}
	.default-swatch span {
		background:
			linear-gradient(135deg, transparent 44%, var(--fg-dim) 45%, var(--fg-dim) 55%, transparent 56%),
			color-mix(in srgb, var(--bg-elev), var(--bg) 30%) !important;
	}
</style>
