/**
 * View / layout commands — sidebar collapse, split directions.
 */

import { register, type CommandContext } from '../registry';
import { toggleLeftSidebar, toggleRightSidebar, openTab } from '$lib/workspace/actions';
import { emit } from '$lib/events';

export function registerViewCommands(): void {
	register({
		id: 'view.toggle-left-sidebar',
		title: 'Toggle left sidebar',
		shortcut: '⌘\\',
		category: 'view',
		exec(ctx: CommandContext) { toggleLeftSidebar(ctx.vaultId!); }
	});

	register({
		id: 'view.toggle-right-sidebar',
		title: 'Toggle right sidebar',
		shortcut: '⌘⇧\\',
		category: 'view',
		exec(ctx: CommandContext) { toggleRightSidebar(ctx.vaultId!); }
	});

	register({
		id: 'palette.open',
		title: 'Open command palette',
		shortcut: '⌘P',
		category: 'view',
		exec(ctx: CommandContext) {
			emit('palette:open', { vaultId: ctx.vaultId! });
		}
	});

	register({
		id: 'tags.open',
		title: 'Show tags',
		icon: '#',
		category: 'view',
		exec(ctx: CommandContext) {
			openTab(ctx.vaultId!, { id: 'tags:', kind: 'tags', title: 'Tags' }, 'replace');
		}
	});

	register({
		id: 'graph.open',
		title: 'Show graph',
		icon: '◉',
		category: 'view',
		exec(ctx: CommandContext) {
			openTab(ctx.vaultId!, { id: 'graph', kind: 'graph', title: 'Graph' }, 'replace');
		}
	});

	register({
		id: 'history.open',
		title: 'Show history',
		icon: '⏱',
		category: 'view',
		when: (ctx) => !!ctx.notePath,
		exec(ctx: CommandContext) {
			const notePath = ctx.notePath as string | undefined;
			if (!notePath) return;
			emit('history:open', { vaultId: ctx.vaultId!, path: notePath });
		}
	});
}
