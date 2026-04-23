<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
	import { EditorState, type Extension } from '@codemirror/state';
	import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
	import { markdown } from '@codemirror/lang-markdown';
	import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
	import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
	import { tags } from '@lezer/highlight';

	interface Props {
		value: string;
		onChange?: (v: string) => void;
		onSave?: () => void;
	}

	let { value, onChange, onSave }: Props = $props();

	let host: HTMLElement;
	let view: EditorView | null = null;
	let lastExternal = value;

	const highlightStyle = HighlightStyle.define([
		{ tag: tags.heading1, fontSize: '1.55em', fontWeight: '800', color: 'var(--fg)' },
		{ tag: tags.heading2, fontSize: '1.35em', fontWeight: '700', color: 'var(--fg)' },
		{ tag: tags.heading3, fontSize: '1.18em', fontWeight: '700', color: 'var(--fg)' },
		{ tag: tags.heading4, fontSize: '1.05em', fontWeight: '700', color: 'var(--fg)' },
		{ tag: tags.strong, fontWeight: '700' },
		{ tag: tags.emphasis, fontStyle: 'italic' },
		{ tag: tags.link, color: 'var(--link)' },
		{ tag: tags.url, color: 'var(--link)' },
		{ tag: tags.monospace, color: 'var(--accent)', fontFamily: 'var(--mono)' },
		{ tag: tags.meta, color: 'var(--fg-dim)' },
		{ tag: tags.quote, color: 'var(--fg-muted)', fontStyle: 'italic' },
		{ tag: tags.list, color: 'var(--fg)' }
	]);

	onMount(() => {
		const extensions: Extension[] = [
			lineNumbers(),
			history(),
			highlightActiveLine(),
			highlightSelectionMatches(),
			markdown(),
			syntaxHighlighting(highlightStyle),
			keymap.of([
				...defaultKeymap,
				...historyKeymap,
				...searchKeymap,
				indentWithTab,
				{
					key: 'Mod-s',
					run: () => {
						onSave?.();
						return true;
					}
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
			EditorView.theme(
				{
					'&': { height: '100%', fontSize: '14px', color: 'var(--fg)' },
					'.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.6' },
					'.cm-content': { caretColor: 'var(--accent)', padding: '8px 0' },
					'.cm-focused': { outline: 'none' },
					'&.cm-focused .cm-cursor': { borderLeftColor: 'var(--accent)' },
					'.cm-gutters': { background: 'var(--bg-elev)', color: 'var(--fg-dim)', border: 'none', paddingRight: '8px' },
					'.cm-activeLine': { background: 'rgba(255, 203, 107, 0.04)' },
					'.cm-activeLineGutter': { background: 'rgba(255, 203, 107, 0.05)' },
					'.cm-selectionBackground': { background: 'var(--bg-hover) !important' },
					'&.cm-focused .cm-selectionBackground': { background: 'rgba(255, 203, 107, 0.18) !important' }
				},
				{ dark: true }
			)
		];

		view = new EditorView({
			state: EditorState.create({ doc: value, extensions }),
			parent: host
		});
	});

	onDestroy(() => {
		view?.destroy();
		view = null;
	});

	// Keep the editor in sync when value is swapped out externally (e.g. nav to new note).
	$effect(() => {
		if (!view) return;
		if (value !== lastExternal && value !== view.state.doc.toString()) {
			view.dispatch({
				changes: { from: 0, to: view.state.doc.length, insert: value }
			});
			lastExternal = value;
		}
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
</style>
