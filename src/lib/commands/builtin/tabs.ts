/**
 * Tab-and-pane commands. All mutations go through workspace/actions —
 * these commands are just the registry surface for them.
 */

import { register, type CommandContext } from '../registry';
import { openNote, closeTab as closeTabAction, closePane as closePaneAction } from '$lib/workspace/actions';

export function registerTabCommands(): void {
	register({
		id: 'tabs.open',
		title: 'Open',
		icon: '→',
		category: 'tabs',
		exec(ctx: CommandContext) {
			if (!ctx.node || ctx.node.type !== 'file') return;
			openNote(ctx.vaultId!, ctx.node.path, ctx.node.name.replace(/\.md$/, ''), 'replace');
		}
	});

	register({
		id: 'tabs.open-in-new-tab',
		title: 'Open in new tab',
		icon: '⎚',
		shortcut: '⌘click',
		category: 'tabs',
		exec(ctx: CommandContext) {
			if (!ctx.node || ctx.node.type !== 'file') return;
			openNote(ctx.vaultId!, ctx.node.path, ctx.node.name.replace(/\.md$/, ''), 'new-tab');
		}
	});

	register({
		id: 'tabs.open-in-new-pane',
		title: 'Open in new pane',
		icon: '⊞',
		category: 'tabs',
		exec(ctx: CommandContext) {
			if (!ctx.node || ctx.node.type !== 'file') return;
			openNote(ctx.vaultId!, ctx.node.path, ctx.node.name.replace(/\.md$/, ''), 'new-pane');
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
