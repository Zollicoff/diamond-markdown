<script lang="ts">
	import type { PageData } from './$types';
	import { openCanvas } from '$lib/workspace/actions';

	let { data }: { data: PageData } = $props();

	let lastOpened: string | null = null;

	$effect(() => {
		if (!data.path) return;
		if (data.path === lastOpened) return;
		lastOpened = data.path;
		const ensureCanvas = /\.canvas$/i.test(data.path) ? data.path : `${data.path}.canvas`;
		const title = ensureCanvas.split('/').pop()!.replace(/\.canvas$/i, '');
		openCanvas(data.vault.id, ensureCanvas, title, 'replace');
	});
</script>

<!-- The workspace component in +layout.svelte renders the actual pane. -->
