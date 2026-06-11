<script lang="ts">
	import type { NoteDoc } from '$lib/types';
	import type { RegisteredRightPanel } from '$lib/plugins/extensions.svelte';

	interface Props {
		vaultId: string;
		doc: NoteDoc;
		panel: RegisteredRightPanel;
	}

	let { vaultId, doc, panel }: Props = $props();
	let host = $state<HTMLElement | null>(null);
	let error = $state<string | null>(null);

	$effect(() => {
		if (!host) return;
		let disposed = false;
		let cleanup: (() => void) | null = null;
		error = null;
		host.replaceChildren();

		function applyCleanup(fn: (() => void) | void): void {
			if (typeof fn !== 'function') return;
			if (disposed) {
				try { fn(); } catch (e) { console.error(`[plugin:${panel.pluginId}] right panel cleanup failed:`, e); }
				return;
			}
			cleanup = fn;
		}

		try {
			const result = panel.render(host, {
				vaultId,
				pluginId: panel.pluginId,
				extensionId: panel.localId,
				panelId: panel.localId,
				doc
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
				try { cleanup(); } catch (e) { console.error(`[plugin:${panel.pluginId}] right panel cleanup failed:`, e); }
			}
			host?.replaceChildren();
		};
	});
</script>

<section class="plugin-panel">
	<h3>{panel.title}</h3>
	{#if panel.description}
		<p class="description">{panel.description}</p>
	{/if}
	<div class="plugin-panel-host" bind:this={host}></div>
	{#if error}
		<p class="err">Plugin panel failed: {error}</p>
	{/if}
</section>

<style>
	.plugin-panel {
		font-size: 0.85rem;
	}
	h3 {
		margin: 0 0 8px;
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--fg-dim);
		font-weight: 600;
	}
	.description {
		color: var(--fg-dim);
		font-size: 0.82rem;
		margin: 0 0 8px;
	}
	.plugin-panel-host {
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		padding: 10px;
		color: var(--fg-muted);
	}
	.err {
		color: var(--danger);
		font-size: 0.82rem;
		margin: 8px 0 0;
	}
</style>
