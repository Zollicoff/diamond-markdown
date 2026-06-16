<script lang="ts">
	import {
		searchHighlightParts,
		type SearchHighlightField
	} from '$lib/search/highlight';

	interface Props {
		text: string;
		query: string;
		field: SearchHighlightField;
	}

	let { text, query, field }: Props = $props();
	const parts = $derived(searchHighlightParts(text, query, field));
</script>

{#each parts as part}
	{#if part.match}
		<mark>{part.text}</mark>
	{:else}
		{part.text}
	{/if}
{/each}
