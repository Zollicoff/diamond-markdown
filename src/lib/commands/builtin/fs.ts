/**
 * Built-in filesystem commands. Each wraps the API client (which fires
 * the appropriate event) and prompts the user where needed.
 *
 * Kept side-effect-free at module load — only `registerFsCommands()`
 * actually touches the registry.
 */

import { api } from '$lib/vault-api';
import { register, type CommandContext } from '../registry';
import * as bookmarks from '$lib/bookmarks.svelte';

async function promptPath(msg: string, placeholder = ''): Promise<string | null> {
	if (typeof window === 'undefined') return null;
	const v = window.prompt(msg, placeholder);
	return v?.trim() || null;
}

async function confirmAction(msg: string): Promise<boolean> {
	if (typeof window === 'undefined') return false;
	return window.confirm(msg);
}

function ensureMd(s: string): string {
	return /\.[a-z0-9]+$/i.test(s) ? s : s + '.md';
}

export function registerFsCommands(): void {
	register({
		id: 'note.create',
		title: 'New note',
		icon: '＋',
		category: 'file',
		async exec(ctx: CommandContext) {
			const vaultId = ctx.vaultId!;
			const parent = ctx.node?.type === 'directory' ? ctx.node.path : '';
			const raw = await promptPath(`New note in "${parent || '(root)'}"`);
			if (!raw) return;
			const rel = (parent ? `${parent}/` : '') + ensureMd(raw);
			const title = raw.split('/').pop()!.replace(/\.md$/, '');
			try {
				await api.createNote(vaultId, rel, `---\ntitle: ${title}\n---\n\n`);
			} catch (e) {
				alert((e as Error).message);
			}
		}
	});

	register({
		id: 'folder.create',
		title: 'New folder',
		icon: '📁',
		category: 'file',
		async exec(ctx: CommandContext) {
			const vaultId = ctx.vaultId!;
			const parent = ctx.node?.type === 'directory' ? ctx.node.path : '';
			const raw = await promptPath(`New folder in "${parent || '(root)'}"`);
			if (!raw) return;
			const rel = (parent ? `${parent}/` : '') + raw.replace(/^\/+|\/+$/g, '');
			try {
				await api.createFolder(vaultId, rel);
			} catch (e) {
				alert((e as Error).message);
			}
		}
	});

	register({
		id: 'note.delete',
		title: 'Delete',
		icon: '🗑',
		category: 'file',
		async exec(ctx: CommandContext) {
			if (!ctx.node || ctx.node.type !== 'file') return;
			const { vaultId } = ctx;
			if (!(await confirmAction(`Delete "${ctx.node.name}"? Reversible via git log.`))) return;
			try {
				await api.deleteNote(vaultId!, ctx.node.path);
			} catch (e) {
				alert((e as Error).message);
			}
		}
	});

	register({
		id: 'note.duplicate',
		title: 'Duplicate',
		icon: '❏',
		category: 'file',
		async exec(ctx: CommandContext) {
			if (!ctx.node || ctx.node.type !== 'file') return;
			try {
				await api.duplicateNote(ctx.vaultId!, ctx.node.path);
			} catch (e) {
				alert((e as Error).message);
			}
		}
	});

	register({
		id: 'folder.delete',
		title: 'Delete folder',
		icon: '🗑',
		category: 'file',
		async exec(ctx: CommandContext) {
			if (!ctx.node || ctx.node.type !== 'directory') return;
			// Check emptiness client-side via tree — but the server enforces it too.
			const force = !!ctx.force;
			const msg = force
				? `Delete folder "${ctx.node.path}" and everything inside it?`
				: `Delete empty folder "${ctx.node.path}"?`;
			if (!(await confirmAction(msg))) return;
			try {
				await api.deleteFolder(ctx.vaultId!, ctx.node.path, force);
			} catch (e) {
				alert((e as Error).message);
			}
		}
	});

	register({
		id: 'path.copy',
		title: 'Copy path',
		icon: '⎘',
		category: 'file',
		async exec(ctx: CommandContext) {
			if (!ctx.node) return;
			await navigator.clipboard?.writeText(ctx.node.path).catch(() => {});
		}
	});

	register({
		id: 'note.toggle-star',
		title: 'Toggle bookmark',
		icon: '★',
		category: 'file',
		exec(ctx: CommandContext) {
			const path = ctx.node?.path ?? (ctx.notePath as string | undefined);
			if (!path || !ctx.vaultId) return;
			const title = (ctx.node?.name ?? path.split('/').pop() ?? path).replace(/\.md$/, '');
			bookmarks.toggle(ctx.vaultId, path, title);
		}
	});

	register({
		id: 'folder.toggle-exclude',
		title: 'Toggle excluded folder',
		icon: '🚫',
		category: 'file',
		when: (ctx) => ctx.node?.type === 'directory',
		async exec(ctx: CommandContext) {
			if (!ctx.node || ctx.node.type !== 'directory' || !ctx.vaultId) return;
			try {
				await api.toggleExcluded(ctx.vaultId, ctx.node.path);
			} catch (e) {
				alert((e as Error).message);
			}
		}
	});
}
