/**
 * View / layout commands — sidebar collapse, split directions.
 */

import { register, type CommandContext } from '../registry';
import { toggleLeftSidebar, toggleRightSidebar, openTab, openNote } from '$lib/workspace/actions';
import { emit } from '$lib/events';
import { api } from '$lib/vault-api';

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
		id: 'daily.open',
		title: "Open today's daily note",
		icon: '📅',
		shortcut: '⌘⇧D',
		category: 'file',
		async exec(ctx: CommandContext) {
			try {
				const res = await api.openToday(ctx.vaultId!);
				const title = res.path.split('/').pop()!.replace(/\.md$/, '');
				openNote(ctx.vaultId!, res.path, title, 'replace');
			} catch (e) {
				alert((e as Error).message);
			}
		}
	});

	register({
		id: 'publish.export',
		title: 'Publish vault (static site)',
		icon: '⇪',
		category: 'file',
		async exec(ctx: CommandContext) {
			try {
				const res = await api.publish(ctx.vaultId!);
				const msg = `Published ${res.publicNotes} of ${res.totalNotes} notes to\n${res.outDir}\n\n${res.imagesCopied} image(s) copied.${res.skipped.length ? `\n${res.skipped.length} skipped.` : ''}\n\nDeploy this folder to any static host.`;
				alert(msg);
			} catch (e) {
				alert('Publish failed: ' + (e as Error).message);
			}
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
