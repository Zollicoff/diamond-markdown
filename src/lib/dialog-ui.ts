import type { VaultEventMap } from './events';

export type PromptRequest = VaultEventMap['dialog:prompt'];
export type ConfirmRequest = VaultEventMap['dialog:confirm'];
export type AlertRequest = VaultEventMap['dialog:alert'];
export type ToastRequest = VaultEventMap['toast:show'];

export type ModalRequest =
	| ({ kind: 'prompt' } & PromptRequest)
	| ({ kind: 'confirm' } & ConfirmRequest)
	| ({ kind: 'alert' } & AlertRequest);

export interface ToastItem extends ToastRequest {
	id: number;
}

export type DialogTone = 'default' | 'danger' | 'success';

export function modalCanSubmit(active: ModalRequest | null, value: string): boolean {
	return active?.kind !== 'prompt' || value.trim().length > 0;
}

export function modalTone(active: ModalRequest | null): DialogTone {
	return active && 'tone' in active ? active.tone ?? 'default' : 'default';
}
