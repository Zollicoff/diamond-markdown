<script lang="ts">
	import type { PageData } from './$types';
	import { openNote } from '$lib/workspace/actions';

	let { data }: { data: PageData } = $props();

	// URL nav = "open in active pane, replace active tab." Fires whenever
	// the route params change.
	let lastOpened: string | null = null;

	$effect(() => {
		if (!data.path) return;
		if (data.path === lastOpened) return;
		lastOpened = data.path;
		const ensureMd = /\.[a-z0-9]+$/i.test(data.path) ? data.path : `${data.path}.md`;
		const title = ensureMd.split('/').pop()!.replace(/\.md$/, '');
		openNote(data.vault.id, ensureMd, title, 'replace');
	});
</script>

<!-- The workspace component in +layout.svelte renders the actual panes.
     This page just translates "URL changed" into "open in active pane." -->
