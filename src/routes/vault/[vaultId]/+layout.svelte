<script lang="ts">
	import type { LayoutData } from './$types';
	import { page } from '$app/state';
	import { goto, invalidateAll } from '$app/navigation';
	import FileTree, { type TreeNode } from '$lib/components/FileTree.svelte';
	import QuickSwitcher from '$lib/components/QuickSwitcher.svelte';
	import ContextMenu, { type MenuItem, type Position } from '$lib/components/ContextMenu.svelte';
	import { tabsStore } from '$lib/tabs.svelte';

	let { data, children }: { data: LayoutData; children: () => unknown } = $props();

	let activePath = $derived<string | null>(
		page.params.path ? decodeURIComponent(page.params.path) : null
	);

	let rootExpand = $derived(new Set(data.tree.filter((n) => n.type === 'directory').map((n) => n.path)));

	// ── Context menu state ────────────────────────────────────────────
	let menuOpen = $state(false);
	let menuPos = $state<Position>({ x: 0, y: 0 });
	let menuItems = $state<MenuItem[]>([]);

	// ── Inline rename state ───────────────────────────────────────────
	let renamingPath = $state<string | null>(null);

	function showMenu(e: MouseEvent, items: MenuItem[]): void {
		menuPos = { x: e.clientX, y: e.clientY };
		menuItems = items;
		menuOpen = true;
	}

	function closeMenu(): void { menuOpen = false; }

	async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
		const res = await fetch(url, init);
		if (!res.ok) {
			const body = await res.text();
			throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
		}
		return res.json() as Promise<T>;
	}

	function notify(msg: string, kind: 'ok' | 'err' = 'ok'): void {
		// Simple native alert for now; Obsidian-style toasts are a v0.3 polish.
		if (kind === 'err') alert(msg);
	}

	async function createNoteAt(dir: string): Promise<void> {
		const raw = prompt(`New note in "${dir || '(root)'}"`);
		if (!raw || !raw.trim()) return;
		const rel = (dir ? `${dir}/` : '') + (raw.trim().endsWith('.md') ? raw.trim() : `${raw.trim()}.md`);
		try {
			const title = raw.trim().split('/').pop()!.replace(/\.md$/, '');
			await api(`/api/vaults/${data.vault.id}/note`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ path: rel, content: `---\ntitle: ${title}\n---\n\n` })
			});
			await invalidateAll();
			goto(`/vault/${data.vault.id}/note/${encodeURI(rel)}`);
		} catch (e) { notify((e as Error).message, 'err'); }
	}

	async function createFolderAt(parent: string): Promise<void> {
		const raw = prompt(`New folder in "${parent || '(root)'}"`);
		if (!raw || !raw.trim()) return;
		const rel = (parent ? `${parent}/` : '') + raw.trim().replace(/^\/+|\/+$/g, '');
		try {
			await api(`/api/vaults/${data.vault.id}/folder`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ path: rel })
			});
			await invalidateAll();
		} catch (e) { notify((e as Error).message, 'err'); }
	}

	function beginRename(node: TreeNode): void {
		renamingPath = node.path;
	}

	async function commitRename(node: TreeNode, newName: string): Promise<void> {
		if (!newName || newName === node.name.replace(/\.md$/, '') || newName === node.name) {
			renamingPath = null;
			return;
		}
		const parent = node.path.split('/').slice(0, -1).join('/');
		const newPath = (parent ? `${parent}/` : '') + (node.type === 'file' ? `${newName}.md` : newName);
		renamingPath = null;
		try {
			if (node.type === 'file') {
				await api(`/api/vaults/${data.vault.id}/note`, {
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ from: node.path, to: newPath })
				});
				const titleFromNew = newPath.split('/').pop()!.replace(/\.md$/, '');
				tabsStore.rename(data.vault.id, node.path, newPath, titleFromNew);
				await invalidateAll();
				// If we renamed the currently-open note, nav to the new URL.
				if (activePath === node.path) {
					goto(`/vault/${data.vault.id}/note/${encodeURI(newPath)}`, { replaceState: true });
				}
			} else {
				await api(`/api/vaults/${data.vault.id}/folder`, {
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ from: node.path, to: newPath })
				});
				// Folder rename — every tab whose path starts with the old folder moves too.
				for (const t of [...tabsStore.tabs]) {
					if (t.path === node.path || t.path.startsWith(node.path + '/')) {
						const newT = newPath + t.path.slice(node.path.length);
						tabsStore.rename(data.vault.id, t.path, newT, t.title);
					}
				}
				await invalidateAll();
				if (activePath && activePath.startsWith(node.path + '/')) {
					const rel = activePath.slice(node.path.length + 1);
					goto(`/vault/${data.vault.id}/note/${encodeURI(newPath + '/' + rel)}`, { replaceState: true });
				}
			}
		} catch (e) { notify((e as Error).message, 'err'); }
	}

	async function deleteFile(node: TreeNode): Promise<void> {
		if (!confirm(`Delete "${node.name}"? This is reversible via git log.`)) return;
		try {
			await api(`/api/vaults/${data.vault.id}/note?path=${encodeURIComponent(node.path)}`, { method: 'DELETE' });
			tabsStore.close(data.vault.id, node.path);
			await invalidateAll();
			if (activePath === node.path) goto(`/vault/${data.vault.id}`, { replaceState: true });
		} catch (e) { notify((e as Error).message, 'err'); }
	}

	async function deleteFolder(node: TreeNode, force: boolean): Promise<void> {
		const msg = force
			? `Delete folder "${node.path}" and everything inside it? Reversible via git log.`
			: `Delete empty folder "${node.path}"?`;
		if (!confirm(msg)) return;
		try {
			const url = `/api/vaults/${data.vault.id}/folder?path=${encodeURIComponent(node.path)}${force ? '&force=1' : ''}`;
			await api(url, { method: 'DELETE' });
			// Close every tab under the deleted folder.
			for (const t of [...tabsStore.tabs]) {
				if (t.path === node.path || t.path.startsWith(node.path + '/')) {
					tabsStore.close(data.vault.id, t.path);
				}
			}
			await invalidateAll();
			if (activePath && (activePath === node.path || activePath.startsWith(node.path + '/'))) {
				goto(`/vault/${data.vault.id}`, { replaceState: true });
			}
		} catch (e) { notify((e as Error).message, 'err'); }
	}

	async function duplicateFile(node: TreeNode): Promise<void> {
		try {
			const res = await api<{ path: string }>(`/api/vaults/${data.vault.id}/note`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ from: node.path, duplicate: true })
			});
			await invalidateAll();
			goto(`/vault/${data.vault.id}/note/${encodeURI(res.path)}`);
		} catch (e) { notify((e as Error).message, 'err'); }
	}

	function copyPath(node: TreeNode): void {
		navigator.clipboard?.writeText(node.path).catch(() => {});
	}

	// ── drag-drop move ───────────────────────────────────────────────
	async function handleDropMove(srcPath: string, destFolder: string): Promise<void> {
		const isFolder = !srcPath.endsWith('.md');
		const name = srcPath.split('/').pop()!;
		const newPath = destFolder ? `${destFolder}/${name}` : name;
		if (newPath === srcPath) return;
		try {
			const url = isFolder
				? `/api/vaults/${data.vault.id}/folder`
				: `/api/vaults/${data.vault.id}/note`;
			await api(url, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ from: srcPath, to: newPath })
			});
			// Tab bookkeeping for the move.
			if (isFolder) {
				for (const t of [...tabsStore.tabs]) {
					if (t.path === srcPath || t.path.startsWith(srcPath + '/')) {
						const newT = newPath + t.path.slice(srcPath.length);
						tabsStore.rename(data.vault.id, t.path, newT, t.title);
					}
				}
			} else {
				const newTitle = newPath.split('/').pop()!.replace(/\.md$/, '');
				tabsStore.rename(data.vault.id, srcPath, newPath, newTitle);
			}
			await invalidateAll();
			if (!isFolder && activePath === srcPath) {
				goto(`/vault/${data.vault.id}/note/${encodeURI(newPath)}`, { replaceState: true });
			}
		} catch (e) { notify((e as Error).message, 'err'); }
	}

	// ── Context menu builders ────────────────────────────────────────
	function menuForFile(node: TreeNode): MenuItem[] {
		return [
			{ label: 'Open', icon: '→', action: () => goto(`/vault/${data.vault.id}/note/${encodeURI(node.path)}`) },
			{ separator: true, label: '' },
			{ label: 'Rename', icon: '✎', shortcut: 'F2', action: () => beginRename(node) },
			{ label: 'Duplicate', icon: '❏', action: () => duplicateFile(node) },
			{ label: 'Copy path', icon: '⎘', action: () => copyPath(node) },
			{ separator: true, label: '' },
			{ label: 'Delete', icon: '🗑', danger: true, action: () => deleteFile(node) }
		];
	}

	function menuForFolder(node: TreeNode): MenuItem[] {
		const empty = !node.children || node.children.length === 0;
		return [
			{ label: 'New note here', icon: '＋', action: () => createNoteAt(node.path) },
			{ label: 'New folder here', icon: '📁', action: () => createFolderAt(node.path) },
			{ separator: true, label: '' },
			{ label: 'Rename', icon: '✎', shortcut: 'F2', action: () => beginRename(node) },
			{ label: 'Copy path', icon: '⎘', action: () => copyPath(node) },
			{ separator: true, label: '' },
			{
				label: empty ? 'Delete empty folder' : 'Delete folder + contents',
				icon: '🗑',
				danger: true,
				action: () => deleteFolder(node, !empty)
			}
		];
	}

	function menuForRoot(): MenuItem[] {
		return [
			{ label: 'New note', icon: '＋', action: () => createNoteAt('') },
			{ label: 'New folder', icon: '📁', action: () => createFolderAt('') }
		];
	}

	function onNodeContext(e: MouseEvent, node: TreeNode): void {
		showMenu(e, node.type === 'file' ? menuForFile(node) : menuForFolder(node));
	}

	function onRootContextFire(e: MouseEvent): void {
		showMenu(e, menuForRoot());
	}

	// ── Top-of-tree buttons (delegated to same handlers) ─────────────
	function topCreateNote(): void { void createNoteAt(''); }
	function topCreateFolder(): void { void createFolderAt(''); }
</script>

<div class="shell">
	<aside
		class="sidebar"
		oncontextmenu={(e) => {
			// Only fire the root menu when the click didn't originate on a tree node.
			if ((e.target as HTMLElement).closest('.node')) return;
			e.preventDefault();
			onRootContextFire(e);
		}}
	>
		<header class="sidebar-head">
			<a class="brand" href="/">Diamond</a>
			<span class="vault-name">{data.vault.name}</span>
		</header>

		<div class="tree-tools">
			<button class="tool-btn" onclick={topCreateNote} title="New note">＋ Note</button>
			<button class="tool-btn" onclick={topCreateFolder} title="New folder">📁 Folder</button>
		</div>

		<div class="tree-wrap">
			<FileTree
				nodes={data.tree as TreeNode[]}
				vaultId={data.vault.id}
				{activePath}
				expanded={rootExpand}
				{renamingPath}
				onContext={onNodeContext}
				onRootContext={onRootContextFire}
				onDropMove={handleDropMove}
				onRenameCommit={commitRename}
				onRenameCancel={() => (renamingPath = null)}
			/>
		</div>

		<footer class="sidebar-foot">
			<a href="/" class="switch">← Switch vault</a>
		</footer>
	</aside>

	<main class="content">
		{@render children()}
	</main>
</div>

<QuickSwitcher vaultId={data.vault.id} />

{#if menuOpen}
	<ContextMenu items={menuItems} pos={menuPos} onClose={closeMenu} />
{/if}

<style>
	.shell {
		display: grid;
		grid-template-columns: 280px 1fr;
		height: 100vh;
	}

	.sidebar {
		display: flex;
		flex-direction: column;
		background: var(--bg-elev);
		border-right: 1px solid var(--border);
		overflow: hidden;
	}
	.sidebar-head {
		padding: 14px 16px 10px;
		display: flex; flex-direction: column; gap: 4px;
	}
	.brand {
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--accent);
		letter-spacing: -0.01em;
		line-height: 1;
		text-decoration: none;
	}
	.vault-name {
		font-size: 0.78rem;
		color: var(--fg-muted);
		font-family: var(--mono);
	}

	.tree-tools {
		display: flex;
		gap: 6px;
		padding: 6px 10px 10px;
		border-bottom: 1px solid var(--border);
	}
	.tool-btn {
		flex: 1;
		background: var(--bg);
		border: 1px solid var(--border);
		color: var(--fg);
		padding: 5px 8px;
		border-radius: 5px;
		cursor: pointer;
		font: inherit;
		font-size: 0.78rem;
	}
	.tool-btn:hover { border-color: var(--accent); color: var(--accent); }

	.tree-wrap {
		flex: 1;
		overflow-y: auto;
		padding: 10px;
	}

	.sidebar-foot {
		padding: 10px 14px;
		border-top: 1px solid var(--border);
		font-size: 0.8rem;
	}
	.switch { color: var(--fg-muted); text-decoration: none; }
	.switch:hover { color: var(--accent); }

	.content {
		overflow: hidden;
	}

	@media (max-width: 768px) {
		.shell { grid-template-columns: 220px 1fr; }
	}
</style>
