<script lang="ts">
	import type { PluginCatalogItem } from '$lib/plugins/types';
	import { catalogInstallAction, pluginExecutionLabel } from '$lib/plugins/panel';

	interface Props {
		catalog: PluginCatalogItem[];
		catalogLoading: boolean;
		installedIds: Set<string>;
		replaceExisting: boolean;
		installing: boolean;
		installingCatalogId: string | null;
		onInstallCatalog: (plugin: PluginCatalogItem) => Promise<void>;
	}

	let {
		catalog,
		catalogLoading,
		installedIds,
		replaceExisting,
		installing,
		installingCatalogId,
		onInstallCatalog
	}: Props = $props();
</script>

<div class="catalog">
	<div class="section-head">
		<h3>Plugin catalog</h3>
		<span class="catalog-count">{catalog.length} curated</span>
	</div>
	{#if catalogLoading}
		<div class="empty">Loading catalog…</div>
	{:else if catalog.length === 0}
		<div class="empty">No curated plugins are available.</div>
	{:else}
		<ul class="catalog-list">
			{#each catalog as item (item.id)}
				{@const action = catalogInstallAction(item, installedIds, replaceExisting, installing, installingCatalogId)}
				<li class="catalog-card">
					<div class="plugin-head">
						<div>
							<div class="plugin-title">
								{item.name}
								<span class="plugin-version mono">{item.version}</span>
							</div>
							<div class="plugin-id mono">{item.id}</div>
						</div>
						<div class="plugin-badges">
							<span class="plugin-state">{pluginExecutionLabel(item.execution)}</span>
							{#if action.installed}
								<span class="plugin-state">Installed</span>
							{/if}
						</div>
					</div>
					<p>{item.description}</p>
					<div class="catalog-meta">
						<div class="tag-row">
							{#each item.tags as tag}
								<span class="command-chip mono">{tag}</span>
							{/each}
						</div>
						<button
							type="button"
							aria-label={action.ariaLabel}
							disabled={action.disabled}
							onclick={() => void onInstallCatalog(item)}
						>
							{action.buttonText}
						</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.catalog {
		border: 1px solid var(--border);
		border-radius: 7px;
		background: color-mix(in srgb, var(--bg-elev) 58%, transparent);
		padding: 12px;
		margin-bottom: 12px;
	}
	.section-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin: 0 0 8px;
	}
	.section-head h3 {
		margin: 0;
		color: var(--fg);
		font-size: 0.88rem;
	}
	.catalog-count {
		color: var(--fg-dim);
		font-size: 0.76rem;
	}
	.catalog-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 8px;
	}
	.catalog-card {
		border: 1px solid var(--border);
		border-radius: 7px;
		background: var(--bg);
		padding: 12px;
	}
	.catalog-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-top: 10px;
	}
	.tag-row {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}
	.catalog-meta button {
		border: 1px solid var(--border);
		border-radius: 5px;
		background: var(--accent);
		color: var(--bg);
		font: inherit;
		font-size: 0.78rem;
		font-weight: 700;
		padding: 6px 10px;
		cursor: pointer;
		white-space: nowrap;
	}
	.catalog-meta button:disabled {
		background: var(--bg-elev);
		color: var(--fg-dim);
		opacity: 0.7;
		cursor: default;
	}
	.plugin-head {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		align-items: flex-start;
	}
	.plugin-title {
		color: var(--fg);
		font-size: 0.92rem;
		font-weight: 700;
	}
	.plugin-version {
		color: var(--fg-dim);
		font-size: 0.72rem;
		font-weight: 400;
		margin-left: 6px;
	}
	.plugin-id {
		color: var(--fg-dim);
		font-size: 0.76rem;
		margin-top: 2px;
	}
	.plugin-state {
		border: 1px solid var(--border);
		border-radius: 999px;
		color: var(--fg-muted);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		padding: 3px 7px;
		white-space: nowrap;
	}
	.plugin-badges {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		justify-content: flex-end;
	}
	p {
		color: var(--fg-muted);
		font-size: 0.82rem;
		line-height: 1.45;
		margin: 8px 0;
	}
	.command-chip {
		border: 1px solid var(--border);
		border-radius: 4px;
		color: var(--fg-muted);
		font-size: 0.72rem;
		padding: 2px 6px;
	}
	.empty {
		color: var(--fg-dim);
		font-size: 0.85rem;
		font-style: italic;
		padding: 12px 4px;
	}
	.mono { font-family: var(--mono); }
</style>
