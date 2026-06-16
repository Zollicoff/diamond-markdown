/**
 * Tab-and-pane commands. All mutations go through workspace/actions —
 * these commands are just the registry surface for them.
 */

import { register, type CommandContext } from '../registry';
import { openCanvas, openNote, closeTab as closeTabAction, closePane as closePaneAction } from '$lib/workspace/actions';

function titleFor(path: string): string {
	return path.split('/').pop()!.replace(/\.(md|markdown|canvas)$/i, '');
}

function openFile(ctx: CommandContext, mode: 'replace' | 'new-tab' | 'new-pane'): void {
	if (!ctx.node || ctx.node.type !== 'file') return;
	const title = titleFor(ctx.node.path);
	if (ctx.node.fileKind === 'canvas') openCanvas(ctx.vaultId!, ctx.node.path, title, mode);
	else openNote(ctx.vaultId!, ctx.node.path, title, mode);
}

export function registerTabCommands(): void {
	register({
		id: 'tabs.open',
		title: 'Open',
		icon: '→',
		category: 'tabs',
		exec(ctx: CommandContext) {
			openFile(ctx, 'replace');
		}
	});

	register({
		id: 'tabs.open-in-new-tab',
		title: 'Open in new tab',
		icon: '⎚',
		shortcut: '⌘click',
		category: 'tabs',
		exec(ctx: CommandContext) {
			openFile(ctx, 'new-tab');
		}
	});

	register({
		id: 'tabs.open-in-new-pane',
		title: 'Open in new pane',
		icon: '⊞',
		category: 'tabs',
		exec(ctx: CommandContext) {
			openFile(ctx, 'new-pane');
		}
	});

	register({
		id: 'tabs.close',
		title: 'Close tab',
		shortcut: '⌘W',
		category: 'tabs',
		exec(ctx: CommandContext) {
			if (!ctx.paneId || !ctx.tabId) return;
			closeTabAction(ctx.vaultId!, ctx.paneId, ctx.tabId);
		}
	});

	register({
		id: 'pane.close',
		title: 'Close pane',
		category: 'tabs',
		exec(ctx: CommandContext) {
			if (!ctx.paneId) return;
			closePaneAction(ctx.vaultId!, ctx.paneId);
		}
	});
}
