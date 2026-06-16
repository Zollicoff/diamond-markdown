/**
 * Built-in filesystem commands. Each wraps the API client (which fires
 * the appropriate event) and prompts the user where needed.
 *
 * Kept side-effect-free at module load — only `registerFsCommands()`
 * actually touches the registry.
 */

import { api } from '$lib/vault-api';
import { register, type CommandContext } from '../registry';
import type { TreeNode } from '$lib/types';
import * as bookmarks from '$lib/bookmarks.svelte';
import { emit } from '$lib/events';
import { alertDialog, confirmDialog, notify, promptText } from '$lib/dialogs';
import { buildNewNotePath, newNotePromptLabel } from '$lib/note/new-note';
import { isCanvasTreeFile } from '$lib/tree/view';

async function promptPath(title: string, label: string, confirmLabel: string, placeholder = ''): Promise<string | null> {
	return promptText({ title, label, placeholder, confirmLabel });
}

async function confirmVaultDelete(vaultId: string | undefined, options: Parameters<typeof confirmDialog>[0]): Promise<boolean> {
	if (!vaultId) return false;
	const preference = await api.deletePreferences(vaultId).catch(() => ({ confirmDeletes: true }));
	return preference.confirmDeletes ? confirmDialog(options) : true;
}

function markdownNode(ctx: CommandContext): TreeNode | null {
	const node = ctx.node;
	if (!node || node.type !== 'file') return null;
	return !node.fileKind || node.fileKind === 'markdown' ? node : null;
}

function canvasNode(ctx: CommandContext): TreeNode | null {
	const node = ctx.node;
	if (!node || !isCanvasTreeFile(node)) return null;
	return node;
}

export function registerFsCommands(): void {
	register({
		id: 'note.create',
		title: 'New note',
		icon: '＋',
		category: 'file',
		async exec(ctx: CommandContext) {
			const vaultId = ctx.vaultId!;
			const explicitParent = ctx.node?.type === 'directory' ? ctx.node.path : null;
			const configured = explicitParent
				? null
				: await api.newNoteLocation(vaultId).catch(() => null);
			const parent = explicitParent ?? configured?.folder ?? '';
			const raw = await promptPath(
				'New note',
				newNotePromptLabel(parent),
				'Create note'
			);
			if (!raw) return;
			const note = buildNewNotePath(raw, parent);
			if (!note) return;
			try {
				await api.createNote(vaultId, note.path, `---\ntitle: ${note.title}\n---\n\n`);
			} catch (e) {
				await alertDialog({ title: 'Could not create note', message: (e as Error).message, tone: 'danger' });
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
			const raw = await promptPath(
				'New folder',
				`Name in ${parent || 'vault root'}`,
				'Create folder'
			);
			if (!raw) return;
			const rel = (parent ? `${parent}/` : '') + raw.replace(/^\/+|\/+$/g, '');
			try {
				await api.createFolder(vaultId, rel);
			} catch (e) {
				await alertDialog({ title: 'Could not create folder', message: (e as Error).message, tone: 'danger' });
			}
		}
	});

	register({
		id: 'note.delete',
		title: 'Delete',
		icon: '🗑',
		category: 'file',
		async exec(ctx: CommandContext) {
			const node = markdownNode(ctx);
			if (!node) return;
			const { vaultId } = ctx;
			if (!(await confirmVaultDelete(vaultId, {
				title: 'Delete note',
				message: `Delete "${node.name}"?\n\nThis is reversible through git history.`,
				confirmLabel: 'Delete',
				tone: 'danger'
			}))) return;
			try {
				await api.deleteNote(vaultId!, node.path);
			} catch (e) {
				await alertDialog({ title: 'Could not delete note', message: (e as Error).message, tone: 'danger' });
			}
		}
	});

	register({
		id: 'note.duplicate',
		title: 'Duplicate',
		icon: '❏',
		category: 'file',
		async exec(ctx: CommandContext) {
			const node = markdownNode(ctx);
			if (!node) return;
			try {
				await api.duplicateNote(ctx.vaultId!, node.path);
			} catch (e) {
				await alertDialog({ title: 'Could not duplicate note', message: (e as Error).message, tone: 'danger' });
			}
		}
	});

	register({
		id: 'canvas.delete',
		title: 'Delete Canvas',
		icon: '🗑',
		category: 'file',
		async exec(ctx: CommandContext) {
			const node = canvasNode(ctx);
			if (!node) return;
			if (!(await confirmVaultDelete(ctx.vaultId, {
				title: 'Delete Canvas',
				message: `Delete "${node.name}"?\n\nThis is reversible through git history.`,
				confirmLabel: 'Delete',
				tone: 'danger'
			}))) return;
			try {
				await api.deleteCanvas(ctx.vaultId!, node.path);
			} catch (e) {
				await alertDialog({ title: 'Could not delete Canvas', message: (e as Error).message, tone: 'danger' });
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
			if (!(await confirmVaultDelete(ctx.vaultId, {
				title: force ? 'Delete folder and contents' : 'Delete folder',
				message: msg,
				confirmLabel: 'Delete',
				tone: 'danger'
			}))) return;
			try {
				await api.deleteFolder(ctx.vaultId!, ctx.node.path, force);
			} catch (e) {
				await alertDialog({ title: 'Could not delete folder', message: (e as Error).message, tone: 'danger' });
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
			await navigator.clipboard?.writeText(ctx.node.path).then(() => {
				notify({ title: 'Path copied', message: ctx.node?.path, tone: 'success' });
			}).catch(() => {
				notify({ title: 'Could not copy path', tone: 'danger' });
			});
		}
	});

	register({
		id: 'note.rename',
		title: 'Rename note',
		icon: '✎',
		shortcut: 'F2',
		category: 'file',
		when: (ctx) => Boolean(markdownNode(ctx)?.path || ctx.notePath),
		exec(ctx: CommandContext) {
			const path = ctx.node?.path ?? (ctx.notePath as string | undefined);
			if (!path || !ctx.vaultId) return;
			// FileTreePanel listens for this and flips the matching node
			// into rename mode (in-place input). Using a bus event keeps
			// the command registry decoupled from the panel.
			emit('note:rename-request', { vaultId: ctx.vaultId, path });
		}
	});

	register({
		id: 'note.toggle-star',
		title: 'Toggle bookmark',
		icon: '★',
		category: 'file',
		async exec(ctx: CommandContext) {
			if (ctx.node && !markdownNode(ctx)) return;
			const path = ctx.node?.path ?? (ctx.notePath as string | undefined);
			if (!path || !ctx.vaultId) return;
			const title = (ctx.node?.name ?? path.split('/').pop() ?? path).replace(/\.md$/, '');
			try {
				await bookmarks.toggle(ctx.vaultId, path, title);
			} catch (e) {
				await alertDialog({ title: 'Could not update bookmark', message: (e as Error).message, tone: 'danger' });
			}
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
				await alertDialog({ title: 'Could not update excluded folders', message: (e as Error).message, tone: 'danger' });
			}
		}
	});
}
