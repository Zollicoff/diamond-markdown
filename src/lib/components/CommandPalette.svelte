<script lang="ts">
	import { onMount } from 'svelte';
	import { list, exec, type CommandDef } from '$lib/commands/registry';
	import { on as onBus } from '$lib/events';
	import { activePane, activeTab } from '$lib/workspace/actions';

	interface Props {
		vaultId: string;
	}

	let { vaultId }: Props = $props();

	let open = $state(false);
	let query = $state('');
	let selectedIdx = $state(0);
	let inputEl: HTMLInputElement | null = $state(null);
	let listEl: HTMLUListElement | null = $state(null);

	const all = $derived<CommandDef[]>(open ? list() : []);

	function currentCtx() {
		const pane = activePane();
		const tab = activeTab();
		return {
			vaultId,
			paneId: pane?.id,
			tabId: tab?.id,
			notePath: tab?.kind === 'note' ? tab.path : undefined
		};
	}

	const visible = $derived.by(() => {
		const ctx = currentCtx();
		return all.filter((cmd) => !cmd.when || cmd.when(ctx));
	});

	const results = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return visible.slice().sort(byCategoryThenTitle);
		const tokens = q.split(/\s+/).filter(Boolean);
		const scored: { cmd: CommandDef; score: number }[] = [];
		for (const cmd of visible) {
			const haystack = `${cmd.title} ${cmd.id} ${cmd.category ?? ''}`.toLowerCase();
			let score = 0;
			let matched = true;
			for (const t of tokens) {
				const idx = haystack.indexOf(t);
				if (idx < 0) { matched = false; break; }
				// earlier matches score higher; prefix on title is best
				score += 100 - Math.min(idx, 100);
				if (cmd.title.toLowerCase().startsWith(t)) score += 50;
			}
			if (matched) scored.push({ cmd, score });
		}
		scored.sort((a, b) => b.score - a.score);
		return scored.map((x) => x.cmd);
	});

	function byCategoryThenTitle(a: CommandDef, b: CommandDef): number {
		const ca = a.category ?? 'z';
		const cb = b.category ?? 'z';
		if (ca !== cb) return ca.localeCompare(cb);
		return a.title.localeCompare(b.title);
	}

	function openPalette(): void {
		open = true;
		query = '';
		selectedIdx = 0;
		setTimeout(() => inputEl?.focus(), 0);
	}

	function close(): void {
		open = false;
	}

	async function run(cmd: CommandDef | undefined): Promise<void> {
		if (!cmd) return;
		close();
		const pane = activePane();
		const tab = activeTab();
		await exec(cmd.id, {
			vaultId,
			paneId: pane?.id,
			tabId: tab?.id,
			notePath: tab?.kind === 'note' ? tab.path : undefined
		});
	}

	function handleKey(e: KeyboardEvent): void {
		if (!open) return;
		if (e.key === 'Escape') { close(); return; }
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIdx = Math.min(results.length - 1, selectedIdx + 1);
			scrollSelectedIntoView();
			return;
		}
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIdx = Math.max(0, selectedIdx - 1);
			scrollSelectedIntoView();
			return;
		}
		if (e.key === 'Enter') {
			e.preventDefault();
			void run(results[selectedIdx]);
		}
	}

	function scrollSelectedIntoView(): void {
		const li = listEl?.children[selectedIdx] as HTMLElement | undefined;
		li?.scrollIntoView({ block: 'nearest' });
	}

	$effect(() => {
		void query;
		selectedIdx = 0;
	});

	onMount(() => {
		const offPalette = onBus('palette:open', (e) => {
			if (e.vaultId !== vaultId) return;
			openPalette();
		});
		window.addEventListener('keydown', handleKey);
		return () => {
			offPalette();
			window.removeEventListener('keydown', handleKey);
		};
	});
</script>

{#if open}
	<div class="backdrop" role="dialog" aria-modal="true" onclick={(e) => { if (e.target === e.currentTarget) close(); }}>
		<div class="modal">
			<div class="head">
				<span class="mode">Command</span>
				<input
					bind:this={inputEl}
					bind:value={query}
					placeholder="Run a command…"
					spellcheck="false"
					autocomplete="off"
				/>
			</div>
			<ul class="results" bind:this={listEl}>
				{#each results as cmd, i (cmd.id)}
					<li class:active={i === selectedIdx}>
						<button class="result" onclick={() => run(cmd)} onmouseenter={() => (selectedIdx = i)}>
							<span class="icon">{cmd.icon ?? '›'}</span>
							<span class="title">{cmd.title}</span>
							{#if cmd.category}
								<span class="cat mono">{cmd.category}</span>
							{/if}
							{#if cmd.shortcut}
								<span class="kbd mono">{cmd.shortcut}</span>
							{/if}
						</button>
					</li>
				{/each}
				{#if results.length === 0}
					<li class="empty">No commands match.</li>
				{/if}
			</ul>
			<footer class="hint">
				<kbd>↑</kbd><kbd>↓</kbd> navigate <kbd>⏎</kbd> run <kbd>Esc</kbd> close
			</footer>
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed; inset: 0;
		background: rgba(0,0,0,0.5);
		backdrop-filter: blur(3px);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 10vh;
		z-index: 1000;
	}
	.modal {
		width: min(600px, 94vw);
		background: var(--bg-elev);
		border: 1px solid var(--border-strong);
		border-radius: 12px;
		box-shadow: 0 20px 60px rgba(0,0,0,0.4);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.head {
		display: flex; align-items: center; gap: 10px;
		padding: 12px 14px;
		border-bottom: 1px solid var(--border);
	}
	.mode {
		font-family: var(--mono);
		font-size: 0.72rem;
		color: var(--fg-dim);
		text-transform: uppercase;
		letter-spacing: 0.14em;
	}
	.head input {
		flex: 1;
		background: transparent;
		border: 0; outline: 0;
		font-size: 1rem;
		color: var(--fg);
		font-family: var(--sans);
	}
	.results {
		list-style: none;
		padding: 6px;
		margin: 0;
		max-height: 52vh;
		overflow-y: auto;
	}
	.results li { padding: 0; }
	.result {
		display: flex; align-items: center; gap: 10px;
		width: 100%;
		background: transparent; border: 0;
		padding: 8px 10px;
		border-radius: 6px;
		color: inherit;
		text-align: left;
		cursor: pointer;
		font: inherit;
	}
	.results li.active .result {
		background: var(--bg-hover);
	}
	.icon {
		width: 18px;
		text-align: center;
		color: var(--fg-dim);
		font-size: 0.92rem;
	}
	.title { color: var(--fg); flex: 1; }
	.cat {
		font-size: 0.7rem;
		color: var(--fg-dim);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		padding: 1px 6px;
		border: 1px solid var(--border);
		border-radius: 3px;
	}
	.kbd {
		font-size: 0.78rem;
		color: var(--fg-muted);
	}
	.empty { padding: 20px; text-align: center; color: var(--fg-dim); }
	.hint {
		display: flex; gap: 10px;
		padding: 8px 14px;
		border-top: 1px solid var(--border);
		font-size: 0.78rem;
		color: var(--fg-dim);
	}
	kbd {
		font-family: var(--mono);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 1px 5px;
		margin-right: 2px;
	}
	.mono { font-family: var(--mono); }
</style>
