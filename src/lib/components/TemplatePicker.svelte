<script lang="ts">
	import { onMount } from 'svelte';
	import { on as onBus, emit } from '$lib/events';

	interface Props {
		vaultId: string;
	}

	let { vaultId }: Props = $props();

	interface Template { name: string; path: string; }

	let open = $state(false);
	let query = $state('');
	let all = $state<Template[]>([]);
	let selectedIdx = $state(0);
	let inputEl: HTMLInputElement | null = $state(null);
	let activeNoteTitle: string = '';

	const filtered = $derived.by<Template[]>(() => {
		const q = query.trim().toLowerCase();
		if (!q) return all;
		return all.filter((t) => t.name.toLowerCase().includes(q));
	});

	onMount(() => {
		const offs = [
			onBus('palette:template-pick', (e) => {
				if (e.vaultId !== vaultId) return;
				activeNoteTitle = e.activeNoteTitle ?? '';
				openPicker();
			})
		];
		window.addEventListener('keydown', handleKey);
		return () => {
			offs.forEach((off) => off());
			window.removeEventListener('keydown', handleKey);
		};
	});

	async function openPicker(): Promise<void> {
		try {
			const res = await fetch(`/api/vaults/${vaultId}/templates`);
			const data = await res.json() as { templates: Template[] };
			all = data.templates ?? [];
		} catch {
			all = [];
		}
		query = '';
		selectedIdx = 0;
		open = true;
		setTimeout(() => inputEl?.focus(), 0);
	}

	function handleKey(e: KeyboardEvent): void {
		if (!open) return;
		if (e.key === 'Escape') { open = false; e.preventDefault(); return; }
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIdx = Math.min(filtered.length - 1, selectedIdx + 1);
			return;
		}
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIdx = Math.max(0, selectedIdx - 1);
			return;
		}
		if (e.key === 'Enter') {
			e.preventDefault();
			void choose(filtered[selectedIdx]);
		}
	}

	async function choose(t: Template | undefined): Promise<void> {
		if (!t) return;
		open = false;
		try {
			const url = `/api/vaults/${vaultId}/templates?name=${encodeURIComponent(t.name)}&title=${encodeURIComponent(activeNoteTitle)}`;
			const res = await fetch(url);
			if (!res.ok) {
				alert(`Couldn't load template: ${res.statusText}`);
				return;
			}
			const data = await res.json() as { content: string };
			emit('template:insert', { vaultId, content: data.content });
		} catch (e) {
			alert(`Template load failed: ${(e as Error).message}`);
		}
	}
</script>

{#if open}
	<div
		class="backdrop"
		role="dialog"
		aria-modal="true"
		aria-label="Insert template"
		onclick={(e) => { if (e.target === e.currentTarget) open = false; }}
	>
		<div class="modal">
			<div class="head">
				<span class="mode">Template</span>
				<input
					bind:this={inputEl}
					bind:value={query}
					placeholder={all.length === 0 ? 'No templates in Templates/ folder' : 'Filter templates…'}
					spellcheck="false"
					autocomplete="off"
				/>
			</div>
			<ul class="results">
				{#each filtered as t, i (t.path)}
					<li class:active={i === selectedIdx}>
						<button
							type="button"
							class="result"
							onclick={() => choose(t)}
							onmouseenter={() => (selectedIdx = i)}
						>
							<span class="name">{t.name}</span>
							<span class="path">{t.path}</span>
						</button>
					</li>
				{/each}
				{#if filtered.length === 0}
					<li class="empty">
						{#if all.length === 0}
							Create <code>.md</code> files in a <code>Templates/</code> folder
							to use them here. Tokens supported: {'{{date}}'}, {'{{date:FORMAT}}'},
							{'{{time}}'}, {'{{title}}'}, {'{{cursor}}'}.
						{:else}
							No matches.
						{/if}
					</li>
				{/if}
			</ul>
			<footer class="hint">
				<kbd>↑</kbd><kbd>↓</kbd> navigate <kbd>⏎</kbd> insert <kbd>Esc</kbd> close
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
		width: min(560px, 94vw);
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
		max-height: 50vh;
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
	.name { color: var(--fg); font-weight: 500; }
	.path { color: var(--fg-dim); font-size: 0.78rem; font-family: var(--mono); }
	.empty {
		padding: 20px;
		text-align: center;
		color: var(--fg-dim);
		font-size: 0.84rem;
		line-height: 1.5;
	}
	.empty code {
		font-family: var(--mono);
		background: var(--bg);
		padding: 1px 4px;
		border-radius: 3px;
	}
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
