<script lang="ts">
	import type { VaultImportCheckLevel } from '$lib/types';

	interface ImportSettingRow {
		id: string;
		label: string;
		value: string;
		detail: string;
		level: VaultImportCheckLevel;
	}

	interface Props {
		label: string;
		summary: string;
		path?: string;
		settings: ImportSettingRow[];
		ariaLabel: string;
	}

	let { label, summary, path, settings, ariaLabel }: Props = $props();
</script>

<div class="note">
	<span class="note-label">{label}</span>
	<span>{summary}</span>
	{#if path}
		<span class="mono">{path}</span>
	{/if}
</div>
{#if settings.length > 0}
	<ul class="config-settings" aria-label={ariaLabel}>
		{#each settings as setting (setting.id)}
			<li class={`config-row ${setting.level}`}>
				<div class="config-main">
					<div>
						<div class="config-name">{setting.label}</div>
						<div class="config-detail">{setting.detail}</div>
					</div>
					<span class="config-value mono">{setting.value}</span>
				</div>
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
	.mono { font-family: var(--mono); }

	@media (max-width: 760px) {
		.config-main {
			display: grid;
		}
		.config-value {
			max-width: 100%;
			text-align: left;
		}
	}
</style>
