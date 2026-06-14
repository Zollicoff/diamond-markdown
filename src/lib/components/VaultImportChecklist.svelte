<script lang="ts">
	import type { VaultImportAnalysis } from '$lib/types';
	import {
		checkLevelClass,
		checkLevelLabel,
		compactPathList,
		importReadiness,
		importSummary,
		obsidianAppConfigSummary,
		obsidianAppearanceSummary,
		obsidianBookmarksSummary,
		obsidianCorePluginsSummary,
		obsidianDailyNotesSummary,
		obsidianGraphSummary,
		obsidianHotkeysSummary,
		obsidianTemplatesSummary,
		obsidianPluginMigrationNotes,
		obsidianPluginSummary
	} from '$lib/import/checklist';
	import ImportSettingsSection from './import/ImportSettingsSection.svelte';

	interface Props {
		analysis: VaultImportAnalysis;
	}

	let { analysis }: Props = $props();
	const readiness = $derived(importReadiness(analysis));
	const pluginMigrationNotes = $derived(obsidianPluginMigrationNotes(analysis.obsidianPlugins));
</script>

<div class="import-card">
	<div class="import-head">
		<div>
			<div class="import-title">Import readiness</div>
			<div class="import-path mono" title={analysis.path}>{analysis.path}</div>
		</div>
		<div class={`readiness ${readiness.level}`}>
			<span>{readiness.label}</span>
			<span class="mono">{importSummary(analysis)}</span>
		</div>
	</div>

	<ul class="checklist">
		{#each analysis.checklist as check (check.id)}
			<li class={checkLevelClass(check)}>
				<span class="badge">{checkLevelLabel(check.level)}</span>
				<div>
					<div class="check-label">{check.label}</div>
					<div class="check-detail">{check.detail}</div>
				</div>
			</li>
		{/each}
	</ul>

	{#if analysis.recommendedExcludedFolders.length > 0}
		<div class="note">
			<span class="note-label">Recommended excludes</span>
			<span class="mono">{compactPathList(analysis.recommendedExcludedFolders)}</span>
		</div>
	{/if}

	{#if analysis.markdownExamples.length > 0}
		<div class="note">
			<span class="note-label">Sample notes</span>
			<span class="mono">{compactPathList(analysis.markdownExamples, 3)}</span>
		</div>
	{/if}

	{#if analysis.canvasExamples.length > 0}
		<div class="note">
			<span class="note-label">Canvas files</span>
			<span class="mono">{compactPathList(analysis.canvasExamples, 3)}</span>
		</div>
	{/if}

	{#if analysis.obsidianAppConfig.status !== 'missing'}
		<ImportSettingsSection
			label="Obsidian app config"
			summary={obsidianAppConfigSummary(analysis.obsidianAppConfig)}
			path={analysis.obsidianAppConfig.path}
			settings={analysis.obsidianAppConfig.settings}
			ariaLabel="Obsidian app config settings"
		/>
	{/if}

	{#if analysis.obsidianDailyNotes.status !== 'missing'}
		<ImportSettingsSection
			label="Obsidian Daily Notes"
			summary={obsidianDailyNotesSummary(analysis.obsidianDailyNotes)}
			path={analysis.obsidianDailyNotes.path}
			settings={analysis.obsidianDailyNotes.settings}
			ariaLabel="Obsidian Daily Notes settings"
		/>
	{/if}

	{#if analysis.obsidianTemplates.status !== 'missing'}
		<ImportSettingsSection
			label="Obsidian Templates"
			summary={obsidianTemplatesSummary(analysis.obsidianTemplates)}
			path={analysis.obsidianTemplates.path}
			settings={analysis.obsidianTemplates.settings}
			ariaLabel="Obsidian Templates settings"
		/>
	{/if}

	{#if analysis.obsidianAppearance.status !== 'missing' || analysis.obsidianAppearance.snippetFiles.length > 0}
		<ImportSettingsSection
			label="Obsidian Appearance"
			summary={obsidianAppearanceSummary(analysis.obsidianAppearance)}
			path={analysis.obsidianAppearance.path}
			settings={analysis.obsidianAppearance.settings}
			ariaLabel="Obsidian Appearance settings"
		/>
	{/if}

	{#if analysis.obsidianGraph.status !== 'missing'}
		<ImportSettingsSection
			label="Obsidian Graph"
			summary={obsidianGraphSummary(analysis.obsidianGraph)}
			path={analysis.obsidianGraph.path}
			settings={analysis.obsidianGraph.settings}
			ariaLabel="Obsidian Graph settings"
		/>
	{/if}

	{#if analysis.obsidianCorePlugins.status !== 'missing'}
		<div class="note">
			<span class="note-label">Obsidian core plugins</span>
			<span>{obsidianCorePluginsSummary(analysis.obsidianCorePlugins)}</span>
			{#if analysis.obsidianCorePlugins.path}
				<span class="mono">{analysis.obsidianCorePlugins.path}</span>
			{/if}
		</div>
		{#if analysis.obsidianCorePlugins.entries.length > 0}
			<ul class="config-settings" aria-label="Obsidian core plugin migration guidance">
				{#each analysis.obsidianCorePlugins.entries as plugin (plugin.id)}
					<li class={`config-row ${plugin.level}`}>
						<div class="config-main">
							<div>
								<div class="config-name">{plugin.label}</div>
								<div class="config-detail">{plugin.detail}</div>
							</div>
							<span class="config-value mono">{plugin.support}</span>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}

	{#if analysis.obsidianHotkeys.status !== 'missing'}
		<div class="note">
			<span class="note-label">Obsidian hotkeys</span>
			<span>{obsidianHotkeysSummary(analysis.obsidianHotkeys)}</span>
			{#if analysis.obsidianHotkeys.path}
				<span class="mono">{analysis.obsidianHotkeys.path}</span>
			{/if}
			{#if analysis.obsidianHotkeys.omittedCommands > 0}
				<span>{analysis.obsidianHotkeys.omittedCommands} more command{analysis.obsidianHotkeys.omittedCommands === 1 ? '' : 's'} omitted from preview.</span>
			{/if}
		</div>
		{#if analysis.obsidianHotkeys.commands.length > 0}
			<ul class="config-settings" aria-label="Obsidian hotkey migration guidance">
				{#each analysis.obsidianHotkeys.commands as command (command.commandId)}
					<li class="config-row info">
						<div class="config-main">
							<div>
								<div class="config-name">{command.commandId}</div>
								<div class="config-detail">
									{command.detail}
									{#if command.diamondCommandTitle}
										<span class="mono">Diamond: {command.diamondCommandTitle}</span>
									{/if}
								</div>
							</div>
							<span class="config-value mono">{command.support}: {compactPathList(command.bindings, 2)}</span>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}

	{#if analysis.obsidianBookmarks.status !== 'missing'}
		<div class="note">
			<span class="note-label">Obsidian bookmarks</span>
			<span>{obsidianBookmarksSummary(analysis.obsidianBookmarks)}</span>
			{#if analysis.obsidianBookmarks.path}
				<span class="mono">{analysis.obsidianBookmarks.path}</span>
			{/if}
			{#if analysis.obsidianBookmarks.paths.length > 0}
				<span class="mono">{compactPathList(analysis.obsidianBookmarks.paths, 4)}</span>
			{/if}
		</div>
	{/if}

	{#if analysis.obsidianPlugins.length > 0}
		<div class="note">
			<span class="note-label">Obsidian plugin settings</span>
			<span>Preserved read-only. Diamond will not execute Obsidian community plugins.</span>
			<span class="mono">{obsidianPluginSummary(analysis.obsidianPlugins, 3)}</span>
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

	{#if analysis.warnings.length > 0}
		<ul class="warnings">
			{#each analysis.warnings as warning}
				<li>{warning}</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.import-card {
		display: grid;
		gap: 10px;
		border-top: 1px solid var(--border);
		padding-top: 10px;
	}
	.import-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}
	.import-title {
		color: var(--fg);
		font-size: 0.88rem;
		font-weight: 700;
	}
	.import-path {
		max-width: 460px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--fg-dim);
		font-size: 0.72rem;
		margin-top: 2px;
	}
	.readiness {
		display: grid;
		gap: 2px;
		text-align: right;
		color: var(--fg-muted);
		font-size: 0.78rem;
		white-space: nowrap;
	}
	.readiness.ok { color: var(--success); }
	.readiness.info { color: var(--accent); }
	.readiness.warn { color: var(--danger); }
	.checklist,
	.warnings {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 6px;
	}
	.check {
		display: grid;
		grid-template-columns: 48px minmax(0, 1fr);
		gap: 8px;
		align-items: start;
		padding: 6px 0;
	}
	.check + .check {
		border-top: 1px solid color-mix(in srgb, var(--border), transparent 35%);
	}
	.badge {
		border: 1px solid var(--border);
		border-radius: 999px;
		color: var(--fg-muted);
		font-size: 0.66rem;
		font-weight: 700;
		text-align: center;
		text-transform: uppercase;
		padding: 2px 5px;
	}
	.check.ok .badge { color: var(--success); }
	.check.info .badge { color: var(--accent); }
	.check.warn .badge { color: var(--danger); }
	.check-label {
		color: var(--fg);
		font-size: 0.82rem;
		font-weight: 700;
	}
	.check-detail {
		color: var(--fg-dim);
		font-size: 0.76rem;
		line-height: 1.35;
		margin-top: 2px;
	}
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
	.config-settings {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0;
		border-top: 1px solid color-mix(in srgb, var(--border), transparent 35%);
	}
	.config-row {
		display: grid;
		gap: 5px;
		padding: 8px 0;
		border-bottom: 1px solid color-mix(in srgb, var(--border), transparent 35%);
	}
	.config-row.warn {
		color: var(--danger);
	}
	.config-main {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		align-items: flex-start;
	}
	.config-name {
		color: var(--fg);
		font-size: 0.78rem;
		font-weight: 700;
	}
	.config-row.warn .config-name,
	.config-row.warn .config-detail {
		color: var(--danger);
	}
	.config-detail,
	.config-value {
		color: var(--fg-dim);
		font-size: 0.72rem;
		line-height: 1.35;
	}
	.config-value {
		max-width: 220px;
		overflow: hidden;
		text-align: right;
		text-overflow: ellipsis;
		white-space: nowrap;
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
	.warnings li {
		color: var(--danger);
		font-size: 0.76rem;
	}
	.mono { font-family: var(--mono); }

	@media (max-width: 760px) {
		.import-head {
			flex-direction: column;
		}
		.readiness {
			text-align: left;
			white-space: normal;
		}
		.import-path {
			max-width: 100%;
		}
		.plugin-main {
			display: grid;
		}
		.plugin-states {
			justify-content: flex-start;
			min-width: 0;
		}
		.config-main {
			display: grid;
		}
		.config-value {
			max-width: 100%;
			text-align: left;
		}
	}
</style>
