<script lang="ts">
	import { exec } from '$lib/commands';

	interface Props {
		vaultId: string;
	}
	let { vaultId }: Props = $props();
</script>

<nav class="rail" aria-label="Left activity bar">
	<div class="rail-actions">
		<button class="r-btn" onclick={() => exec('note.create', { vaultId })} title="New note" aria-label="New note">
			<svg viewBox="0 0 16 16" aria-hidden="true">
				<path d="M9 2 H4 a1 1 0 0 0 -1 1 V13 a1 1 0 0 0 1 1 H12 a1 1 0 0 0 1 -1 V6" />
				<path d="M9 2 L13 6" />
				<path d="M9 2 V6 H13" />
			</svg>
		</button>
		<button class="r-btn" onclick={() => exec('folder.create', { vaultId })} title="New folder" aria-label="New folder">
			<svg viewBox="0 0 16 16" aria-hidden="true">
				<path d="M2 5 a1 1 0 0 1 1 -1 H6.5 L8 5.5 H13 a1 1 0 0 1 1 1 V12 a1 1 0 0 1 -1 1 H3 a1 1 0 0 1 -1 -1 Z" />
			</svg>
		</button>
	</div>

	<div class="rail-divider" aria-hidden="true"></div>

	<div class="rail-actions">
		<button class="r-btn" onclick={() => exec('daily.open', { vaultId })} title="Today (⌘⇧D)" aria-label="Today's daily note">
			<svg viewBox="0 0 16 16" aria-hidden="true">
				<rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
				<line x1="2.5" y1="6.5" x2="13.5" y2="6.5" />
				<line x1="5" y1="2" x2="5" y2="4.5" />
				<line x1="11" y1="2" x2="11" y2="4.5" />
			</svg>
		</button>
		<button class="r-btn" onclick={() => exec('tags.open', { vaultId })} title="Tags" aria-label="Tags">
			<svg viewBox="0 0 16 16" aria-hidden="true">
				<line x1="3" y1="6" x2="13" y2="6" />
				<line x1="3" y1="10" x2="13" y2="10" />
				<line x1="6.5" y1="2.5" x2="5" y2="13.5" />
				<line x1="11" y1="2.5" x2="9.5" y2="13.5" />
			</svg>
		</button>
		<button class="r-btn" onclick={() => exec('graph.open', { vaultId })} title="Graph" aria-label="Graph">
			<svg viewBox="0 0 16 16" aria-hidden="true">
				<line x1="4.5" y1="4.5" x2="11.5" y2="4.5" />
				<line x1="4.5" y1="4.5" x2="8" y2="11.5" />
				<line x1="11.5" y1="4.5" x2="8" y2="11.5" />
				<circle cx="4.5" cy="4.5" r="1.6" class="solid" />
				<circle cx="11.5" cy="4.5" r="1.6" class="solid" />
				<circle cx="8" cy="11.5" r="1.6" class="solid" />
			</svg>
		</button>
	</div>

	<div class="rail-spacer"></div>

	<div class="rail-actions rail-bottom">
		<button class="r-btn" onclick={() => exec('publish.export', { vaultId })} title="Publish (export static site)" aria-label="Publish">
			<svg viewBox="0 0 16 16" aria-hidden="true">
				<path d="M8 2.5 V10" />
				<path d="M5 5.5 L8 2.5 L11 5.5" />
				<path d="M3 10 V13 a1 1 0 0 0 1 1 H12 a1 1 0 0 0 1 -1 V10" />
			</svg>
		</button>
		<button class="r-btn" onclick={() => exec('shortcuts.open', { vaultId })} title="Keyboard shortcuts" aria-label="Keyboard shortcuts">
			<svg viewBox="0 0 16 16" aria-hidden="true">
				<rect x="1.5" y="4.5" width="13" height="8" rx="1.5" />
				<line x1="4" y1="7.5" x2="4.01" y2="7.5" stroke-linecap="round" stroke-width="1.6" />
				<line x1="6.5" y1="7.5" x2="6.51" y2="7.5" stroke-linecap="round" stroke-width="1.6" />
				<line x1="9" y1="7.5" x2="9.01" y2="7.5" stroke-linecap="round" stroke-width="1.6" />
				<line x1="11.5" y1="7.5" x2="11.51" y2="7.5" stroke-linecap="round" stroke-width="1.6" />
				<line x1="5" y1="10" x2="11" y2="10" stroke-linecap="round" />
			</svg>
		</button>
		<button class="r-btn" onclick={() => exec('settings.open', { vaultId })} title="Settings" aria-label="Settings">
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<!-- Lucide-style cog: notched perimeter + center bore -->
				<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
				<circle cx="12" cy="12" r="3" />
			</svg>
		</button>
	</div>
</nav>

<style>
	.rail {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 8px 0;
		background: var(--bg);
		border-right: 1px solid var(--border);
		height: 100%;
	}
	.rail-actions {
		display: flex;
		flex-direction: column;
		gap: 2px;
		width: 100%;
		align-items: center;
	}
	.rail-divider {
		width: 18px;
		height: 1px;
		background: var(--border);
		margin: 4px 0;
	}
	.rail-spacer { flex: 1; }
	.r-btn {
		background: transparent;
		border: 0;
		color: var(--fg-muted);
		width: 28px;
		height: 28px;
		border-radius: 5px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
	}
	.r-btn:hover { color: var(--accent); background: var(--bg-hover); }
	.r-btn svg {
		width: 16px;
		height: 16px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.r-btn svg .solid {
		fill: currentColor;
		stroke: none;
	}

	@media (max-width: 640px) {
		.rail { padding: 10px 0; }
		.r-btn { width: 36px; height: 36px; }
		.r-btn svg { width: 18px; height: 18px; }
	}
</style>
