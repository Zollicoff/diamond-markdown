<script lang="ts">
	import {
		obsidianPluginMigrationNotes,
		obsidianPluginSummary
	} from '$lib/import/checklist';
	import type { ObsidianPluginInfo } from '$lib/types';

	interface Props {
		plugins: ObsidianPluginInfo[];
	}

	let { plugins }: Props = $props();
	const pluginMigrationNotes = $derived(obsidianPluginMigrationNotes(plugins));
</script>

{#if plugins.length > 0}
	<div class="note">
		<span class="note-label">Obsidian plugin settings</span>
		<span>Preserved read-only. Diamond will not execute Obsidian community plugins.</span>
		<span class="mono">{obsidianPluginSummary(plugins, 3)}</span>
	</div>
	<ul class="plugin-migration" aria-label="Obsidian plugin migration guidance">
		{#each pluginMigrationNotes as plugin (plugin.folder)}
			<li class={`plugin-row ${plugin.level}`}>
				<div class="plugin-main">
					<div>
						<div class="plugin-name">{plugin.name}</div>
						<div class="plugin-detail mono">{plugin.detail}</div>
					</div>
					<div class="plugin-states">
						<span>{plugin.enabledLabel}</span>
						<span>{plugin.manifestLabel}</span>
						<span>{plugin.settingsLabel}</span>
					</div>
				</div>
				{#if plugin.keySummary}
					<div class="plugin-keys mono">{plugin.keySummary}</div>
				{/if}
				<div class="plugin-action">{plugin.action}</div>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.note {
		display: grid;
		gap: 3px;
		color: var(--fg-dim);
		font-size: 0.76rem;
	}
	.note-label {
		color: var(--fg-muted);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.plugin-migration {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0;
		border-top: 1px solid color-mix(in srgb, var(--border), transparent 35%);
	}
	.plugin-row {
		display: grid;
		gap: 5px;
		padding: 8px 0;
		border-bottom: 1px solid color-mix(in srgb, var(--border), transparent 35%);
	}
	.plugin-row.warn {
		color: var(--danger);
	}
	.plugin-main {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		align-items: flex-start;
	}
	.plugin-name {
		color: var(--fg);
		font-size: 0.78rem;
		font-weight: 700;
	}
	.plugin-detail,
	.plugin-keys,
	.plugin-action {
		color: var(--fg-dim);
		font-size: 0.72rem;
		line-height: 1.35;
	}
	.plugin-row.warn .plugin-name,
	.plugin-row.warn .plugin-action {
		color: var(--danger);
	}
	.plugin-states {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 4px;
		min-width: 180px;
	}
	.plugin-states span {
		border: 1px solid var(--border);
		border-radius: 999px;
		color: var(--fg-muted);
		font-size: 0.64rem;
		font-weight: 700;
		line-height: 1;
		padding: 4px 6px;
		white-space: nowrap;
	}
	.mono { font-family: var(--mono); }

	@media (max-width: 760px) {
		.plugin-main {
			display: grid;
		}
		.plugin-states {
			justify-content: flex-start;
			min-width: 0;
		}
	}
</style>
