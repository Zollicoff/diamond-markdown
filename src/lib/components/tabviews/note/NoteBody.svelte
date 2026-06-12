<script lang="ts">
	import type { EditorApi } from '$lib/editor/commands';
	import type { LinkResolver } from '$lib/editor/live-preview';
	import type { NoteDoc } from '$lib/types';
	import type { NoteViewComponent } from '$lib/note/lazy-components';

	interface Props {
		vaultId: string;
		doc: NoteDoc | null;
		mode: 'live' | 'source' | 'read';
		content: string;
		editorApi: EditorApi | null;
		uploadingAttachments: number;
		EditorView: NoteViewComponent | null;
		PreviewView: NoteViewComponent | null;
		ToolbarView: NoteViewComponent | null;
		viewLoadError: string | null;
		waitingForEditor: boolean;
		waitingForPreview: boolean;
		resolveLink: LinkResolver;
		onContentChange: (value: string) => void;
		onSave: () => void | Promise<void>;
		onWikilinkClick: (target: string, href: string | null, resolved: boolean, event: MouseEvent) => void | Promise<void>;
		onWikilinkContext: (target: string, href: string | null, resolved: boolean, event: MouseEvent) => void;
		onFilesInsert: (files: File[]) => void | Promise<void>;
		onEditorReady: (api: EditorApi) => void;
		onAttachExisting: () => void;
	}

	let {
		vaultId,
		doc,
		mode,
		content,
		editorApi,
		uploadingAttachments,
		EditorView,
		PreviewView,
		ToolbarView,
		viewLoadError,
		waitingForEditor,
		waitingForPreview,
		resolveLink,
		onContentChange,
		onSave,
		onWikilinkClick,
		onWikilinkContext,
		onFilesInsert,
		onEditorReady,
		onAttachExisting
	}: Props = $props();
</script>

{#if mode !== 'read' && ToolbarView}
	<ToolbarView api={editorApi} onAttachExisting={onAttachExisting} />
{/if}

{#if uploadingAttachments > 0}
	<div class="attachment-status" role="status">
		Attaching {uploadingAttachments} file{uploadingAttachments === 1 ? '' : 's'}...
	</div>
{/if}

<div class="body">
	{#if !doc}
		<div class="loading">Loading...</div>
	{:else if viewLoadError}
		<div class="loading err">Could not load view: {viewLoadError}</div>
	{:else if mode === 'read' && PreviewView}
		<PreviewView html={doc.html} {vaultId} {doc} />
	{:else if mode === 'read' && waitingForPreview}
		<div class="loading">Loading preview...</div>
	{:else if mode !== 'read' && EditorView}
		<EditorView
			value={content}
			mode={mode}
			{resolveLink}
			onChange={onContentChange}
			onSave={onSave}
			onWikilinkClick={onWikilinkClick}
			onWikilinkContext={onWikilinkContext}
			onFilesInsert={onFilesInsert}
			onReady={onEditorReady}
		/>
	{:else if waitingForEditor}
		<div class="loading">Loading editor...</div>
	{:else}
		<div class="loading">Loading...</div>
	{/if}
</div>

<style>
	.body { flex: 1; min-height: 0; overflow: hidden; }
	.attachment-status {
		padding: 0.45rem 1rem;
		border-bottom: 1px solid var(--border);
		background: var(--bg-elev);
		color: var(--fg-dim);
		font-size: 0.82rem;
	}
	.loading { padding: 2rem; color: var(--fg-dim); }
	.loading.err { color: var(--danger); }
</style>
