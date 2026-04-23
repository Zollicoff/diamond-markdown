<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
	import { EditorState, type Extension, Compartment } from '@codemirror/state';
	import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
	import { markdown } from '@codemirror/lang-markdown';
	import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
	import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
	import { tags } from '@lezer/highlight';
	import { livePreview, type LinkResolver } from '$lib/editor/live-preview';
	import { makeEditorApi, type EditorApi } from '$lib/editor/commands';

	interface Props {
		value: string;
		/** 'live' renders inline (Obsidian-style); 'source' shows raw markdown. */
		mode?: 'live' | 'source';
		resolveLink?: LinkResolver;
		onChange?: (v: string) => void;
		onSave?: () => void;
		/** Called when a wikilink pill is clicked. Target is the resolved href. */
		onWikilinkClick?: (target: string, href: string | null, resolved: boolean) => void;
		/** Called once after the editor mounts, giving the parent an API handle. */
		onReady?: (api: EditorApi) => void;
	}

	let {
		value,
		mode = 'live',
		resolveLink = (t: string) => ({ resolved: true, href: undefined }),
		onChange,
		onSave,
		onWikilinkClick,
		onReady
	}: Props = $props();

	let host: HTMLElement;
	let view: EditorView | null = null;
	let lastExternal = value;
	const previewCompartment = new Compartment();

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

	onMount(() => {
		const extensions: Extension[] = [
			lineNumbers(),
			history(),
			highlightActiveLine(),
			highlightSelectionMatches(),
			markdown(),
			syntaxHighlighting(highlightStyle),
			previewCompartment.of(previewExtension(mode)),
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
				click(event) {
					const target = event.target as HTMLElement | null;
					if (!target) return false;
					const link = target.closest<HTMLAnchorElement>('[data-diamond-wikilink]');
					if (!link) return false;
					event.preventDefault();
					const href = link.getAttribute('href');
					const tgt = link.dataset.target ?? '';
					onWikilinkClick?.(tgt, href, !link.classList.contains('cm-wikilink--broken'));
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
</script>

<div bind:this={host} class="editor"></div>

<style>
	.editor {
		height: 100%;
		background: var(--bg);
		overflow: hidden;
	}
	.editor :global(.cm-editor) {
		height: 100%;
	}
	.editor :global(.cm-line) {
		padding: 0 16px;
	}
</style>
