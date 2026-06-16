<script lang="ts">
	import type { PluginDescriptor } from '$lib/plugins/types';
	import { pluginExecutionLabel, pluginValidityLabel } from '$lib/plugins/panel';

	interface Props {
		plugins: PluginDescriptor[];
		loading: boolean;
		error: string | null;
	}

	let { plugins, loading, error }: Props = $props();
</script>

{#if loading}
	<div class="empty">Loading plugins…</div>
{:else if error}
	<div class="err">{error}</div>
{:else if plugins.length === 0}
	<div class="empty">No vault plugins installed.</div>
{:else}
	<ul class="plugin-list">
		{#each plugins as plugin (plugin.id)}
			<li class="plugin-card" class:disabled={!plugin.enabled}>
				<div class="plugin-head">
					<div>
						<div class="plugin-title">
							{plugin.name}
							<span class="plugin-version mono">{plugin.version}</span>
						</div>
						<div class="plugin-id mono">{plugin.id}</div>
					</div>
					<div class="plugin-badges">
						<span class="plugin-state">{pluginExecutionLabel(plugin.execution)}</span>
						<span class="plugin-state">{pluginValidityLabel(plugin.enabled)}</span>
					</div>
				</div>
				{#if plugin.description}
					<p>{plugin.description}</p>
				{/if}
				{#if plugin.author}
					<div class="plugin-meta">By {plugin.author}</div>
				{/if}
				{#if plugin.error}
					<div class="err">{plugin.error}</div>
				{/if}
				{#if plugin.commands.length > 0}
					<div class="commands">
						<div class="commands-label">Declared commands</div>
						{#each plugin.commands as command (command.id)}
							<span class="command-chip mono">{command.title}</span>
						{/each}
					</div>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<style>
	.plugin-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 8px;
	}
	.plugin-card {
		border: 1px solid var(--border);
		border-radius: 7px;
		background: var(--bg-elev);
		padding: 12px;
	}
	.plugin-card.disabled {
		border-color: color-mix(in srgb, var(--danger) 40%, var(--border));
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
	.plugin-id,
	.plugin-meta {
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
	.commands {
		margin-top: 10px;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}
	.commands-label {
		width: 100%;
		color: var(--fg-dim);
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
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
	.err {
		color: var(--danger);
		font-size: 0.82rem;
		margin-top: 8px;
	}
	.mono { font-family: var(--mono); }
</style>
