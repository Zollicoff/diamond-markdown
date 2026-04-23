<script lang="ts">
	import type { NoteDoc } from '$lib/types';
	import BacklinksPanel from './BacklinksPanel.svelte';

	interface Props {
		vaultId: string;
		doc: NoteDoc | null;
	}
	let { vaultId, doc }: Props = $props();
</script>

<aside class="right">
	{#if doc}
		<BacklinksPanel
			{vaultId}
			backlinks={doc.backlinks}
			outgoing={doc.outgoingLinks}
			tags={doc.tags}
		/>
	{:else}
		<div class="empty">
			<p>No note selected.</p>
		</div>
	{/if}
</aside>

<style>
	.right {
		height: 100%;
		overflow: hidden;
		background: var(--bg-elev);
		border-left: 1px solid var(--border);
	}
	.empty { padding: 24px 16px; color: var(--fg-dim); font-size: 0.86rem; }
	p { margin: 0; }
</style>
