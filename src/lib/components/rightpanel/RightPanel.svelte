<script lang="ts">
	import type { NoteDoc } from '$lib/types';
	import BacklinksPanel from './BacklinksPanel.svelte';
	import OutlinePanel from './OutlinePanel.svelte';

	interface Props {
		vaultId: string;
		doc: NoteDoc | null;
	}
	let { vaultId, doc }: Props = $props();
</script>

<aside class="right">
	{#if doc}
		<div class="stack">
			<OutlinePanel body={doc.body} />
			<BacklinksPanel
				{vaultId}
				backlinks={doc.backlinks}
				outgoing={doc.outgoingLinks}
				tags={doc.tags}
			/>
		</div>
	{:else}
		<div class="empty">
			<p>No note selected.</p>
		</div>
	{/if}
</aside>

<style>
	.right {
		height: 100%;
		overflow-y: auto;
		background: var(--bg-elev);
		border-left: 1px solid var(--border);
	}
	.stack {
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.empty { padding: 24px 16px; color: var(--fg-dim); font-size: 0.86rem; }
	p { margin: 0; }
</style>
