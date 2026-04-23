/**
 * Global keymap → command id. Invoked once at shell mount; unbinds on
 * destroy. Keeps its own internal table so commands don't have to each
 * install their own global listeners.
 *
 * Keys are specified in Obsidian-ish shorthand: mod means Cmd on mac,
 * Ctrl elsewhere. `shift`, `alt`, `+`, literal key names.
 */

import { exec, type CommandContext } from './registry';

interface KeyBinding {
	combo: string; // e.g. "mod+\\"
	commandId: string;
	when?: (ctx: CommandContext) => boolean;
}

const bindings: KeyBinding[] = [
	{ combo: 'mod+\\', commandId: 'view.toggle-left-sidebar' },
	{ combo: 'mod+shift+\\', commandId: 'view.toggle-right-sidebar' },
	{ combo: 'mod+w', commandId: 'tabs.close' },
	{ combo: 'mod+p', commandId: 'palette.open' }
];

export function installGlobalKeymap(getCtx: () => CommandContext): () => void {
	const handler = (e: KeyboardEvent): void => {
		const target = e.target as HTMLElement | null;
		// Don't hijack typing inside form fields or the editor itself.
		if (target && isTextInput(target)) return;
		const combo = comboFrom(e);
		for (const b of bindings) {
			if (b.combo === combo) {
				e.preventDefault();
				void exec(b.commandId, getCtx());
				return;
			}
		}
	};
	window.addEventListener('keydown', handler);
	return () => window.removeEventListener('keydown', handler);
}

function isTextInput(el: HTMLElement): boolean {
	if (el.isContentEditable) return true;
	const t = el.tagName;
	if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return true;
	return false;
}

function comboFrom(e: KeyboardEvent): string {
	const parts: string[] = [];
	if (e.metaKey || e.ctrlKey) parts.push('mod');
	if (e.shiftKey) parts.push('shift');
	if (e.altKey) parts.push('alt');
	parts.push(e.key.toLowerCase());
	return parts.join('+');
}
