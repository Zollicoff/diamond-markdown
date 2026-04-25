/**
 * Theme store. Persists `auto | light | dark` to localStorage and reflects
 * the active resolved theme onto <html data-theme="...">. Listens for OS
 * `prefers-color-scheme` changes when in auto mode.
 */

import { browser } from '$app/environment';

export type ThemeMode = 'auto' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const KEY = 'diamond.theme';

const state = $state<{ mode: ThemeMode; resolved: ResolvedTheme }>({
	mode: 'dark',
	resolved: 'dark'
});

function readSystem(): ResolvedTheme {
	if (!browser) return 'dark';
	return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function apply(): void {
	if (!browser) return;
	const root = document.documentElement;
	root.setAttribute('data-theme', state.resolved);
}

function compute(): void {
	state.resolved = state.mode === 'auto' ? readSystem() : state.mode;
	apply();
}

export function hydrate(): void {
	if (!browser) return;
	try {
		const raw = localStorage.getItem(KEY);
		if (raw === 'auto' || raw === 'light' || raw === 'dark') state.mode = raw;
		else state.mode = 'dark'; // default
	} catch {
		state.mode = 'dark';
	}
	compute();
	const mq = window.matchMedia('(prefers-color-scheme: light)');
	mq.addEventListener('change', () => { if (state.mode === 'auto') compute(); });
}

export function setMode(m: ThemeMode): void {
	state.mode = m;
	try { localStorage.setItem(KEY, m); } catch { /* ignore */ }
	compute();
}

/** Cycle: dark → light → auto → dark. */
export function cycle(): void {
	const next: ThemeMode = state.mode === 'dark' ? 'light' : state.mode === 'light' ? 'auto' : 'dark';
	setMode(next);
}

export const theme = state;
