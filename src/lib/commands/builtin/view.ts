/**
 * View / layout commands — sidebar collapse, split directions.
 */

import { register, type CommandContext } from '../registry';
import { toggleLeftSidebar, toggleRightSidebar } from '$lib/workspace/actions';

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
}
