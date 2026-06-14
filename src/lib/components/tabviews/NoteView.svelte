<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import type { EditorApi } from '$lib/editor/commands';
	import type { LinkResolver } from '$lib/editor/live-preview';
	import type { EditorLinkStyle, NoteDoc } from '$lib/types';
	import { api } from '$lib/vault-api';
	import { on as onBus, emit as emitBus } from '$lib/events';
	import { attachmentEmbedMarkdown } from '$lib/note/attachments';
	import { openNote } from '$lib/workspace/actions';
	import { currentLocationHashId, replaceLocationHash } from '$lib/workspace/hash';
	import { openModeForPointer } from '$lib/workspace/open-mode';
	import { registerActivePluginEditor } from '$lib/plugins/editor-commands.svelte';
	import ContextMenu, { type MenuItem, type Position } from '$lib/components/ContextMenu.svelte';
	import AttachmentPicker from '$lib/components/AttachmentPicker.svelte';
	import { confirmDialog } from '$lib/dialogs';
	import NoteTopBar from './note/NoteTopBar.svelte';
	import {
		loadNoteEditor,
		loadNotePreview,
		loadNoteToolbar,
		type NoteViewComponent
	} from '$lib/note/lazy-components';
	import {
		ensureMarkdownPath,
		isStaleRevisionError,
		markdownWordCount,
		noteTargetFromVaultHref,
		noteTitleFromPath,
		readingTimeLabel,
		resolveNoteLink,
		type NoteHrefTarget
	} from '$lib/note/view';
	import NoteBody from './note/NoteBody.svelte';

	interface Props {
		vaultId: string;
		paneId: string;
		tabId: string;
		path: string;
		mode: 'live' | 'source' | 'read';
		isFocused: boolean;
		/** Called when this view emits an update the parent cares about
		 *  (e.g. backlinks refreshed, title from frontmatter). */
		onDocLoaded?: (doc: NoteDoc) => void;
		/** Called when the user picks a new view mode in the topbar. The
		 *  pane owns the mode state so it survives note switches inside
		 *  the same tab. */
		onModeChange?: (m: 'live' | 'source' | 'read') => void;
	}

	let { vaultId, paneId, tabId, path, mode, isFocused, onDocLoaded, onModeChange }: Props = $props();

	let doc = $state<NoteDoc | null>(null);
	let content = $state('');
	let dirty = $state(false);
	let saving = $state(false);
	let savedAt = $state<number | null>(null);
	let err = $state<string | null>(null);
	let editorApi = $state<EditorApi | null>(null);
	let uploadingAttachments = $state(0);
	let attachmentPickerOpen = $state(false);
	let EditorView = $state<NoteViewComponent | null>(null);
	let PreviewView = $state<NoteViewComponent | null>(null);
	let ToolbarView = $state<NoteViewComponent | null>(null);
	let viewLoadError = $state<string | null>(null);
	let linkStyle = $state<EditorLinkStyle>('wikilink');
	let showLineNumbers = $state(true);

	let loadedPath: string | null = null;
	let loadedVault: string | null = null;

	async function load(): Promise<void> {
		try {
			const d = await api.note(vaultId, path);
			doc = d;
			content = d.content;
			dirty = false;
			err = null;
			loadedPath = path;
			loadedVault = vaultId;
			onDocLoaded?.(d);
		} catch (e) {
			err = (e as Error).message;
		}
	}

	$effect(() => {
		// Reload whenever the note we're showing changes.
		if (path !== loadedPath || vaultId !== loadedVault) {
			untrack(() => {
				doc = null;
				void load();
			});
		}
	});

	$effect(() => {
		const id = vaultId;
		untrack(() => {
			linkStyle = 'wikilink';
			api.linkStyle(id)
				.then((preference) => {
					if (id === vaultId) linkStyle = preference.style;
				})
				.catch(() => {
					if (id === vaultId) linkStyle = 'wikilink';
				});
		});
	});

	$effect(() => {
		const id = vaultId;
		untrack(() => {
			showLineNumbers = true;
			api.editorPreferences(id)
				.then((preference) => {
					if (id === vaultId) showLineNumbers = preference.lineNumbers;
				})
				.catch(() => {
					if (id === vaultId) showLineNumbers = true;
				});
		});
	});

	// Refresh when a sibling saves the same note, or this note is renamed.
	$effect(() => {
		const offs = [
			onBus('note:saved', (e) => {
				if (e.vaultId === vaultId && e.path === path && !saving && !dirty) {
					void load();
				}
			}),
			onBus('note:renamed', (e) => {
				if (e.vaultId === vaultId && e.from === path) {
					setTimeout(() => void load(), 0);
				}
			}),
			onBus('template:insert', (e) => {
				// Only the focused note view should consume the template insert.
				if (e.vaultId !== vaultId || !isFocused) return;
				editorApi?.insertTemplate(e.content);
			}),
			onBus('outline:jump', (e) => {
				if (e.vaultId !== vaultId || e.path !== path || !isFocused) return;
				jumpToHeading(e.headingId);
			})
		];
		return () => offs.forEach((off) => off());
	});

	async function save(): Promise<void> {
		if (saving || !doc) return;
		saving = true;
		err = null;
		try {
			await api.saveNote(vaultId, path, content, doc.revision);
			dirty = false;
			savedAt = Date.now();
			// Refresh for fresh html + backlinks.
			await load();
		} catch (e) {
			err = (e as Error).message;
		} finally {
			saving = false;
		}
	}

	async function reloadFromDisk(): Promise<void> {
		if (dirty && !(await confirmDialog({
			title: 'Reload from disk',
			message: 'Reload this note from disk and discard unsaved edits?',
			confirmLabel: 'Reload',
			tone: 'danger'
		}))) return;
		void load();
	}

	function scrollReadHeading(id: string): boolean {
		const root = document.querySelector('.pane.active .preview') as HTMLElement | null;
		const el = root?.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null;
		if (!el) return false;
		el.scrollIntoView({ behavior: 'smooth', block: 'start' });
		return true;
	}

	function jumpToHeading(id: string): boolean {
		if (mode === 'read') {
			return scrollReadHeading(id);
		}
		return editorApi?.scrollToHeading(id) ?? false;
	}

	function openLinkedNote(target: NoteHrefTarget, openMode: ReturnType<typeof openModeForPointer>): void {
		replaceLocationHash(target.hash);
		openNote(vaultId, target.path, noteTitleFromPath(target.path), openMode);
		if (target.hash && target.path === path) {
			setTimeout(() => jumpToHeading(target.hash!), 0);
		}
	}

	let idleTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		if (!dirty) return;
		if (idleTimer) clearTimeout(idleTimer);
		idleTimer = setTimeout(save, 1500);
		return () => { if (idleTimer) clearTimeout(idleTimer); };
	});

	function onContentChange(v: string): void {
		if (v === content) return;
		content = v;
		dirty = true;
	}

	async function handleAttachmentFiles(files: File[]): Promise<void> {
		if (!files.length || !editorApi) return;
		uploadingAttachments = files.length;
		err = null;
		try {
			const uploaded = [];
			for (const file of files) {
				uploaded.push(await api.uploadAttachment(vaultId, file));
			}
			editorApi.insert(attachmentEmbedMarkdown(uploaded.map((file) => file.path)));
		} catch (e) {
			err = (e as Error).message;
		} finally {
			uploadingAttachments = 0;
		}
	}

	function insertExistingAttachments(paths: string[]): void {
		editorApi?.insert(attachmentEmbedMarkdown(paths));
	}

	const resolveLink: LinkResolver = (target: string) => {
		return resolveNoteLink(doc, vaultId, target);
	};

	function modeFor(e: MouseEvent): 'replace' | 'new-tab' | 'new-pane' {
		return openModeForPointer(e);
	}

	async function handleWikilinkClick(target: string, href: string | null, resolved: boolean, e: MouseEvent): Promise<void> {
		if (resolved && href) {
			const noteTarget = noteTargetFromVaultHref(vaultId, href);
			if (!noteTarget) return;
			openLinkedNote(noteTarget, modeFor(e));
			return;
		}
		const createPath = await confirmDialog({
			title: 'Create note',
			message: `Create note "${target}"?`,
			confirmLabel: 'Create note'
		})
			? ensureMarkdownPath(target)
			: null;
		if (!createPath) return;
		goto(`/vault/${vaultId}/note/${encodeURI(createPath)}`);
	}

	let menuOpen = $state(false);
	let menuPos = $state<Position>({ x: 0, y: 0 });
	let menuItems = $state<MenuItem[]>([]);

	function handleWikilinkContext(target: string, href: string | null, resolved: boolean, e: MouseEvent): void {
		if (!resolved || !href) return;
		const noteTarget = noteTargetFromVaultHref(vaultId, href);
		if (!noteTarget) return;
		menuPos = { x: e.clientX, y: e.clientY };
		menuItems = [
			{ label: 'Open',             icon: '→', action: () => openLinkedNote(noteTarget, 'replace') },
			{ label: 'Open in new tab',  icon: '⎚', shortcut: '⌘click',   action: () => openLinkedNote(noteTarget, 'new-tab') },
			{ label: 'Open in new pane', icon: '⊞', shortcut: 'alt+click', action: () => openLinkedNote(noteTarget, 'new-pane') },
			{ separator: true, label: '' },
			{ label: 'Copy path',        icon: '⎘', action: async () => { await navigator.clipboard?.writeText(noteTarget.path).catch(() => {}); } }
		];
		menuOpen = true;
	}

	const wordCount = $derived(markdownWordCount(content));
	const readingTime = $derived(readingTimeLabel(wordCount));
	const isConflict = $derived(isStaleRevisionError(err));
	const waitingForEditor = $derived(mode !== 'read' && (!EditorView || !ToolbarView));
	const waitingForPreview = $derived(mode === 'read' && !PreviewView);

	function openHistory(): void {
		emitBus('history:open', { vaultId, path });
	}

	$effect(() => {
		let alive = true;
		viewLoadError = null;
		if (mode === 'read') {
			editorApi = null;
			loadNotePreview()
				.then((component) => { if (alive) PreviewView = component; })
				.catch((e) => { if (alive) viewLoadError = e instanceof Error ? e.message : String(e); });
		} else {
			Promise.all([loadNoteEditor(), loadNoteToolbar()])
				.then(([editor, toolbar]) => {
					if (!alive) return;
					EditorView = editor;
					ToolbarView = toolbar;
				})
				.catch((e) => { if (alive) viewLoadError = e instanceof Error ? e.message : String(e); });
		}
		return () => { alive = false; };
	});

	$effect(() => {
		if (!doc || !editorApi || mode === 'read') return;
		return registerActivePluginEditor({
			vaultId,
			paneId,
			tabId,
			notePath: path,
			doc,
			editor: editorApi
		});
	});

	let lastAnchorJumpKey = $state('');
	$effect(() => {
		if (!doc) return;
		const hash = currentLocationHashId();
		if (!hash) return;
		if (mode !== 'read' && !editorApi) return;
		const key = `${vaultId}:${path}:${mode}:${hash}:${editorApi ? 'editor' : 'preview'}`;
		if (key === lastAnchorJumpKey) return;
		setTimeout(() => {
			if (jumpToHeading(hash)) lastAnchorJumpKey = key;
		}, 0);
	});

</script>

<div class="note-view">
	<NoteTopBar
		{path}
		{wordCount}
		{readingTime}
		{mode}
		{saving}
		{dirty}
		{savedAt}
		{err}
		{isConflict}
		{onModeChange}
		onReload={reloadFromDisk}
		onHistory={openHistory}
		onSave={save}
	/>

	<NoteBody
		{vaultId}
		{doc}
		{mode}
		{linkStyle}
		{showLineNumbers}
		{content}
		{editorApi}
		{uploadingAttachments}
		{EditorView}
		{PreviewView}
		{ToolbarView}
		{viewLoadError}
		{waitingForEditor}
		{waitingForPreview}
		{resolveLink}
		onContentChange={onContentChange}
		onSave={save}
		onWikilinkClick={handleWikilinkClick}
		onWikilinkContext={handleWikilinkContext}
		onFilesInsert={handleAttachmentFiles}
		onEditorReady={(api: EditorApi) => (editorApi = api)}
		onAttachExisting={() => (attachmentPickerOpen = true)}
	/>
</div>

{#if menuOpen}
	<ContextMenu items={menuItems} pos={menuPos} onClose={() => (menuOpen = false)} />
{/if}

{#if attachmentPickerOpen}
	<AttachmentPicker
		{vaultId}
		onInsert={insertExistingAttachments}
		onClose={() => (attachmentPickerOpen = false)}
	/>
{/if}

<style>
	.note-view { display: flex; flex-direction: column; height: 100%; min-height: 0; }
</style>
