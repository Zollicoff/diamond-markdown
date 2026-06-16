<script lang="ts">
	import { list as listCommands } from '$lib/commands';
	import { bindings, comboToDisplay } from '$lib/commands/keymap';
	import {
		buildShortcutRows,
		groupShortcutRows,
		SHORTCUT_CATEGORY_LABELS,
		SHORTCUT_CATEGORY_ORDER
	} from '$lib/shortcuts/view';

	const all = $derived(buildShortcutRows(listCommands(), bindings).map((row) => ({
		...row,
		shortcut: row.source === 'global' ? comboToDisplay(row.shortcut) : row.shortcut
	})));
	const grouped = $derived(groupShortcutRows(all));
</script>

<div class="shortcuts">
	<header class="head">
		<h1>Keyboard shortcuts</h1>
		<span class="hint">All bindings are global except where noted. Source of truth: <code class="mono">src/lib/commands/keymap.ts</code>.</span>
	</header>

	{#each SHORTCUT_CATEGORY_ORDER as cat (cat)}
		{#if grouped.get(cat)}
			<section class="group">
				<h2>{SHORTCUT_CATEGORY_LABELS[cat] ?? cat}</h2>
				<ul class="rows">
					{#each grouped.get(cat) ?? [] as row (row.title + row.shortcut)}
						<li class="row">
							<span class="title">
								<span>{row.title}</span>
								{#if row.obsidianCommandIds.length > 0}
									<span class="obsidian mono">{row.obsidianCommandIds.join(', ')}</span>
								{/if}
							</span>
							<kbd class="kbd mono">{row.shortcut}</kbd>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{/each}
</div>

<style>
	.shortcuts {
		max-width: 760px;
		margin: 0 auto;
		padding: 28px 32px 56px;
		overflow-y: auto;
		height: 100%;
		min-height: 0;
		color: var(--fg);
	}
	.head { margin-bottom: 28px; }
	.head h1 {
		font-family: 'Bricolage Grotesque', var(--sans);
		font-weight: 700;
		font-size: 1.6rem;
		margin: 0 0 4px;
		letter-spacing: -0.02em;
	}
	.head .hint { color: var(--fg-dim); font-size: 0.85rem; }
	.head code { font-size: 0.78rem; color: var(--fg-muted); }

	.group {
		margin-bottom: 28px;
		padding-bottom: 16px;
		border-bottom: 1px solid var(--border);
	}
	.group:last-of-type { border-bottom: 0; }
	.group h2 {
		font-family: 'Bricolage Grotesque', var(--sans);
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--fg-muted);
		margin: 0 0 12px;
	}

	.rows { list-style: none; padding: 0; margin: 0; }
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 4px;
		gap: 16px;
		font-size: 0.9rem;
	}
	.row + .row { border-top: 1px dashed var(--border); }
	.title {
		color: var(--fg);
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.obsidian {
		color: var(--fg-dim);
		font-size: 0.72rem;
		line-height: 1.25;
		overflow-wrap: anywhere;
	}
	.kbd {
		flex: none;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		border-radius: 5px;
		padding: 3px 8px;
		font-size: 0.78rem;
		color: var(--fg-muted);
		white-space: nowrap;
	}
	.mono { font-family: var(--mono); }
</style>
