<script lang="ts">
	import type { VaultImportAnalysis } from '$lib/types';
	import {
		checkLevelClass,
		checkLevelLabel,
		compactPathList,
		importReadiness,
		importSummary,
		obsidianPluginSummary
	} from '$lib/import/checklist';

	interface Props {
		analysis: VaultImportAnalysis;
	}

	let { analysis }: Props = $props();
	const readiness = $derived(importReadiness(analysis));
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

	{#if analysis.obsidianPlugins.length > 0}
		<div class="note">
			<span class="note-label">Obsidian plugin settings</span>
			<span class="mono">{obsidianPluginSummary(analysis.obsidianPlugins, 3)}</span>
		</div>
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
	}
</style>
