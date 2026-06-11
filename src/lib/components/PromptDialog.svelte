<script lang="ts">
	import { onMount } from 'svelte';
	import { on as onBus } from '$lib/events';

	interface PromptRequest {
		title: string;
		label: string;
		value?: string;
		placeholder?: string;
		confirmLabel?: string;
		resolve: (value: string | null) => void;
	}

	let active = $state<PromptRequest | null>(null);
	let value = $state('');
	let inputEl: HTMLInputElement | null = $state(null);

	const canSubmit = $derived(value.trim().length > 0);

	onMount(() => {
		return onBus('dialog:prompt', (request) => {
			active?.resolve(null);
			active = request;
			value = request.value ?? '';
			setTimeout(() => {
				inputEl?.focus();
				inputEl?.select();
			}, 0);
		});
	});

	function close(result: string | null): void {
		const request = active;
		active = null;
		request?.resolve(result);
	}

	function submit(): void {
		const trimmed = value.trim();
		if (!trimmed) return;
		close(trimmed);
	}
</script>

{#if active}
	<div
		class="backdrop"
		role="dialog"
		aria-modal="true"
		aria-label={active.title}
		tabindex="-1"
		onclick={(e) => { if (e.target === e.currentTarget) close(null); }}
		onkeydown={(e) => {
			if (e.key === 'Escape') close(null);
			if (e.key === 'Enter') submit();
		}}
	>
		<form
			class="modal"
			onsubmit={(e) => {
				e.preventDefault();
				submit();
			}}
		>
			<header>
				<h2>{active.title}</h2>
				<button type="button" class="icon-btn" aria-label="Close" onclick={() => close(null)}>x</button>
			</header>
			<label>
				<span>{active.label}</span>
				<input
					bind:this={inputEl}
					bind:value
					spellcheck="false"
					autocomplete="off"
					placeholder={active.placeholder ?? ''}
				/>
			</label>
			<footer>
				<button type="button" class="ghost" onclick={() => close(null)}>Cancel</button>
				<button type="submit" class="primary" disabled={!canSubmit}>{active.confirmLabel ?? 'Create'}</button>
			</footer>
		</form>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 1100;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 12vh 16px 16px;
		background: rgba(0, 0, 0, 0.44);
		backdrop-filter: blur(3px);
	}
	.modal {
		width: min(420px, 100%);
		border: 1px solid var(--border-strong);
		border-radius: 8px;
		background: var(--bg-elev);
		color: var(--fg);
		box-shadow: 0 18px 48px rgba(0, 0, 0, 0.34);
		overflow: hidden;
	}
	header,
	footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 12px 14px;
	}
	header {
		border-bottom: 1px solid var(--border);
	}
	h2 {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 650;
	}
	label {
		display: grid;
		gap: 7px;
		padding: 14px;
		font-size: 0.82rem;
		color: var(--fg-muted);
	}
	input {
		width: 100%;
		box-sizing: border-box;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		color: var(--fg);
		font: inherit;
		font-size: 0.9rem;
		padding: 8px 10px;
	}
	input:focus {
		outline: 1px solid var(--accent);
		border-color: var(--accent);
	}
	footer {
		justify-content: flex-end;
		border-top: 1px solid var(--border);
	}
	button {
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg-elev);
		color: var(--fg);
		font: inherit;
		font-size: 0.82rem;
		padding: 7px 11px;
		cursor: pointer;
	}
	button:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}
	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.primary {
		border-color: color-mix(in srgb, var(--accent) 70%, var(--border));
		color: var(--accent);
	}
	.ghost {
		color: var(--fg-muted);
	}
	.icon-btn {
		width: 28px;
		height: 28px;
		padding: 0;
		border-radius: 50%;
		font-size: 1.1rem;
		line-height: 1;
	}
</style>
