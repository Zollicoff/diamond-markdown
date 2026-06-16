<script lang="ts">
	import { compactPathList, obsidianHotkeysSummary } from '$lib/import/checklist';
	import type { ObsidianHotkeysInfo } from '$lib/types';

	interface Props {
		hotkeys: ObsidianHotkeysInfo;
	}

	let { hotkeys }: Props = $props();
</script>

{#if hotkeys.status !== 'missing'}
	<div class="note">
		<span class="note-label">Obsidian hotkeys</span>
		<span>{obsidianHotkeysSummary(hotkeys)}</span>
		{#if hotkeys.path}
			<span class="mono">{hotkeys.path}</span>
		{/if}
		{#if hotkeys.omittedCommands > 0}
			<span>{hotkeys.omittedCommands} more command{hotkeys.omittedCommands === 1 ? '' : 's'} omitted from preview.</span>
		{/if}
	</div>
	{#if hotkeys.commands.length > 0}
		<ul class="config-settings" aria-label="Obsidian hotkey migration guidance">
			{#each hotkeys.commands as command (command.commandId)}
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
