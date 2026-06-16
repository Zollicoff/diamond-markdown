<script lang="ts">
	import { manifestInstallDisabled } from '$lib/plugins/panel';

	interface Props {
		installing: boolean;
		installMessage: string | null;
		replaceExisting: boolean;
		onReplaceExistingChange: (replaceExisting: boolean) => void;
		onInstall: (manifestUrl: string) => Promise<boolean>;
	}

	let {
		installing,
		installMessage,
		replaceExisting,
		onReplaceExistingChange,
		onInstall
	}: Props = $props();

	let installUrl = $state('');
	const installDisabled = $derived(manifestInstallDisabled(installUrl, installing));

	async function submit(): Promise<void> {
		if (installDisabled) return;
		const installed = await onInstall(installUrl);
		if (installed) installUrl = '';
	}
</script>

<form class="installer" onsubmit={(e) => { e.preventDefault(); void submit(); }}>
	<label for="plugin-manifest-url">Install from manifest URL</label>
	<div class="install-row">
		<input
			id="plugin-manifest-url"
			type="url"
			bind:value={installUrl}
			placeholder="https://example.com/plugin.json"
			spellcheck="false"
			autocomplete="off"
		/>
		<button type="submit" disabled={installDisabled}>
			{installing ? 'Installing...' : 'Install'}
		</button>
	</div>
	<label class="check">
		<input
			type="checkbox"
			checked={replaceExisting}
			onchange={(e) => onReplaceExistingChange((e.currentTarget as HTMLInputElement).checked)}
		/>
		<span>Replace existing plugin with the same id</span>
	</label>
	{#if installMessage}
		<div class="ok">{installMessage}</div>
	{/if}
</form>

<style>
	.installer {
		display: grid;
		gap: 8px;
		border: 1px solid var(--border);
		border-radius: 7px;
		background: color-mix(in srgb, var(--bg-elev) 76%, transparent);
		padding: 12px;
		margin-bottom: 12px;
	}
	.installer > label:first-child {
		color: var(--fg);
		font-size: 0.84rem;
		font-weight: 700;
	}
	.install-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 8px;
	}
	input[type='url'] {
		width: 100%;
		box-sizing: border-box;
		border: 1px solid var(--border);
		border-radius: 5px;
		background: var(--bg);
		color: var(--fg);
		font: inherit;
		font-size: 0.84rem;
		padding: 7px 9px;
	}
	.install-row button {
		border: 1px solid var(--border);
		border-radius: 5px;
		background: var(--accent);
		color: var(--bg);
		font: inherit;
		font-size: 0.82rem;
		font-weight: 700;
		padding: 7px 12px;
		cursor: pointer;
	}
	.install-row button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.check {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		color: var(--fg-dim);
		font-size: 0.78rem;
	}
	.check input { accent-color: var(--accent); }
	.ok {
		color: var(--success);
		font-size: 0.82rem;
	}
</style>
