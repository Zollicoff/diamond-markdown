<script lang="ts">
	import type { Tab } from '$lib/workspace/types';
	import type { NoteDoc } from '$lib/types';
	import NoteView from '$lib/components/tabviews/NoteView.svelte';
	import GraphView from '$lib/components/tabviews/GraphView.svelte';
	import TagsView from '$lib/components/tabviews/TagsView.svelte';
	import SearchView from '$lib/components/tabviews/SearchView.svelte';
	import SettingsView from '$lib/components/tabviews/SettingsView.svelte';

	interface Props {
		vaultId: string;
		tab: Tab;
		mode: 'live' | 'source' | 'read';
		isFocused: boolean;
		onDocLoaded?: (doc: NoteDoc) => void;
		onModeChange?: (m: 'live' | 'source' | 'read') => void;
	}

	let { vaultId, tab, mode, isFocused, onDocLoaded, onModeChange }: Props = $props();
</script>

{#if tab.kind === 'note'}
	<NoteView {vaultId} path={tab.path} {mode} {isFocused} {onDocLoaded} {onModeChange} />
{:else if tab.kind === 'graph'}
	<GraphView {vaultId} />
{:else if tab.kind === 'tags'}
	<TagsView {vaultId} filter={tab.filter} />
{:else if tab.kind === 'search'}
	<SearchView />
{:else if tab.kind === 'settings'}
	<SettingsView />
{/if}
