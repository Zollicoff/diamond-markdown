<script lang="ts">
	import { api } from '$lib/vault-api';
	import type { AttachmentRef } from '$lib/types';
	import { filterAttachments, formatAttachmentSize } from '$lib/note/attachments';

	interface Props {
		vaultId: string;
		onInsert: (path: string) => void | Promise<void>;
		onClose: () => void;
	}

	let { vaultId, onInsert, onClose }: Props = $props();
	let attachments = $state<AttachmentRef[]>([]);
	let selectedPath = $state<string | null>(null);
	let query = $state('');
	let loading = $state(true);
	let error = $state<string | null>(null);

	const visible = $derived(filterAttachments(attachments, query));
	const selected = $derived(attachments.find((attachment) => attachment.path === selectedPath) ?? null);

	async function load(): Promise<void> {
		loading = true;
		error = null;
		try {
			attachments = await api.attachments(vaultId);
			selectedPath = attachments[0]?.path ?? null;
		} catch (e) {
			error = (e as Error).message;
		} finally {
			loading = false;
		}
	}

	async function insertSelected(): Promise<void> {
		if (!selected) return;
		await onInsert(selected.path);
		onClose();
	}

	function closeFromBackdrop(event: MouseEvent): void {
		if (event.target === event.currentTarget) onClose();
	}

	$effect(() => {
		void load();
	});
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') onClose();
	}}
/>

<div class="backdrop" role="presentation" onclick={closeFromBackdrop}>
	<div
		class="modal"
		role="dialog"
		aria-modal="true"
		aria-label="Insert attachment"
	>
		<header>
			<div>
				<h2>Insert attachment</h2>
				<p>{attachments.length} vault asset{attachments.length === 1 ? '' : 's'}</p>
			</div>
			<button class="icon-btn" aria-label="Close attachment picker" onclick={onClose}>×</button>
		</header>

		<input
			class="filter"
			aria-label="Filter attachments"
			placeholder={attachments.length === 0 ? 'No attachments found' : 'Filter by name, path, or type'}
			bind:value={query}
		/>

		{#if loading}
			<div class="state">Loading attachments...</div>
		{:else if error}
			<div class="state error">{error}</div>
		{:else if visible.length === 0}
			<div class="state">No matching attachments.</div>
		{:else}
			<div class="list" role="listbox" aria-label="Vault attachments" tabindex="0">
				{#each visible as attachment (attachment.path)}
					<button
						type="button"
						class="row"
						class:selected={attachment.path === selectedPath}
						role="option"
						aria-selected={attachment.path === selectedPath}
						onclick={() => (selectedPath = attachment.path)}
						ondblclick={() => {
							selectedPath = attachment.path;
							void insertSelected();
						}}
					>
						<span class="kind">{attachment.kind}</span>
						<span class="main">
							<span class="name">{attachment.filename}</span>
							<span class="path mono">{attachment.path}</span>
						</span>
						<span class="size mono">{formatAttachmentSize(attachment.size)}</span>
					</button>
				{/each}
			</div>
		{/if}

		<footer>
			<button class="secondary" onclick={onClose}>Cancel</button>
			<button class="primary" disabled={!selected} onclick={() => void insertSelected()}>
				Insert embed
			</button>
		</footer>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 80;
		display: grid;
		place-items: center;
		padding: 20px;
		background: rgba(0, 0, 0, 0.46);
	}
	.modal {
		width: min(720px, 100%);
		max-height: min(680px, 92vh);
		display: flex;
		flex-direction: column;
		border: 1px solid var(--border-strong);
		border-radius: 8px;
		background: var(--bg-elev);
		color: var(--fg);
		box-shadow: 0 24px 80px rgba(0, 0, 0, 0.42);
		overflow: hidden;
	}
	header,
	footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		padding: 14px 16px;
		border-bottom: 1px solid var(--border);
	}
	footer {
		border-top: 1px solid var(--border);
		border-bottom: 0;
		justify-content: flex-end;
	}
	h2 {
		margin: 0;
		font-family: 'Bricolage Grotesque', var(--sans);
		font-size: 1rem;
	}
	p {
		margin: 3px 0 0;
		color: var(--fg-dim);
		font-size: 0.78rem;
	}
	.icon-btn,
	.secondary,
	.primary {
		border: 1px solid var(--border);
		border-radius: 5px;
		background: var(--bg);
		color: var(--fg-muted);
		font: inherit;
		font-size: 0.8rem;
		padding: 6px 10px;
		cursor: pointer;
	}
	.icon-btn {
		width: 30px;
		height: 30px;
		padding: 0;
		font-size: 1.1rem;
		line-height: 1;
	}
	.primary {
		border-color: color-mix(in srgb, var(--accent), var(--border) 40%);
		color: var(--accent);
	}
	.primary:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.filter {
		margin: 12px 16px 0;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg);
		color: var(--fg);
		font: inherit;
		font-size: 0.86rem;
		padding: 8px 10px;
	}
	.filter:focus {
		border-color: var(--accent);
		outline: 2px solid color-mix(in srgb, var(--accent), transparent 70%);
	}
	.list {
		margin: 12px 16px 0;
		border: 1px solid var(--border);
		border-radius: 7px;
		overflow: auto;
		min-height: 120px;
		max-height: 380px;
	}
	.row {
		width: 100%;
		display: grid;
		grid-template-columns: 58px minmax(0, 1fr) auto;
		align-items: center;
		gap: 10px;
		border: 0;
		border-bottom: 1px solid var(--border);
		background: transparent;
		color: var(--fg);
		text-align: left;
		padding: 9px 10px;
		cursor: pointer;
	}
	.row:last-child {
		border-bottom: 0;
	}
	.row:hover,
	.row.selected {
		background: var(--bg-hover);
	}
	.kind {
		border: 1px solid var(--border);
		border-radius: 999px;
		color: var(--fg-dim);
		font-size: 0.64rem;
		text-transform: uppercase;
		text-align: center;
		padding: 2px 5px;
	}
	.main {
		min-width: 0;
		display: grid;
		gap: 2px;
	}
	.name,
	.path {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.name {
		font-size: 0.84rem;
	}
	.path,
	.size {
		color: var(--fg-dim);
		font-size: 0.7rem;
	}
	.state {
		display: grid;
		place-items: center;
		min-height: 160px;
		color: var(--fg-dim);
		font-size: 0.84rem;
	}
	.state.error {
		color: var(--danger);
	}
	.mono {
		font-family: var(--mono);
	}

	@media (max-width: 640px) {
		.row {
			grid-template-columns: 52px minmax(0, 1fr);
		}
		.size {
			display: none;
		}
	}
</style>
