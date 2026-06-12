<script lang="ts">
	import { onMount } from 'svelte';
	import AppDialogModal from './AppDialogModal.svelte';
	import ToastStack from './ToastStack.svelte';
	import { modalCanSubmit, modalTone } from '$lib/dialog-ui';
	import type { ModalRequest, ToastItem } from '$lib/dialog-ui';
	import { on as onBus } from '$lib/events';

	let active = $state<ModalRequest | null>(null);
	let value = $state('');
	let toasts = $state<ToastItem[]>([]);
	let nextToastId = 1;

	const canSubmit = $derived(modalCanSubmit(active, value));
	const activeTone = $derived(modalTone(active));

	onMount(() => {
		const offs = [
			onBus('dialog:prompt', (request) => {
				cancelActive();
				active = { kind: 'prompt', ...request };
				value = request.value ?? '';
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
	<AppDialogModal
		{active}
		{value}
		{canSubmit}
		{activeTone}
		onValueChange={(next) => (value = next)}
		onCancel={cancelActive}
		onSubmit={submit}
		onClosePrompt={closePrompt}
		onCloseConfirm={closeConfirm}
	/>
{/if}

<ToastStack {toasts} onDismiss={dismissToast} />
