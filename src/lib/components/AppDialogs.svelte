<script lang="ts">
	import { onMount } from 'svelte';
	import { on as onBus } from '$lib/events';
	import type { VaultEventMap } from '$lib/events';

	type PromptRequest = VaultEventMap['dialog:prompt'];
	type ConfirmRequest = VaultEventMap['dialog:confirm'];
	type AlertRequest = VaultEventMap['dialog:alert'];
	type ToastRequest = VaultEventMap['toast:show'];

	type ModalRequest =
		| ({ kind: 'prompt' } & PromptRequest)
		| ({ kind: 'confirm' } & ConfirmRequest)
		| ({ kind: 'alert' } & AlertRequest);

	interface ToastItem extends ToastRequest {
		id: number;
	}

	let active = $state<ModalRequest | null>(null);
	let value = $state('');
	let inputEl: HTMLInputElement | null = $state(null);
	let toasts = $state<ToastItem[]>([]);
	let nextToastId = 1;

	const canSubmit = $derived(active?.kind !== 'prompt' || value.trim().length > 0);
	const activeTone = $derived(active && 'tone' in active ? active.tone : 'default');

	onMount(() => {
		const offs = [
			onBus('dialog:prompt', (request) => {
				cancelActive();
				active = { kind: 'prompt', ...request };
				value = request.value ?? '';
				setTimeout(() => {
					inputEl?.focus();
					inputEl?.select();
				}, 0);
			}),
			onBus('dialog:confirm', (request) => {
				cancelActive();
				active = { kind: 'confirm', ...request };
			}),
			onBus('dialog:alert', (request) => {
				cancelActive();
				active = { kind: 'alert', ...request };
			}),
			onBus('toast:show', (request) => {
				const id = nextToastId++;
				toasts = [...toasts, { id, ...request }];
				if (request.timeoutMs !== 0) {
					setTimeout(() => dismissToast(id), request.timeoutMs ?? 4200);
				}
			})
		];
		return () => offs.forEach((off) => off());
	});

	function dismissToast(id: number): void {
		toasts = toasts.filter((toast) => toast.id !== id);
	}

	function cancelActive(): void {
		if (!active) return;
		const request = active;
		active = null;
		if (request.kind === 'prompt') request.resolve(null);
		if (request.kind === 'confirm') request.resolve(false);
		if (request.kind === 'alert') request.resolve();
	}

	function closePrompt(result: string | null): void {
		if (!active || active.kind !== 'prompt') return;
		const request = active;
		active = null;
		request.resolve(result);
	}

	function closeConfirm(result: boolean): void {
		if (!active || active.kind !== 'confirm') return;
		const request = active;
		active = null;
		request.resolve(result);
	}

	function closeAlert(): void {
		if (!active || active.kind !== 'alert') return;
		const request = active;
		active = null;
		request.resolve();
	}

	function submit(): void {
		if (!active) return;
		if (active.kind === 'prompt') {
			const trimmed = value.trim();
			if (!trimmed) return;
			closePrompt(trimmed);
			return;
		}
		if (active.kind === 'confirm') closeConfirm(true);
		else closeAlert();
	}
</script>

{#if active}
	<div
		class="backdrop"
		role={active.kind === 'confirm' ? 'alertdialog' : 'dialog'}
		aria-modal="true"
		aria-label={active.title}
		tabindex="-1"
		onclick={(e) => { if (e.target === e.currentTarget) cancelActive(); }}
		onkeydown={(e) => {
			if (e.key === 'Escape') cancelActive();
			if (e.key === 'Enter') submit();
		}}
	>
		<form
			class="modal"
			class:danger={activeTone === 'danger'}
			class:success={activeTone === 'success'}
			onsubmit={(e) => {
				e.preventDefault();
				submit();
			}}
		>
			<header>
				<h2>{active.title}</h2>
				<button type="button" class="icon-btn" aria-label="Close" onclick={cancelActive}>x</button>
			</header>
			{#if active.kind === 'prompt'}
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
						onclick={() => active?.kind === 'prompt' ? closePrompt(null) : closeConfirm(false)}
					>{active.kind === 'confirm' ? (active.cancelLabel ?? 'Cancel') : 'Cancel'}</button>
					<button type="submit" class="primary" class:danger-action={activeTone === 'danger'} disabled={!canSubmit}>
						{active.confirmLabel ?? (active.kind === 'confirm' ? 'Continue' : 'Create')}
					</button>
				{/if}
			</footer>
		</form>
	</div>
{/if}

{#if toasts.length > 0}
	<div class="toast-stack" aria-live="polite" aria-label="Notifications">
		{#each toasts as toast (toast.id)}
			<section class="toast" class:danger={toast.tone === 'danger'} class:success={toast.tone === 'success'}>
				<div>
					<strong>{toast.title}</strong>
					{#if toast.message}<p>{toast.message}</p>{/if}
				</div>
				<button type="button" aria-label="Dismiss notification" onclick={() => dismissToast(toast.id)}>x</button>
			</section>
		{/each}
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
	.toast-stack {
		position: fixed;
		right: 14px;
		bottom: 14px;
		z-index: 1200;
		display: grid;
		gap: 8px;
		width: min(360px, calc(100vw - 28px));
	}
	.toast {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 10px;
		border: 1px solid var(--border);
		border-left: 3px solid var(--accent);
		border-radius: 8px;
		background: var(--bg-elev);
		color: var(--fg);
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
		padding: 10px 10px 10px 12px;
	}
	.toast.danger { border-left-color: var(--danger); }
	.toast.success { border-left-color: var(--success); }
	.toast strong {
		display: block;
		font-size: 0.84rem;
		font-weight: 650;
	}
	.toast p {
		margin: 3px 0 0;
		color: var(--fg-muted);
		font-size: 0.78rem;
		line-height: 1.35;
	}
	.toast button {
		width: 24px;
		height: 24px;
		padding: 0;
		border-radius: 50%;
		color: var(--fg-muted);
	}
</style>
