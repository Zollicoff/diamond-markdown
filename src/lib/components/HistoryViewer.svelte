<script lang="ts">
	import { onMount } from 'svelte';
	import HistoryContentPanel from './history/HistoryContentPanel.svelte';
	import { api } from '$lib/vault-api';
	import { on as onBus } from '$lib/events';
	import { confirmDialog, notify } from '$lib/dialogs';
	import { buildHistoryLineDiff, summarizeHistoryDiff } from '$lib/history/diff';

	interface Props {
		vaultId: string;
	}

	type HistoryViewMode = 'snapshot' | 'diff';

	let { vaultId }: Props = $props();

	interface LogEntry {
		sha: string;
		shortSha: string;
		date: string;
		author: string;
		message: string;
	}

	let open = $state(false);
	let path = $state<string | null>(null);
	let log = $state<LogEntry[]>([]);
	let loadingLog = $state(false);
	let err = $state<string | null>(null);

	let selectedSha = $state<string | null>(null);
	let selectedContent = $state<string | null>(null);
	let loadingContent = $state(false);
	let currentContent = $state<string | null>(null);
	let currentRevision = $state<string | null>(null);
	let loadingCurrent = $state(false);
	let restoring = $state(false);
	let viewMode = $state<HistoryViewMode>('diff');

	const diffRows = $derived(
		selectedContent != null && currentContent != null
			? buildHistoryLineDiff(selectedContent, currentContent)
			: []
	);
	const diffSummary = $derived(summarizeHistoryDiff(diffRows));
	const canRestore = $derived(
		!!path &&
		!!selectedSha &&
		selectedContent != null &&
		currentContent != null &&
		currentRevision != null &&
		selectedContent !== currentContent &&
		!loadingContent &&
		!loadingCurrent &&
		!restoring
	);

	function close(): void {
		open = false;
		path = null;
		log = [];
		selectedSha = null;
		selectedContent = null;
		currentContent = null;
		currentRevision = null;
		restoring = false;
	}

	async function loadLog(p: string): Promise<void> {
		loadingLog = true;
		loadingCurrent = true;
		err = null;
		currentContent = null;
		currentRevision = null;
		try {
			const [nextLog, note] = await Promise.all([
				api.history(vaultId, p),
				api.note(vaultId, p)
			]);
			log = nextLog;
			currentContent = note.content;
			currentRevision = note.revision;
			if (log.length > 0) {
				selectedSha = log[0].sha;
				await loadContent(p, log[0].sha);
			}
		} catch (e) {
			err = (e as Error).message;
		} finally {
			loadingLog = false;
			loadingCurrent = false;
		}
	}

	async function loadContent(p: string, sha: string): Promise<void> {
		loadingContent = true;
		try {
			const res = await api.historyAt(vaultId, p, sha);
			selectedContent = res.content;
		} catch (e) {
			err = (e as Error).message;
			selectedContent = null;
		} finally {
			loadingContent = false;
		}
	}

	async function restoreSelectedSnapshot(): Promise<void> {
		if (!path || !selectedSha || selectedContent == null || currentRevision == null || restoring) return;
		const shortSha = selectedSha.slice(0, 7);
		const confirmed = await confirmDialog({
			title: 'Restore history snapshot',
			message: `Restore "${path}" to commit ${shortSha}?\n\nThis will save the selected snapshot as a new git commit.`,
			confirmLabel: 'Restore',
			cancelLabel: 'Cancel'
		});
		if (!confirmed) return;

		restoring = true;
		err = null;
		try {
			const res = await api.saveNote(vaultId, path, selectedContent, currentRevision);
			currentContent = selectedContent;
			currentRevision = res.revision;
			notify({
				title: 'History restored',
				message: `${path} restored to ${shortSha}.`,
				tone: 'success'
			});
			viewMode = 'diff';
			await loadLog(path);
		} catch (e) {
			err = (e as Error).message;
			notify({
				title: 'Restore failed',
				message: err,
				tone: 'danger'
			});
		} finally {
			restoring = false;
		}
	}

	function pickCommit(sha: string): void {
		if (!path) return;
		selectedSha = sha;
		void loadContent(path, sha);
	}

	async function copyToClipboard(): Promise<void> {
		if (!selectedContent) return;
		try {
			await navigator.clipboard.writeText(selectedContent);
		} catch { /* ignore */ }
	}

	function fmtDate(iso: string): string {
		const d = new Date(iso);
		if (isNaN(d.getTime())) return iso;
		return d.toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function handleKey(e: KeyboardEvent): void {
		if (!open) return;
		if (e.key === 'Escape') close();
	}

	onMount(() => {
		const off = onBus('history:open', (e) => {
			if (e.vaultId !== vaultId) return;
			open = true;
			path = e.path;
			log = [];
			selectedSha = null;
			selectedContent = null;
			currentContent = null;
			currentRevision = null;
			restoring = false;
			viewMode = 'diff';
			void loadLog(e.path);
		});
		window.addEventListener('keydown', handleKey);
		return () => {
			off();
			window.removeEventListener('keydown', handleKey);
		};
	});
</script>

{#if open}
	<div
		class="backdrop"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onclick={(e) => { if (e.target === e.currentTarget) close(); }}
		onkeydown={(e) => { if (e.key === 'Escape') close(); }}
	>
		<div class="modal">
			<header class="head">
				<div class="title">
					<span class="mode">History</span>
					<span class="path mono">{path}</span>
				</div>
				<button class="close" onclick={close} aria-label="Close">×</button>
			</header>
			<div class="body">
				<aside class="log">
					{#if loadingLog}
						<p class="status">Loading…</p>
					{:else if err}
						<p class="err">{err}</p>
					{:else if log.length === 0}
						<p class="status">No history yet. Save the note to create the first commit.</p>
					{:else}
						<ul>
							{#each log as entry (entry.sha)}
								<li>
									<button
										class="commit"
										class:active={entry.sha === selectedSha}
										onclick={() => pickCommit(entry.sha)}
									>
										<span class="msg">{entry.message || '(no message)'}</span>
										<span class="meta mono">
											{entry.shortSha} · {fmtDate(entry.date)}
										</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</aside>
				<HistoryContentPanel
					{selectedSha}
					{selectedContent}
					{currentContent}
					{loadingContent}
					{loadingCurrent}
					{viewMode}
					{diffRows}
					{diffSummary}
					{canRestore}
					{restoring}
					onViewModeChange={(mode) => (viewMode = mode)}
					onCopy={copyToClipboard}
					onRestore={restoreSelectedSnapshot}
				/>
			</div>
			<footer class="hint">
				<kbd>Esc</kbd> close · diff compares the selected commit to the current saved note
			</footer>
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed; inset: 0;
		background: rgba(0,0,0,0.55);
		backdrop-filter: blur(3px);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 6vh;
		z-index: 1000;
	}
	.modal {
		width: min(1100px, 94vw);
		height: 80vh;
		background: var(--bg-elev);
		border: 1px solid var(--border-strong);
		border-radius: 12px;
		box-shadow: 0 20px 60px rgba(0,0,0,0.4);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.head {
		display: flex; align-items: center; justify-content: space-between;
		padding: 12px 14px;
		border-bottom: 1px solid var(--border);
	}
	.title { display: flex; align-items: center; gap: 10px; min-width: 0; }
	.mode {
		font-family: var(--mono);
		font-size: 0.72rem;
		color: var(--fg-dim);
		text-transform: uppercase;
		letter-spacing: 0.14em;
	}
	.path {
		font-size: 0.85rem;
		color: var(--fg);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.close {
		background: transparent; border: 0;
		color: var(--fg-dim);
		font-size: 1.2rem;
		padding: 2px 8px;
		border-radius: 4px;
		cursor: pointer;
	}
	.close:hover { color: var(--fg); background: var(--bg-hover); }

	.body {
		flex: 1;
		display: grid;
		grid-template-columns: 320px 1fr;
		min-height: 0;
	}

	.log {
		border-right: 1px solid var(--border);
		overflow-y: auto;
		padding: 6px;
	}
	.log ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
	.log li { padding: 0; }
	.commit {
		display: flex; flex-direction: column; gap: 2px;
		width: 100%;
		background: transparent; border: 0;
		padding: 8px 10px;
		border-radius: 6px;
		color: inherit; text-align: left;
		cursor: pointer;
		font: inherit;
	}
	.commit:hover { background: var(--bg-hover); }
	.commit.active { background: var(--bg-hover); outline: 1px solid var(--border-strong); }
	.msg { font-size: 0.86rem; color: var(--fg); }
	.meta { font-size: 0.72rem; color: var(--fg-dim); }

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

	.status, .err { padding: 14px; color: var(--fg-dim); font-size: 0.86rem; margin: 0; }
	.err { color: var(--danger); }
	.mono { font-family: var(--mono); }

	@media (max-width: 800px) {
		.body { grid-template-columns: 1fr; grid-template-rows: 40% 60%; }
		.log { border-right: 0; border-bottom: 1px solid var(--border); }
	}
</style>
