<script lang="ts">
	import type { EditorApi } from '$lib/editor/commands';

	interface Props {
		api: EditorApi | null;
	}

	let { api }: Props = $props();

	function act(fn: (api: EditorApi) => void): void {
		if (!api) return;
		fn(api);
	}

	interface Btn { icon: string; title: string; action: (a: EditorApi) => void; }

	const groups: Btn[][] = [
		[
			{ icon: 'B',     title: 'Bold (⌘B)',        action: (a) => a.wrap('**') },
			{ icon: 'I',     title: 'Italic (⌘I)',      action: (a) => a.wrap('*') },
			{ icon: 'S',     title: 'Strikethrough',    action: (a) => a.wrap('~~') },
			{ icon: '<>',    title: 'Inline code',      action: (a) => a.wrap('`') }
		],
		[
			{ icon: 'H1',    title: 'Heading 1',        action: (a) => a.toggleHeading(1) },
			{ icon: 'H2',    title: 'Heading 2',        action: (a) => a.toggleHeading(2) },
			{ icon: 'H3',    title: 'Heading 3',        action: (a) => a.toggleHeading(3) }
		],
		[
			{ icon: '•',     title: 'Bullet list',      action: (a) => a.prependLines('- ') },
			{ icon: '1.',    title: 'Numbered list',    action: (a) => a.prependLines('1. ') },
			{ icon: '☐',     title: 'Task list',        action: (a) => a.prependLines('- [ ] ') },
			{ icon: '❝',     title: 'Quote',            action: (a) => a.prependLines('> ') }
		],
		[
			{ icon: '[[ ]]', title: 'Wikilink',         action: (a) => a.insertWikilink() },
			{ icon: '{ }',   title: 'Code block',       action: (a) => a.insertCodeBlock() }
		]
	];
</script>

<div class="toolbar" role="toolbar" aria-label="Formatting">
	{#each groups as grp, gi}
		<div class="group">
			{#each grp as b}
				<button
					class="t-btn"
					title={b.title}
					aria-label={b.title}
					disabled={!api}
					onclick={() => act(b.action)}
				>{b.icon}</button>
			{/each}
		</div>
		{#if gi < groups.length - 1}<div class="sep"></div>{/if}
	{/each}
</div>

<style>
	.toolbar {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		background: var(--bg-elev);
		border-bottom: 1px solid var(--border);
		flex-wrap: wrap;
	}
	.group { display: flex; gap: 2px; }
	.sep { width: 1px; height: 20px; background: var(--border); margin: 0 2px; }
	.t-btn {
		background: transparent;
		border: 1px solid transparent;
		color: var(--fg-muted);
		padding: 3px 9px;
		border-radius: 5px;
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		min-width: 26px;
		font-family: var(--sans);
		font-variant-numeric: tabular-nums;
	}
	.t-btn:hover:not(:disabled) {
		background: var(--bg-hover);
		color: var(--fg);
		border-color: var(--border);
	}
	.t-btn:active:not(:disabled) { background: var(--accent-soft); color: var(--accent); }
	.t-btn:disabled { opacity: 0.35; cursor: default; }
</style>
