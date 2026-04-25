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

	register({
		id: 'template.insert',
		title: 'Insert template…',
		icon: '📋',
		shortcut: '⌘⇧T',
		category: 'file',
		async exec(ctx: CommandContext) {
			if (!ctx.vaultId) return;
			try {
				const list = await fetch(`/api/vaults/${ctx.vaultId}/templates`).then((r) => r.json()) as { templates: { path: string; name: string }[] };
				const tpls = list.templates ?? [];
				if (tpls.length === 0) {
					alert('No templates yet. Create files in Templates/ to use as templates.');
					return;
				}
				const choice = window.prompt(`Insert template (type the name):\n\n${tpls.map((t, i) => `${i + 1}. ${t.name}`).join('\n')}`, tpls[0].name);
				if (!choice) return;
				let chosen: { path: string; name: string } | undefined;
				const asNum = parseInt(choice, 10);
				if (!isNaN(asNum) && asNum >= 1 && asNum <= tpls.length) chosen = tpls[asNum - 1];
				else chosen = tpls.find((t) => t.name.toLowerCase() === choice.trim().toLowerCase());
				if (!chosen) { alert(`No template named "${choice}".`); return; }
				const noteTitle = (ctx.notePath as string | undefined)?.split('/').pop()?.replace(/\.md$/, '') ?? '';
				const res = await fetch(`/api/vaults/${ctx.vaultId}/templates?name=${encodeURIComponent(chosen.name)}&title=${encodeURIComponent(noteTitle)}`).then((r) => r.json()) as { content: string };
				emit('template:insert', { vaultId: ctx.vaultId, content: res.content });
			} catch (e) {
				alert((e as Error).message);
			}
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
