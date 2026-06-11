import { emit } from '$lib/events';

export type DialogTone = 'default' | 'danger' | 'success';

export function promptText(options: {
	title: string;
	label: string;
	value?: string;
	placeholder?: string;
	confirmLabel?: string;
}): Promise<string | null> {
	if (typeof window === 'undefined') return Promise.resolve(null);
	return new Promise((resolve) => emit('dialog:prompt', { ...options, resolve }));
}

export function confirmDialog(options: {
	title: string;
	message: string;
	confirmLabel?: string;
	cancelLabel?: string;
	tone?: Extract<DialogTone, 'default' | 'danger'>;
}): Promise<boolean> {
	if (typeof window === 'undefined') return Promise.resolve(false);
	return new Promise((resolve) => emit('dialog:confirm', { ...options, resolve }));
}

export function alertDialog(options: {
	title: string;
	message: string;
	confirmLabel?: string;
	tone?: DialogTone;
}): Promise<void> {
	if (typeof window === 'undefined') return Promise.resolve();
	return new Promise((resolve) => emit('dialog:alert', { ...options, resolve }));
}

export function notify(options: {
	title: string;
	message?: string;
	tone?: DialogTone;
	timeoutMs?: number;
}): void {
	if (typeof window === 'undefined') return;
	emit('toast:show', options);
}
