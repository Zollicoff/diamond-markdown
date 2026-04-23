<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	interface Props {
		vaultId: string;
	}

	let { vaultId }: Props = $props();

	let open = $state(false);
	let query = $state('');
	let results = $state<{ path: string; title: string; snippet?: string }[]>([]);
	let fullText = $state(false);
	let selectedIdx = $state(0);
	let inputEl: HTMLInputElement | null = $state(null);
	let controller: AbortController | null = null;

	function handleKey(e: KeyboardEvent): void {
		const mod = e.metaKey || e.ctrlKey;
		if (mod && e.key === 'k' && !e.shiftKey) {
			e.preventDefault();
			open = true;
			fullText = false;
			query = '';
			selectedIdx = 0;
			results = [];
			setTimeout(() => inputEl?.focus(), 0);
			return;
		}
		if (mod && e.key === 'F' && e.shiftKey) {
			e.preventDefault();
			open = true;
			fullText = true;
			query = '';
			selectedIdx = 0;
			results = [];
			setTimeout(() => inputEl?.focus(), 0);
			return;
		}
		if (open && e.key === 'Escape') {
			open = false;
			return;
		}
		if (open && e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIdx = Math.min(results.length - 1, selectedIdx + 1);
			return;
		}
		if (open && e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIdx = Math.max(0, selectedIdx - 1);
			return;
		}
		if (open && e.key === 'Enter') {
			e.preventDefault();
			pick(results[selectedIdx]);
		}
	}

	onMount(() => {
		window.addEventListener('keydown', handleKey);
		return () => window.removeEventListener('keydown', handleKey);
	});

	async function runSearch(): Promise<void> {
		controller?.abort();
		if (!query.trim()) { results = []; return; }
		controller = new AbortController();
		try {
			const url = `/api/vaults/${vaultId}/search?q=${encodeURIComponent(query)}${fullText ? '&full=1' : ''}`;
			const res = await fetch(url, { signal: controller.signal });
			if (!res.ok) return;
			const data = await res.json();
			results = data.results ?? [];
			selectedIdx = 0;
		} catch (e) {
			if ((e as Error).name !== 'AbortError') console.error(e);
		}
	}

	function pick(r: { path: string } | undefined): void {
		if (!r) return;
		open = false;
		goto(`/vault/${vaultId}/note/${encodeURI(r.path)}`);
	}

	$effect(() => { void query; runSearch(); });
</script>

{#if open}
	<div class="backdrop" role="dialog" aria-modal="true" onclick={(e) => { if (e.target === e.currentTarget) open = false; }}>
		<div class="modal">
			<div class="head">
				<span class="mode">{fullText ? 'Search' : 'Go to'}</span>
				<input
					bind:this={inputEl}
					bind:value={query}
					placeholder={fullText ? 'Full-text search…' : 'Jump to note by title or alias…'}
					spellcheck="false"
					autocomplete="off"
				/>
			</div>
			<ul class="results">
				{#each results as r, i}
					<li class:active={i === selectedIdx}>
						<button class="result" onclick={() => pick(r)} onmouseenter={() => (selectedIdx = i)}>
							<span class="title">{r.title}</span>
							<span class="path">{r.path}</span>
							{#if r.snippet}
								<span class="snippet">{r.snippet}</span>
							{/if}
						</button>
					</li>
				{/each}
				{#if results.length === 0 && query.trim()}
					<li class="empty">No matches.</li>
				{/if}
			</ul>
			<footer class="hint">
				<kbd>↑</kbd><kbd>↓</kbd> navigate <kbd>⏎</kbd> open <kbd>Esc</kbd> close
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
		display: flex; flex-direction: column; gap: 2px;
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
	.title { color: var(--fg); font-weight: 500; }
	.path { color: var(--fg-dim); font-size: 0.78rem; font-family: var(--mono); }
	.snippet { color: var(--fg-muted); font-size: 0.82rem; margin-top: 4px; }
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
</style>
