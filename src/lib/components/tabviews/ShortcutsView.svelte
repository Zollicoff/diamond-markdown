<script lang="ts">
	import { list as listCommands } from '$lib/commands';
	import { bindings, comboToDisplay } from '$lib/commands/keymap';

	interface Row {
		title: string;
		shortcut: string;
		category: string;
	}

	const commandsById = new Map(listCommands().map((c) => [c.id, c]));

	// Pull rows from two sources of truth:
	//   1. keymap.ts bindings — what the global keydown handler actually
	//      routes. Title is looked up from the command registry.
	//   2. CommandDef.shortcut display strings — covers anything bound by
	//      mechanisms other than the global keymap (e.g. CodeMirror keymap,
	//      internal QuickSwitcher / FileTree handlers exposed for parity).
	// Plus a small static list for shortcuts handled inline in components
	// that don't go through the registry at all.

	const fromKeymap: Row[] = bindings.map((b) => {
		const cmd = commandsById.get(b.commandId);
		return {
			title: cmd?.title ?? b.commandId,
			shortcut: comboToDisplay(b.combo),
			category: cmd?.category ?? 'other'
		};
	});

	const fromCommands: Row[] = listCommands()
		.filter((c) => c.shortcut && !bindings.some((b) => b.commandId === c.id))
		.map((c) => ({
			title: c.title,
			shortcut: c.shortcut!,
			category: c.category ?? 'other'
		}));

	// Shortcuts handled inline in components rather than via the global
	// keymap — listed here so users can discover them. F2 used to be
	// here too but is now properly registered as note.rename in
	// keymap.ts and gets picked up automatically.
	const inline: Row[] = [
		{ title: 'Quick switcher (jump to note)', shortcut: '⌘K', category: 'view' },
		{ title: 'Full-text search',              shortcut: '⌘⇧F', category: 'view' },
		{ title: 'Save note',                     shortcut: '⌘S',  category: 'file' },
		{ title: 'Open wikilink in new tab',      shortcut: '⌘ + click', category: 'navigation' },
		{ title: 'Open wikilink in new pane',     shortcut: '⌥ + click', category: 'navigation' },
		{ title: 'Close tab via middle-click',    shortcut: 'middle-click', category: 'tabs' }
	];

	const all = $derived([...fromKeymap, ...fromCommands, ...inline]);

	const grouped = $derived.by<Map<string, Row[]>>(() => {
		const m = new Map<string, Row[]>();
		for (const r of all) {
			const list = m.get(r.category) ?? [];
			list.push(r);
			m.set(r.category, list);
		}
		// Stable in-group ordering by title.
		for (const v of m.values()) v.sort((a, b) => a.title.localeCompare(b.title));
		return m;
	});

	const labels: Record<string, string> = {
		view: 'View',
		file: 'File',
		tabs: 'Tabs',
		navigation: 'Navigation',
		other: 'Other'
	};
	const order = ['view', 'file', 'tabs', 'navigation', 'other'];
</script>

<div class="shortcuts">
	<header class="head">
		<h1>Keyboard shortcuts</h1>
		<span class="hint">All bindings are global except where noted. Source of truth: <code class="mono">src/lib/commands/keymap.ts</code>.</span>
	</header>

	{#each order as cat (cat)}
		{#if grouped.get(cat)}
			<section class="group">
				<h2>{labels[cat] ?? cat}</h2>
				<ul class="rows">
					{#each grouped.get(cat) ?? [] as row (row.title + row.shortcut)}
						<li class="row">
							<span class="title">{row.title}</span>
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
	.title { color: var(--fg); flex: 1; min-width: 0; }
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
