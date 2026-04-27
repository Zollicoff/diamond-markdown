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
	<button class="n-btn" onclick={() => exec('daily.open', { vaultId })} title="Today (⌘⇧D)" aria-label="Today's daily note">
		<svg viewBox="0 0 16 16" aria-hidden="true">
			<rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
			<line x1="2.5" y1="6.5" x2="13.5" y2="6.5" />
			<line x1="5" y1="2" x2="5" y2="4.5" />
			<line x1="11" y1="2" x2="11" y2="4.5" />
		</svg>
	</button>
	<button class="n-btn" onclick={() => exec('tags.open', { vaultId })} title="Tags" aria-label="Tags">
		<svg viewBox="0 0 16 16" aria-hidden="true">
			<line x1="3" y1="6" x2="13" y2="6" />
			<line x1="3" y1="10" x2="13" y2="10" />
			<line x1="6.5" y1="2.5" x2="5" y2="13.5" />
			<line x1="11" y1="2.5" x2="9.5" y2="13.5" />
		</svg>
	</button>
	<button class="n-btn" onclick={() => exec('graph.open', { vaultId })} title="Graph" aria-label="Graph">
		<svg viewBox="0 0 16 16" aria-hidden="true">
			<line x1="4.5" y1="4.5" x2="11.5" y2="4.5" />
			<line x1="4.5" y1="4.5" x2="8" y2="11.5" />
			<line x1="11.5" y1="4.5" x2="8" y2="11.5" />
			<circle cx="4.5" cy="4.5" r="1.6" class="solid" />
			<circle cx="11.5" cy="4.5" r="1.6" class="solid" />
			<circle cx="8" cy="11.5" r="1.6" class="solid" />
		</svg>
	</button>
	<button class="n-btn" onclick={() => exec('publish.export', { vaultId })} title="Publish (export static site)" aria-label="Publish">
		<svg viewBox="0 0 16 16" aria-hidden="true">
			<path d="M8 2.5 V10" />
			<path d="M5 5.5 L8 2.5 L11 5.5" />
			<path d="M3 10 V13 a1 1 0 0 0 1 1 H12 a1 1 0 0 0 1 -1 V10" />
		</svg>
	</button>
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
		padding: 6px 4px;
		border-radius: 4px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.n-btn:hover { color: var(--accent); background: var(--bg-hover); }
	.n-btn svg {
		width: 16px;
		height: 16px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.n-btn svg .solid {
		fill: currentColor;
		stroke: none;
	}
</style>
