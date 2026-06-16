<script lang="ts">
	import type { RegisteredSettingsPanel } from '$lib/plugins/extensions.svelte';
	import PluginIframePanel from '$lib/components/plugins/PluginIframePanel.svelte';

	interface Props {
		vaultId: string;
		panel: RegisteredSettingsPanel;
	}

	let { vaultId, panel }: Props = $props();
	let host = $state<HTMLElement | null>(null);
	let error = $state<string | null>(null);

	$effect(() => {
		if (!host) return;
		if (panel.mode !== 'dom') return;
		let disposed = false;
		let cleanup: (() => void) | null = null;
		error = null;
		host.replaceChildren();

		function applyCleanup(fn: (() => void) | void): void {
			if (typeof fn !== 'function') return;
			if (disposed) {
				try { fn(); } catch (e) { console.error(`[plugin:${panel.pluginId}] settings cleanup failed:`, e); }
				return;
			}
			cleanup = fn;
		}

		try {
			const result = panel.render(host, {
				vaultId,
				pluginId: panel.pluginId,
				extensionId: panel.localId,
				panelId: panel.localId
			});
			if (result && typeof (result as Promise<void | (() => void)>).then === 'function') {
				void (result as Promise<void | (() => void)>)
					.then(applyCleanup)
					.catch((e) => {
						if (!disposed) error = (e as Error).message;
					});
			} else {
				applyCleanup(result as void | (() => void));
			}
		} catch (e) {
			error = (e as Error).message;
		}

		return () => {
			disposed = true;
			if (cleanup) {
				try { cleanup(); } catch (e) { console.error(`[plugin:${panel.pluginId}] settings cleanup failed:`, e); }
			}
			host?.replaceChildren();
		};
	});
</script>

<section class="group plugin-settings">
	<h2>{panel.title}</h2>
	{#if panel.description}
		<p class="group-hint">{panel.description}</p>
	{/if}
	{#if panel.mode === 'iframe'}
		<PluginIframePanel
			title={panel.title}
			html={panel.html}
			height={panel.height}
			context={{
				vaultId,
				pluginId: panel.pluginId,
				extensionId: panel.localId,
				panelId: panel.localId
			}}
		/>
	{:else}
		<div class="plugin-settings-host" bind:this={host}></div>
		{#if error}
			<div class="err">Plugin settings failed: {error}</div>
		{/if}
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
	.plugin-settings-host {
		border: 1px solid var(--border);
		border-radius: 7px;
		background: var(--bg-elev);
		padding: 12px;
	}
	.err {
		color: var(--danger);
		font-size: 0.82rem;
		margin-top: 8px;
	}
</style>
