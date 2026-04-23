<script lang="ts">
	import type { LayoutData } from './$types';
	import { page } from '$app/state';
	import { goto, invalidateAll } from '$app/navigation';
	import FileTree, { type TreeNode } from '$lib/components/FileTree.svelte';
	import QuickSwitcher from '$lib/components/QuickSwitcher.svelte';

	let { data, children }: { data: LayoutData; children: () => unknown } = $props();

	let activePath = $derived<string | null>(
		page.params.path ? decodeURIComponent(page.params.path) : null
	);

	// Root-level dirs auto-expanded for nicer first load.
	let rootExpand = $derived(new Set(data.tree.filter((n) => n.type === 'directory').map((n) => n.path)));

	async function createFolder(): Promise<void> {
		const name = prompt('Folder name (can include nested path like "Projects/Client A")');
		if (!name || !name.trim()) return;
		const res = await fetch(`/api/vaults/${data.vault.id}/folder`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ path: name.trim() })
		});
		if (!res.ok) {
			const body = await res.text();
			alert(`Folder failed: HTTP ${res.status} ${body.slice(0, 120)}`);
			return;
		}
		await invalidateAll();
	}

	async function createNote(): Promise<void> {
		const name = prompt('New note (path + title, e.g. "Projects/Ideas/Foo")');
		if (!name || !name.trim()) return;
		const notePath = name.trim().endsWith('.md') ? name.trim() : `${name.trim()}.md`;
		// Save a minimal stub.
		const body = `---\ntitle: ${name.trim().split('/').pop()!.replace(/\.md$/, '')}\n---\n\n`;
		const res = await fetch(`/api/vaults/${data.vault.id}/note`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ path: notePath, content: body })
		});
		if (!res.ok) {
			const text = await res.text();
			alert(`Create failed: HTTP ${res.status} ${text.slice(0, 120)}`);
			return;
		}
		await invalidateAll();
		goto(`/vault/${data.vault.id}/note/${encodeURI(notePath)}`);
	}
</script>

<div class="shell">
	<aside class="sidebar">
		<header class="sidebar-head">
			<a class="brand" href="/">Diamond</a>
			<span class="vault-name">{data.vault.name}</span>
		</header>

		<div class="tree-tools">
			<button class="tool-btn" onclick={createNote} title="New note (⌘N)">＋ Note</button>
			<button class="tool-btn" onclick={createFolder} title="New folder">📁 Folder</button>
		</div>

		<div class="tree-wrap">
			<FileTree nodes={data.tree as TreeNode[]} vaultId={data.vault.id} {activePath} expanded={rootExpand} />
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
