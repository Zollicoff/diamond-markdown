<script lang="ts">
	import type { DialogTone, ModalRequest } from '$lib/dialog-ui';

	interface Props {
		active: ModalRequest;
		value: string;
		canSubmit: boolean;
		activeTone: DialogTone;
		onValueChange: (value: string) => void;
		onCancel: () => void;
		onSubmit: () => void;
		onClosePrompt: (result: string | null) => void;
		onCloseConfirm: (result: boolean) => void;
	}

	let {
		active,
		value,
		canSubmit,
		activeTone,
		onValueChange,
		onCancel,
		onSubmit,
		onClosePrompt,
		onCloseConfirm
	}: Props = $props();

	let inputEl: HTMLInputElement | null = $state(null);

	$effect(() => {
		if (active.kind !== 'prompt') return;
		requestAnimationFrame(() => {
			inputEl?.focus();
			inputEl?.select();
		});
	});
</script>

<div
	class="backdrop"
	role={active.kind === 'confirm' ? 'alertdialog' : 'dialog'}
	aria-modal="true"
	aria-label={active.title}
	tabindex="-1"
	onclick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
	onkeydown={(e) => {
		if (e.key === 'Escape') onCancel();
		if (e.key === 'Enter') onSubmit();
	}}
>
	<form
		class="modal"
		class:danger={activeTone === 'danger'}
		class:success={activeTone === 'success'}
		onsubmit={(e) => {
			e.preventDefault();
			onSubmit();
		}}
	>
		<header>
			<h2>{active.title}</h2>
			<button type="button" class="icon-btn" aria-label="Close" onclick={onCancel}>x</button>
		</header>
		{#if active.kind === 'prompt'}
			<label>
				<span>{active.label}</span>
				<input
					bind:this={inputEl}
					value={value}
					spellcheck="false"
					autocomplete="off"
					placeholder={active.placeholder ?? ''}
					oninput={(e) => onValueChange((e.currentTarget as HTMLInputElement).value)}
				/>
			</label>
		{:else}
			<div class="message">{active.message}</div>
		{/if}
		<footer>
			{#if active.kind === 'alert'}
				<button type="submit" class="primary">{active.confirmLabel ?? 'OK'}</button>
			{:else}
				<button
					type="button"
					class="ghost"
					onclick={() => active.kind === 'prompt' ? onClosePrompt(null) : onCloseConfirm(false)}
				>{active.kind === 'confirm' ? (active.cancelLabel ?? 'Cancel') : 'Cancel'}</button>
				<button type="submit" class="primary" class:danger-action={activeTone === 'danger'} disabled={!canSubmit}>
					{active.confirmLabel ?? (active.kind === 'confirm' ? 'Continue' : 'Create')}
				</button>
			{/if}
		</footer>
	</form>
</div>

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
		width: min(440px, 100%);
		border: 1px solid var(--border-strong);
		border-radius: 8px;
		background: var(--bg-elev);
		color: var(--fg);
		box-shadow: 0 18px 48px rgba(0, 0, 0, 0.34);
		overflow: hidden;
	}
	.modal.danger { border-color: color-mix(in srgb, var(--danger), var(--border-strong) 45%); }
	.modal.success { border-color: color-mix(in srgb, var(--success), var(--border-strong) 45%); }
	header,
	footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 12px 14px;
	}
	header { border-bottom: 1px solid var(--border); }
	h2 {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 650;
	}
	label,
	.message {
		display: grid;
		gap: 7px;
		padding: 14px;
		font-size: 0.82rem;
		color: var(--fg-muted);
	}
	.message {
		line-height: 1.45;
		white-space: pre-wrap;
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
	.danger-action {
		border-color: color-mix(in srgb, var(--danger) 70%, var(--border));
		color: var(--danger);
	}
	.ghost { color: var(--fg-muted); }
	.icon-btn {
		width: 28px;
		height: 28px;
		padding: 0;
		border-radius: 50%;
		font-size: 1.1rem;
		line-height: 1;
	}
</style>
