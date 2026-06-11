<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/vault-api';
	import type { PluginDescriptor } from '$lib/plugins/types';

	interface Props {
		vaultId: string;
	}

	let { vaultId }: Props = $props();
	let plugins = $state<PluginDescriptor[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	async function load(): Promise<void> {
		loading = true;
		error = null;
		try {
			const res = await api.plugins(vaultId);
			plugins = res.plugins;
		} catch (e) {
			error = (e as Error).message;
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void load();
	});
</script>

<section class="group">
	<h2>Plugins</h2>
	<p class="group-hint">
		Vault plugins live in <span class="mono">.diamondmd/plugins/&lt;plugin-id&gt;/</span>
		with a <span class="mono">plugin.json</span> manifest and ESM entry module.
	</p>

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
						<span class="plugin-state">{plugin.enabled ? 'Valid' : 'Invalid'}</span>
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
</section>

<style>
	.group {
		margin-bottom: 28px;
		padding-bottom: 20px;
		border-bottom: 1px solid var(--border);
	}
	.group h2 {
		font-family: 'Bricolage Grotesque', var(--sans);
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--fg-muted);
		margin: 0 0 14px;
	}
	.group-hint {
		color: var(--fg-dim);
		font-size: 0.85rem;
		margin: -8px 0 14px;
	}
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
