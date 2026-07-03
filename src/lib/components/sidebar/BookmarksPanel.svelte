<script lang="ts">
	import { snapshot, remove } from '$lib/bookmarks.svelte';
	import { openNote } from '$lib/workspace/actions';
	import { bookmarks } from '$lib/bookmarks.svelte';

	interface Props {
		vaultId: string;
	}

	let { vaultId }: Props = $props();

	// Reactivity: read the underlying state directly so we re-render when it mutates.
	const items = $derived(bookmarks.byVault[vaultId] ?? []);

	function modeFor(e: MouseEvent): 'replace' | 'new-tab' | 'new-pane' {
		if (e.metaKey || e.ctrlKey || e.button === 1) return 'new-tab';
		if (e.altKey) return 'new-pane';
		return 'replace';
	}

	function open(e: MouseEvent, path: string, title: string): void {
		openNote(vaultId, path, title, modeFor(e));
	}

	// Make sure the snapshot has populated.
	$effect(() => { void snapshot(vaultId); });
</script>

{#if items.length > 0}
	<section class="bookmarks">
		<header class="head">
			<span class="label">Bookmarks</span>
			<span class="count">{items.length}</span>
		</header>
		<ul>
			{#each items as b (b.path)}
				<li class="row">
					<div
						class="bm"
						role="button"
						tabindex="0"
						onclick={(e) => open(e, b.path, b.title)}
						onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e as unknown as MouseEvent, b.path, b.title); } }}
						onauxclick={(e) => { if (e.button === 1) { e.preventDefault(); open(e, b.path, b.title); } }}
						title={b.path}
					>
						<span class="star">★</span>
						<span class="t">{b.title}</span>
					</div>
					<button
						class="x"
						title="Remove bookmark"
						onclick={(e) => { e.stopPropagation(); remove(vaultId, b.path); }}
					>×</button>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.bookmarks {
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
	li.row { display: flex; align-items: center; gap: 2px; padding: 0; border-radius: 4px; }
	li.row:hover { background: var(--bg-hover); }
	li.row:hover .x { opacity: 1; }
	.bm {
		display: flex;
		align-items: center;
		gap: 6px;
		flex: 1;
		min-width: 0;
		color: var(--fg);
		padding: 3px 6px;
		cursor: pointer;
		font: inherit;
		text-align: left;
	}
	.star { color: var(--accent); font-size: 0.78em; }
	.t { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.x {
		background: transparent;
		border: 0;
		color: var(--fg-dim);
		font-size: 1rem;
		line-height: 1;
		padding: 0 6px;
		cursor: pointer;
		opacity: 0;
		transition: opacity 0.12s;
	}
	.x:hover { color: var(--danger); }
</style>
