<script lang="ts">
	import { exec } from '$lib/commands';

	interface Props { vaultId: string; }
	let { vaultId }: Props = $props();
</script>

<div class="tools">
	<button class="t-btn" onclick={() => exec('note.create', { vaultId })} title="New note">＋ Note</button>
	<button class="t-btn" onclick={() => exec('folder.create', { vaultId })} title="New folder">📁 Folder</button>
</div>
<div class="nav">
	<button class="n-btn" onclick={() => exec('daily.open', { vaultId })} title="Open today's daily (⌘⇧D)">📅 Today</button>
	<button class="n-btn" onclick={() => exec('tags.open', { vaultId })} title="Show tags">#  Tags</button>
	<button class="n-btn" onclick={() => exec('graph.open', { vaultId })} title="Show graph">◉  Graph</button>
	<button class="n-btn" onclick={() => exec('publish.export', { vaultId })} title="Publish public notes as static site">⇪  Publish</button>
</div>

<style>
	.tools {
		display: flex;
		gap: 6px;
		padding: 6px 10px 10px;
		border-bottom: 1px solid var(--border);
	}
	.t-btn {
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
	.t-btn:hover { border-color: var(--accent); color: var(--accent); }

	.nav {
		display: flex;
		gap: 4px;
		padding: 6px 10px;
		border-bottom: 1px solid var(--border);
	}
	.n-btn {
		flex: 1;
		background: transparent;
		border: 0;
		color: var(--fg-muted);
		padding: 4px 6px;
		border-radius: 4px;
		cursor: pointer;
		font: inherit;
		font-size: 0.78rem;
		text-align: left;
	}
	.n-btn:hover { color: var(--accent); background: var(--bg-hover); }
</style>
