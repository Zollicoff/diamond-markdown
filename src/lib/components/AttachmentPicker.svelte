<script lang="ts">
	import { api } from '$lib/vault-api';
	import type { AttachmentRef } from '$lib/types';
	import { filterAttachments } from '$lib/note/attachments';
	import { confirmDialog, notify, promptText } from '$lib/dialogs';
	import AttachmentPickerList from './AttachmentPickerList.svelte';

	interface Props {
		vaultId: string;
		onInsert: (paths: string[]) => void | Promise<void>;
		onClose: () => void;
	}

	let { vaultId, onInsert, onClose }: Props = $props();
	let attachments = $state<AttachmentRef[]>([]);
	let selectedPaths = $state<string[]>([]);
	let query = $state('');
	let loading = $state(true);
	let deleting = $state(false);
	let renaming = $state(false);
	let moving = $state(false);
	let error = $state<string | null>(null);

	const visible = $derived(filterAttachments(attachments, query));
	const selectedPathSet = $derived(new Set(selectedPaths));
	const selected = $derived(attachments.filter((attachment) => selectedPathSet.has(attachment.path)));
	const insertLabel = $derived(
		selected.length === 1 ? 'Insert embed' : `Insert ${selected.length} embeds`
	);

	async function load(): Promise<void> {
		loading = true;
		error = null;
		try {
			attachments = await api.attachments(vaultId);
			selectedPaths = [];
		} catch (e) {
			error = (e as Error).message;
		} finally {
			loading = false;
		}
	}

	function togglePath(path: string): void {
		selectedPaths = selectedPathSet.has(path)
			? selectedPaths.filter((candidate) => candidate !== path)
			: [...selectedPaths, path];
	}

	function selectVisible(): void {
		const next = [...selectedPaths];
		for (const attachment of visible) {
			if (!next.includes(attachment.path)) next.push(attachment.path);
		}
		selectedPaths = next;
	}

	function clearSelection(): void {
		selectedPaths = [];
	}

	async function insertSelected(paths = selected.map((attachment) => attachment.path)): Promise<void> {
		if (!paths.length) return;
		await onInsert(paths);
		onClose();
	}

	async function deleteSelected(): Promise<void> {
		if (selected.length === 0 || deleting || renaming || moving) return;
		const count = selected.length;
		const confirmed = await confirmDialog({
			title: count === 1 ? 'Delete attachment' : `Delete ${count} attachments`,
			message: count === 1
				? `Delete "${selected[0].path}" from this vault? Existing notes that embed it will keep the now-missing reference.`
				: `Delete ${count} selected attachments from this vault? Existing notes that embed them will keep the now-missing references.`,
			confirmLabel: count === 1 ? 'Delete attachment' : 'Delete attachments',
			tone: 'danger'
		});
		if (!confirmed) return;
		deleting = true;
		error = null;
		const paths = selected.map((attachment) => attachment.path);
		try {
			for (const path of paths) {
				await api.deleteAttachment(vaultId, path);
			}
			selectedPaths = [];
			await load();
			notify({
				title: count === 1 ? 'Attachment deleted' : `${count} attachments deleted`,
				tone: 'success'
			});
		} catch (e) {
			error = (e as Error).message;
		} finally {
			deleting = false;
		}
	}

	async function renameSelected(): Promise<void> {
		if (selected.length !== 1 || deleting || renaming || moving) return;
		const attachment = selected[0];
		const nextPath = await promptText({
			title: 'Rename attachment',
			label: 'Vault path',
			value: attachment.path,
			confirmLabel: 'Rename'
		});
		if (!nextPath || nextPath === attachment.path) return;
		renaming = true;
		error = null;
		try {
			const res = await api.renameAttachment(vaultId, attachment.path, nextPath);
			await load();
			selectedPaths = [res.to];
			notify({
				title: 'Attachment renamed',
				message: res.linksUpdated > 0
					? `${res.linksUpdated} markdown reference${res.linksUpdated === 1 ? '' : 's'} updated.`
					: 'No markdown references needed updating.',
				tone: 'success'
			});
		} catch (e) {
			error = (e as Error).message;
		} finally {
			renaming = false;
		}
	}

	async function moveSelected(): Promise<void> {
		if (selected.length === 0 || deleting || renaming || moving) return;
		const count = selected.length;
		const folder = await promptText({
			title: count === 1 ? 'Move attachment' : `Move ${count} attachments`,
			label: 'Destination folder',
			value: 'Attachments',
			confirmLabel: 'Move'
		});
		if (!folder) return;
		const paths = selected.map((attachment) => attachment.path);
		moving = true;
		error = null;
		try {
			const res = await api.moveAttachments(vaultId, paths, folder);
			await load();
			selectedPaths = res.moved.map((move) => move.to);
			const movedCount = res.moved.length;
			notify({
				title: movedCount === 0
					? 'Attachments already organized'
					: movedCount === 1 ? 'Attachment moved' : `${movedCount} attachments moved`,
				message: movedCount === 0
					? `Selected attachment${count === 1 ? '' : 's'} already in ${res.folder}.`
					: res.linksUpdated > 0
						? `${res.linksUpdated} markdown reference${res.linksUpdated === 1 ? '' : 's'} updated.`
						: 'No markdown references needed updating.',
				tone: 'success'
			});
		} catch (e) {
			error = (e as Error).message;
		} finally {
			moving = false;
		}
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
		<div class="selection-bar">
			<span>{selected.length} selected</span>
			<div>
				<button class="secondary" disabled={visible.length === 0 || deleting || renaming || moving} onclick={selectVisible}>Select visible</button>
				<button class="secondary" disabled={selected.length === 0} onclick={clearSelection}>Clear</button>
				<button class="secondary" disabled={selected.length !== 1 || deleting || renaming || moving} onclick={() => void renameSelected()}>
					{renaming ? 'Renaming...' : 'Rename'}
				</button>
				<button class="secondary" disabled={selected.length === 0 || deleting || renaming || moving} onclick={() => void moveSelected()}>
					{moving ? 'Moving...' : 'Move'}
				</button>
				<button class="danger" disabled={selected.length === 0 || deleting || renaming || moving} onclick={() => void deleteSelected()}>
					{deleting ? 'Deleting...' : 'Delete selected'}
				</button>
			</div>
		</div>

		<AttachmentPickerList
			{loading}
			{error}
			{visible}
			{selectedPathSet}
			onTogglePath={togglePath}
			onInsertPath={(path) => void insertSelected([path])}
		/>

		<footer>
			<button class="secondary" onclick={onClose}>Cancel</button>
			<button class="primary" disabled={selected.length === 0 || deleting || renaming || moving} onclick={() => void insertSelected()}>
				{insertLabel}
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
	.danger,
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
	.danger {
		border-color: color-mix(in srgb, var(--danger), var(--border) 40%);
		color: var(--danger);
	}
	.primary:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.danger:disabled,
	.secondary:disabled {
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
	.selection-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin: 10px 16px 0;
		color: var(--fg-dim);
		font-size: 0.76rem;
	}
	.selection-bar div {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 6px;
	}
	.selection-bar .secondary,
	.selection-bar .danger {
		padding: 4px 8px;
		font-size: 0.74rem;
	}
</style>
