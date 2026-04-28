/**
 * View / layout commands — sidebar collapse, split directions.
 */

import { register, type CommandContext } from '../registry';
import { toggleLeftSidebar, toggleRightSidebar, openTab, openNote } from '$lib/workspace/actions';
import { emit } from '$lib/events';
import { api } from '$lib/vault-api';
import { cycle as cycleTheme, setMode as setThemeMode } from '$lib/theme.svelte';

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
			// App-style tab — opens beside the active note, doesn't replace it.
			openTab(ctx.vaultId!, { id: 'tags:', kind: 'tags', title: 'Tags' }, 'new-tab');
		}
	});

	register({
		id: 'graph.open',
		title: 'Show graph',
		icon: '◉',
		category: 'view',
		exec(ctx: CommandContext) {
			// App-style tab — opens beside the active note, doesn't replace it.
			// openTab dedupes by id, so a second open just activates the existing tab.
			openTab(ctx.vaultId!, { id: 'graph', kind: 'graph', title: 'Graph' }, 'new-tab');
		}
	});

	register({
		id: 'settings.open',
		title: 'Open settings',
		icon: '⚙',
		category: 'view',
		exec(ctx: CommandContext) {
			// Singleton tab — same dedupe rule as graph.
			openTab(ctx.vaultId!, { id: 'settings', kind: 'settings', title: 'Settings' }, 'new-tab');
		}
	});

	register({
		id: 'shortcuts.open',
		title: 'Show keyboard shortcuts',
		icon: '⌨',
		category: 'view',
		exec(ctx: CommandContext) {
			openTab(ctx.vaultId!, { id: 'shortcuts', kind: 'shortcuts', title: 'Shortcuts' }, 'new-tab');
		}
	});

	register({
		id: 'search.open',
		title: 'Search in vault',
		icon: '🔍',
		category: 'view',
		exec(ctx: CommandContext) {
			openTab(
				ctx.vaultId!,
				{ id: 'search', kind: 'search', title: 'Search', query: '' },
				'new-tab'
			);
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

	register({
		id: 'template.insert',
		title: 'Insert template…',
		icon: '📋',
		shortcut: '⌘⇧T',
		category: 'file',
		exec(ctx: CommandContext) {
			if (!ctx.vaultId) return;
			const noteTitle = (ctx.notePath as string | undefined)?.split('/').pop()?.replace(/\.md$/, '') ?? '';
			emit('palette:template-pick', { vaultId: ctx.vaultId, activeNoteTitle: noteTitle });
		}
	});

	register({
		id: 'theme.cycle',
		title: 'Cycle theme (dark / light / auto)',
		icon: '◐',
		shortcut: '⌘⇧L',
		category: 'view',
		exec() { cycleTheme(); }
	});
	register({
		id: 'theme.dark',
		title: 'Theme: Dark',
		icon: '●',
		category: 'view',
		exec() { setThemeMode('dark'); }
	});
	register({
		id: 'theme.light',
		title: 'Theme: Light',
		icon: '○',
		category: 'view',
		exec() { setThemeMode('light'); }
	});
	register({
		id: 'theme.auto',
		title: 'Theme: Auto (match system)',
		icon: '◐',
		category: 'view',
		exec() { setThemeMode('auto'); }
	});
}
