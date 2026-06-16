<script lang="ts">
	import { onDestroy } from 'svelte';
	import { notify } from '$lib/dialogs';
	import {
		gitSyncCommandCopyLabel,
		gitSyncCommandCopyTone,
		type GitSyncCommandCopyState
	} from '$lib/sync/command-block';

	interface Props {
		commands: string;
	}

	let { commands }: Props = $props();
	let copyState = $state<GitSyncCommandCopyState>('idle');
	let resetTimer: ReturnType<typeof setTimeout> | null = null;

	const copyLabel = $derived(gitSyncCommandCopyLabel(copyState));
	const copyTone = $derived(gitSyncCommandCopyTone(copyState));

	function scheduleReset(): void {
		if (resetTimer) clearTimeout(resetTimer);
		resetTimer = setTimeout(() => {
			copyState = 'idle';
			resetTimer = null;
		}, 1800);
	}

	async function copyCommands(): Promise<void> {
		if (!commands.trim()) return;
		try {
			if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
			await navigator.clipboard.writeText(commands);
			copyState = 'copied';
			notify({ title: 'Git commands copied', tone: 'success' });
		} catch {
			copyState = 'failed';
			notify({ title: 'Could not copy commands', tone: 'danger' });
		}
		scheduleReset();
	}

	$effect(() => {
		commands;
		copyState = 'idle';
	});

	onDestroy(() => {
		if (resetTimer) clearTimeout(resetTimer);
	});
</script>

{#if commands}
	<div class="command-wrap" class:success={copyTone === 'success'} class:danger={copyTone === 'danger'}>
		<div class="command-head">
			<span>Recovery commands</span>
			<button
				type="button"
				class="copy-btn"
				class:success={copyTone === 'success'}
				class:danger={copyTone === 'danger'}
				aria-label="Copy git recovery commands"
				aria-live="polite"
				onclick={copyCommands}
			>{copyLabel}</button>
		</div>
		<pre class="command-block mono"><code>{commands}</code></pre>
	</div>
{/if}

<style>
	.command-wrap {
		margin: 10px 0;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg-elev);
		overflow: hidden;
	}
	.command-wrap.success {
		border-color: color-mix(in srgb, var(--success) 55%, var(--border));
	}
	.command-wrap.danger {
		border-color: color-mix(in srgb, var(--danger) 55%, var(--border));
	}
	.command-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 7px 8px 6px 10px;
		border-bottom: 1px solid var(--border);
		color: var(--fg-muted);
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.copy-btn {
		flex: none;
		border: 1px solid var(--border);
		border-radius: 5px;
		background: var(--bg);
		color: var(--fg);
		font: inherit;
		font-size: 0.68rem;
		text-transform: none;
		letter-spacing: 0;
		padding: 4px 7px;
		cursor: pointer;
	}
	.copy-btn:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	.copy-btn.success {
		border-color: color-mix(in srgb, var(--success) 70%, var(--border));
		color: var(--success);
	}
	.copy-btn.danger {
		border-color: color-mix(in srgb, var(--danger) 70%, var(--border));
		color: var(--danger);
	}
	.command-block {
		margin: 0;
		padding: 9px 10px;
		border: 0;
		background: transparent;
		color: var(--fg);
		font-size: 0.72rem;
		line-height: 1.45;
		overflow-x: auto;
		white-space: pre;
	}
	.mono { font-family: var(--mono); }
</style>
