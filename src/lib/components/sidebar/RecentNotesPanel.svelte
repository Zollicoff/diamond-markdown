<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { on as onBus } from '$lib/events';
	import { openNote } from '$lib/workspace/actions';

	interface Props {
		vaultId: string;
		max?: number;
	}

	let { vaultId, max = 8 }: Props = $props();

	interface Recent { path: string; title: string; }

	let recent = $state<Recent[]>([]);

	function refresh(): void {
		if (!browser) return;
		try {
			const raw = localStorage.getItem(`diamond.tabs.${vaultId}`);
			if (!raw) { recent = []; return; }
			const arr = JSON.parse(raw) as { path: string; title: string }[];
			// Most recent = end of the list per the tab store contract.
			const seen = new Set<string>();
			const out: Recent[] = [];
			for (const t of [...arr].reverse()) {
				if (!t.path || seen.has(t.path)) continue;
				seen.add(t.path);
				out.push({ path: t.path, title: t.title });
				if (out.length >= max) break;
			}
			recent = out;
		} catch {
			recent = [];
		}
	}

	function modeFor(e: MouseEvent): 'replace' | 'new-tab' | 'new-pane' {
		if (e.metaKey || e.ctrlKey || e.button === 1) return 'new-tab';
		if (e.altKey) return 'new-pane';
		return 'replace';
	}

	function open(e: MouseEvent, path: string, title: string): void {
		openNote(vaultId, path, title, modeFor(e));
	}

	onMount(() => {
		refresh();
		// Re-read whenever a note is saved/created/renamed/deleted — the tab
		// store will have rewritten its localStorage by the time these fire.
		const offs = [
			onBus('note:saved',   (e) => { if (e.vaultId === vaultId) refresh(); }),
			onBus('note:created', (e) => { if (e.vaultId === vaultId) refresh(); }),
			onBus('note:renamed', (e) => { if (e.vaultId === vaultId) refresh(); }),
			onBus('note:deleted', (e) => { if (e.vaultId === vaultId) refresh(); })
		];
		// localStorage updates from other tabs.
		const onStorage = (ev: StorageEvent): void => {
			if (ev.key === `diamond.tabs.${vaultId}`) refresh();
		};
		window.addEventListener('storage', onStorage);
		return () => {
			offs.forEach((o) => o());
			window.removeEventListener('storage', onStorage);
		};
	});
</script>

{#if recent.length > 0}
	<section class="recent">
		<header class="head">
			<span class="label">Recent</span>
			<span class="count">{recent.length}</span>
		</header>
		<ul>
			{#each recent as r (r.path)}
				<li>
					<button class="r" onclick={(e) => open(e, r.path, r.title)} onauxclick={(e) => { if (e.button === 1) { e.preventDefault(); open(e, r.path, r.title); } }} title={r.path}>
						<span class="dot">·</span>
						<span class="t">{r.title}</span>
					</button>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.recent {
		padding: 8px 10px;
		border-bottom: 1px solid var(--border);
		font-size: 0.84rem;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 4px;
		padding: 0 4px;
	}
	.label {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: var(--fg-dim);
		font-weight: 600;
	}
	.count { font-size: 0.7rem; color: var(--fg-dim); font-family: var(--mono); }
	ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 1px; }
	li { padding: 0; }
	.r {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		background: transparent;
		border: 0;
		color: var(--fg-muted);
		padding: 3px 6px;
		border-radius: 4px;
		cursor: pointer;
		font: inherit;
		text-align: left;
	}
	.r:hover { background: var(--bg-hover); color: var(--fg); }
	.dot { color: var(--fg-dim); font-weight: 700; }
	.t { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
