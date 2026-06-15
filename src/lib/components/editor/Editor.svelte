<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
	import { EditorState, type Extension, Compartment } from '@codemirror/state';
	import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
	import { markdown } from '@codemirror/lang-markdown';
	import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
	import { foldGutter, foldKeymap, syntaxHighlighting, HighlightStyle } from '@codemirror/language';
	import { tags } from '@lezer/highlight';
	import { livePreview, type LinkResolver } from '$lib/editor/live-preview';
	import { makeEditorApi, type EditorApi } from '$lib/editor/commands';

	interface Props {
		value: string;
		/** 'live' renders inline (Obsidian-style); 'source' shows raw markdown. */
		mode?: 'live' | 'source';
		showLineNumbers?: boolean;
		spellcheck?: boolean;
		tabSize?: number;
		readableLineLength?: boolean;
		folding?: boolean;
		resolveLink?: LinkResolver;
		onChange?: (v: string) => void;
		onSave?: () => void;
		/** Called when a wikilink pill is clicked. Target is the resolved href. */
		onWikilinkClick?: (target: string, href: string | null, resolved: boolean, e: MouseEvent) => void;
		/** Called when a wikilink pill is right-clicked. */
		onWikilinkContext?: (target: string, href: string | null, resolved: boolean, e: MouseEvent) => void;
		/** Called when dropped or pasted files should be inserted as vault attachments. */
		onFilesInsert?: (files: File[]) => void | Promise<void>;
		/** Called once after the editor mounts, giving the parent an API handle. */
		onReady?: (api: EditorApi) => void;
	}

	let {
		value,
		mode = 'live',
		showLineNumbers = true,
		spellcheck = false,
		tabSize = 4,
		readableLineLength = false,
		folding = false,
		resolveLink = (t: string) => ({ resolved: true, href: undefined }),
		onChange,
		onSave,
		onWikilinkClick,
		onWikilinkContext,
		onFilesInsert,
		onReady
	}: Props = $props();

	let host: HTMLElement;
	let view: EditorView | null = null;
	let lastExternal = $state('');
	let dragDepth = $state(0);
	let suppressNextWikilinkClick = false;
	const previewCompartment = new Compartment();
	const lineNumberCompartment = new Compartment();
	const contentAttributeCompartment = new Compartment();
	const tabSizeCompartment = new Compartment();
	const foldingCompartment = new Compartment();
	const foldKeymapCompartment = new Compartment();

	interface WikilinkWidgetEventDetail {
		target: string;
		href: string | null;
		resolved: boolean;
		mouseEvent: MouseEvent;
	}

	const highlightStyle = HighlightStyle.define([
		{ tag: tags.heading1, fontSize: '1.8em', fontWeight: '800', color: 'var(--fg)' },
		{ tag: tags.heading2, fontSize: '1.5em', fontWeight: '700', color: 'var(--fg)' },
		{ tag: tags.heading3, fontSize: '1.25em', fontWeight: '700', color: 'var(--fg)' },
		{ tag: tags.heading4, fontSize: '1.1em', fontWeight: '700', color: 'var(--fg)' },
		{ tag: tags.heading5, fontSize: '1.05em', fontWeight: '700', color: 'var(--fg)' },
		{ tag: tags.heading6, fontSize: '1em', fontWeight: '700', color: 'var(--fg)' },
		{ tag: tags.strong, fontWeight: '700' },
		{ tag: tags.emphasis, fontStyle: 'italic' },
		{ tag: tags.link, color: 'var(--link)' },
		{ tag: tags.url, color: 'var(--link)' },
		{ tag: tags.monospace, color: 'var(--accent)', fontFamily: 'var(--mono)' },
		{ tag: tags.meta, color: 'var(--fg-dim)' },
		{ tag: tags.quote, color: 'var(--fg-muted)', fontStyle: 'italic' },
		{ tag: tags.list, color: 'var(--fg)' }
	]);

	function previewExtension(m: 'live' | 'source'): Extension {
		return m === 'live' ? livePreview(resolveLink) : [];
	}

	function lineNumberExtension(show: boolean): Extension {
		return show ? lineNumbers() : [];
	}

	function contentAttributeExtension(checkSpelling: boolean): Extension {
		return EditorView.contentAttributes.of({
			spellcheck: checkSpelling ? 'true' : 'false'
		});
	}

	function editorTabSizeExtension(size: number): Extension {
		const normalized = Number.isInteger(size) && size >= 1 && size <= 16 ? size : 4;
		return EditorState.tabSize.of(normalized);
	}

	function foldingExtension(enabled: boolean): Extension {
		return enabled ? foldGutter() : [];
	}

	function foldKeymapExtension(enabled: boolean): Extension {
		return enabled ? keymap.of(foldKeymap) : [];
	}

	function hasTransferFiles(data: DataTransfer | null): boolean {
		return !!data && (Array.from(data.types ?? []).includes('Files') || data.files.length > 0);
	}

	function transferFiles(data: DataTransfer | null): File[] {
		return data ? Array.from(data.files).filter((file) => file.size > 0) : [];
	}

	function handleFiles(files: File[]): void {
		if (!files.length) return;
		void onFilesInsert?.(files);
	}

	function handleEditorDragEnter(event: DragEvent): void {
		if (!hasTransferFiles(event.dataTransfer)) return;
		event.preventDefault();
		dragDepth += 1;
	}

	function handleEditorDragOver(event: DragEvent): void {
		if (!hasTransferFiles(event.dataTransfer)) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
	}

	function handleEditorDragLeave(event: DragEvent): void {
		if (!hasTransferFiles(event.dataTransfer)) return;
		dragDepth = Math.max(0, dragDepth - 1);
	}

	function handleEditorDrop(event: DragEvent): void {
		const files = transferFiles(event.dataTransfer);
		if (!files.length) return;
		event.preventDefault();
		event.stopPropagation();
		dragDepth = 0;
		handleFiles(files);
	}

	function handleEditorPaste(event: ClipboardEvent): void {
		const files = transferFiles(event.clipboardData);
		if (!files.length) return;
		event.preventDefault();
		handleFiles(files);
	}

	function readWikilinkWidgetEvent(event: Event): WikilinkWidgetEventDetail | null {
		const detail = (event as CustomEvent<WikilinkWidgetEventDetail>).detail;
		if (!detail || typeof detail.target !== 'string') return null;
		return detail;
	}

	function handleWikilinkWidgetClick(event: Event): void {
		const detail = readWikilinkWidgetEvent(event);
		if (!detail) return;
		onWikilinkClick?.(detail.target, detail.href, detail.resolved, detail.mouseEvent);
	}

	function handleWikilinkWidgetContext(event: Event): void {
		const detail = readWikilinkWidgetEvent(event);
		if (!detail) return;
		onWikilinkContext?.(detail.target, detail.href, detail.resolved, detail.mouseEvent);
	}

	onMount(() => {
		host.addEventListener('diamond-wikilink-click', handleWikilinkWidgetClick);
		host.addEventListener('diamond-wikilink-context', handleWikilinkWidgetContext);
		const extensions: Extension[] = [
			lineNumberCompartment.of(lineNumberExtension(showLineNumbers)),
			contentAttributeCompartment.of(contentAttributeExtension(spellcheck)),
			tabSizeCompartment.of(editorTabSizeExtension(tabSize)),
			foldingCompartment.of(foldingExtension(folding)),
			history(),
			highlightActiveLine(),
			highlightSelectionMatches(),
			markdown(),
			syntaxHighlighting(highlightStyle),
			previewCompartment.of(previewExtension(mode)),
			foldKeymapCompartment.of(foldKeymapExtension(folding)),
			keymap.of([
				...defaultKeymap,
				...historyKeymap,
				...searchKeymap,
				indentWithTab,
				{
					key: 'Mod-s',
					run: () => { onSave?.(); return true; }
				}
			]),
			EditorView.lineWrapping,
			EditorView.updateListener.of((update) => {
				if (update.docChanged) {
					const v = update.state.doc.toString();
					lastExternal = v;
					onChange?.(v);
				}
			}),
			EditorView.domEventHandlers({
				mousedown(event) {
					if (event.button !== 0) return false;
					const target = event.target as HTMLElement | null;
					if (!target) return false;
					const link = target.closest<HTMLAnchorElement>('[data-diamond-wikilink]');
					if (!link) return false;
					event.preventDefault();
					suppressNextWikilinkClick = true;
					const href = link.getAttribute('href');
					const tgt = link.dataset.target ?? '';
					onWikilinkClick?.(tgt, href, !link.classList.contains('cm-wikilink--broken'), event);
					return true;
				},
				click(event) {
					const target = event.target as HTMLElement | null;
					if (!target) return false;
					const link = target.closest<HTMLAnchorElement>('[data-diamond-wikilink]');
					if (!link) return false;
					event.preventDefault();
					if (suppressNextWikilinkClick) {
						suppressNextWikilinkClick = false;
						return true;
					}
					const href = link.getAttribute('href');
					const tgt = link.dataset.target ?? '';
					onWikilinkClick?.(tgt, href, !link.classList.contains('cm-wikilink--broken'), event);
					return true;
				},
				auxclick(event) {
					if (event.button !== 1) return false; // middle-click
					const target = event.target as HTMLElement | null;
					if (!target) return false;
					const link = target.closest<HTMLAnchorElement>('[data-diamond-wikilink]');
					if (!link) return false;
					event.preventDefault();
					const href = link.getAttribute('href');
					const tgt = link.dataset.target ?? '';
					onWikilinkClick?.(tgt, href, !link.classList.contains('cm-wikilink--broken'), event);
					return true;
				},
				contextmenu(event) {
					const target = event.target as HTMLElement | null;
					if (!target) return false;
					const link = target.closest<HTMLAnchorElement>('[data-diamond-wikilink]');
					if (!link) return false;
					event.preventDefault();
					const href = link.getAttribute('href');
					const tgt = link.dataset.target ?? '';
					onWikilinkContext?.(tgt, href, !link.classList.contains('cm-wikilink--broken'), event);
					return true;
				}
			}),
			EditorView.theme(
				{
					'&': { height: '100%', fontSize: '15px', color: 'var(--fg)' },
					'.cm-scroller': { fontFamily: 'var(--sans)', lineHeight: '1.7' },
					'.cm-content': { caretColor: 'var(--accent)', padding: '24px 0', maxWidth: '760px', margin: '0 auto' },
					'.cm-focused': { outline: 'none' },
					'&.cm-focused .cm-cursor': { borderLeftColor: 'var(--accent)' },
					'.cm-gutters': { background: 'transparent', color: 'var(--fg-dim)', border: 'none', paddingRight: '8px' },
					'.cm-activeLine': { background: 'transparent' },
					'.cm-activeLineGutter': { background: 'transparent' },
					'.cm-selectionBackground': { background: 'var(--bg-hover) !important' },
					'&.cm-focused .cm-selectionBackground': { background: 'rgba(255, 203, 107, 0.18) !important' },
					'.cm-wikilink': {
						color: 'var(--link)',
						background: 'rgba(121, 192, 255, 0.08)',
						padding: '0 6px',
						borderRadius: '4px',
						textDecoration: 'none',
						cursor: 'pointer'
					},
					'.cm-wikilink--broken': {
						color: 'var(--link-broken)',
						background: 'rgba(248, 81, 73, 0.08)',
						fontStyle: 'italic'
					},
					'.cm-obsidian-highlight': {
						background: 'rgba(255, 213, 79, 0.28)',
						color: 'var(--fg)',
						borderRadius: '3px',
						padding: '0 2px'
					}
				},
				{ dark: true }
			)
		];

		view = new EditorView({
			state: EditorState.create({ doc: value, extensions }),
			parent: host
		});

		if (onReady) onReady(makeEditorApi(() => view));
	});

	onDestroy(() => {
		host?.removeEventListener('diamond-wikilink-click', handleWikilinkWidgetClick);
		host?.removeEventListener('diamond-wikilink-context', handleWikilinkWidgetContext);
		view?.destroy();
		view = null;
	});

	// External value swap (e.g. nav to a different note).
	$effect(() => {
		if (!view) return;
		if (value !== lastExternal && value !== view.state.doc.toString()) {
			view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
			lastExternal = value;
		}
	});

	// Mode toggle at runtime.
	$effect(() => {
		if (!view) return;
		view.dispatch({ effects: previewCompartment.reconfigure(previewExtension(mode)) });
	});

	$effect(() => {
		if (!view) return;
		view.dispatch({ effects: lineNumberCompartment.reconfigure(lineNumberExtension(showLineNumbers)) });
	});

	$effect(() => {
		if (!view) return;
		view.dispatch({ effects: contentAttributeCompartment.reconfigure(contentAttributeExtension(spellcheck)) });
	});

	$effect(() => {
		if (!view) return;
		view.dispatch({ effects: tabSizeCompartment.reconfigure(editorTabSizeExtension(tabSize)) });
	});

	$effect(() => {
		if (!view) return;
		view.dispatch({
			effects: [
				foldingCompartment.reconfigure(foldingExtension(folding)),
				foldKeymapCompartment.reconfigure(foldKeymapExtension(folding))
			]
		});
	});
</script>

<div
	bind:this={host}
	class="editor"
	class:drop-active={dragDepth > 0}
	class:readable-line-length={readableLineLength}
	role="region"
	aria-label="Markdown editor attachment drop zone"
	ondragenter={handleEditorDragEnter}
	ondragover={handleEditorDragOver}
	ondragleave={handleEditorDragLeave}
	ondrop={handleEditorDrop}
	onpaste={handleEditorPaste}
>
	{#if dragDepth > 0}
		<div class="editor-drop-overlay">Drop to attach</div>
	{/if}
</div>

<style>
	.editor {
		height: 100%;
		background: var(--bg);
		overflow: hidden;
		position: relative;
	}
	.editor.drop-active {
		outline: 2px dashed var(--accent);
		outline-offset: -6px;
	}
	.editor-drop-overlay {
		position: absolute;
		inset: 10px;
		z-index: 5;
		display: grid;
		place-items: center;
		border: 1px solid var(--accent);
		border-radius: 8px;
		background: rgba(10, 17, 28, 0.72);
		color: var(--fg);
		font-weight: 700;
		pointer-events: none;
	}
	.editor :global(.cm-editor) {
		height: 100%;
	}
	.editor :global(.cm-line) {
		padding: 0 16px;
	}
	.editor.readable-line-length :global(.cm-content) {
		box-sizing: border-box;
		max-width: 820px;
		margin: 0 auto;
	}
	.editor.readable-line-length :global(.cm-line) {
		max-width: 820px;
	}
</style>
