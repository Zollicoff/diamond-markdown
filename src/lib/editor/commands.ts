/**
 * EditorApi — the surface a toolbar (or any external controller) uses
 * to manipulate the CodeMirror document from outside the Editor.
 *
 * All methods focus the editor before dispatching, and dispatch via
 * the view so undo history stays correct.
 */

import type { EditorView } from '@codemirror/view';

export interface EditorApi {
	/** Wrap the current selection in prefix/suffix (e.g. '**' / '**'). */
	wrap(prefix: string, suffix?: string): void;
	/** Prepend `text` to each selected line (e.g. '- ', '> ', '# '). */
	prependLines(text: string): void;
	/** Toggle a heading level at the current line (1-6). Level 0 removes heading. */
	toggleHeading(level: 1 | 2 | 3 | 4 | 5 | 6): void;
	/** Insert text at the current cursor; replaces selection if any. */
	insert(text: string): void;
	/** Insert a template body. If the body contains the literal string
	 *  `{{cursor}}` the marker is stripped and the caret lands at that
	 *  spot; otherwise behaves like `insert`. */
	insertTemplate(text: string): void;
	/** Insert a wikilink `[[target]]` (uses selection as target if any). */
	insertWikilink(): void;
	/** Insert a fenced code block, preserving the selection as the body. */
	insertCodeBlock(lang?: string): void;
	focus(): void;
}

export function makeEditorApi(getView: () => EditorView | null): EditorApi {
	const withView = (fn: (view: EditorView) => void): void => {
		const view = getView();
		if (!view) return;
		fn(view);
		view.focus();
	};

	return {
		wrap(prefix: string, suffix = prefix) {
			withView((view) => {
				const { from, to } = view.state.selection.main;
				const sel = view.state.sliceDoc(from, to);
				// If the selection is already wrapped, unwrap (toggle behavior).
				if (
					sel.startsWith(prefix) &&
					sel.endsWith(suffix) &&
					sel.length >= prefix.length + suffix.length
				) {
					const unwrapped = sel.slice(prefix.length, sel.length - suffix.length);
					view.dispatch({
						changes: { from, to, insert: unwrapped },
						selection: { anchor: from, head: from + unwrapped.length }
					});
					return;
				}
				view.dispatch({
					changes: { from, to, insert: prefix + sel + suffix },
					selection: {
						anchor: from + prefix.length,
						head: from + prefix.length + sel.length
					}
				});
			});
		},

		prependLines(text: string) {
			withView((view) => {
				const { from, to } = view.state.selection.main;
				const startLine = view.state.doc.lineAt(from).number;
				const endLine = view.state.doc.lineAt(to).number;
				const changes: { from: number; insert: string }[] = [];
				for (let ln = startLine; ln <= endLine; ln++) {
					const line = view.state.doc.line(ln);
					// Toggle: if already prefixed, strip it.
					if (line.text.startsWith(text)) {
						changes.push({ from: line.from, insert: '' });
						// actually need a removal; use from/to
						changes.pop();
						view.dispatch({
							changes: { from: line.from, to: line.from + text.length, insert: '' }
						});
						continue;
					}
					changes.push({ from: line.from, insert: text });
				}
				if (changes.length) view.dispatch({ changes });
			});
		},

		toggleHeading(level) {
			withView((view) => {
				const { from } = view.state.selection.main;
				const line = view.state.doc.lineAt(from);
				const match = line.text.match(/^(#{1,6})\s/);
				const marker = '#'.repeat(level) + ' ';
				if (match) {
					// Replace existing marker with the new one, OR strip if same level.
					if (match[1].length === level) {
						view.dispatch({
							changes: { from: line.from, to: line.from + match[0].length, insert: '' }
						});
					} else {
						view.dispatch({
							changes: { from: line.from, to: line.from + match[0].length, insert: marker }
						});
					}
				} else {
					view.dispatch({ changes: { from: line.from, insert: marker } });
				}
			});
		},

		insert(text) {
			withView((view) => {
				const { from, to } = view.state.selection.main;
				view.dispatch({
					changes: { from, to, insert: text },
					selection: { anchor: from + text.length }
				});
			});
		},

		insertTemplate(text) {
			withView((view) => {
				const { from, to } = view.state.selection.main;
				const marker = '{{cursor}}';
				const idx = text.indexOf(marker);
				const stripped = idx >= 0
					? text.slice(0, idx) + text.slice(idx + marker.length)
					: text;
				const cursorAt = idx >= 0 ? from + idx : from + stripped.length;
				view.dispatch({
					changes: { from, to, insert: stripped },
					selection: { anchor: cursorAt }
				});
			});
		},

		insertWikilink() {
			withView((view) => {
				const { from, to } = view.state.selection.main;
				const sel = view.state.sliceDoc(from, to);
				if (sel) {
					view.dispatch({
						changes: { from, to, insert: `[[${sel}]]` },
						selection: { anchor: from + 2, head: from + 2 + sel.length }
					});
				} else {
					view.dispatch({
						changes: { from, insert: '[[]]' },
						selection: { anchor: from + 2 }
					});
				}
			});
		},

		insertCodeBlock(lang = '') {
			withView((view) => {
				const { from, to } = view.state.selection.main;
				const sel = view.state.sliceDoc(from, to);
				const body = sel || '';
				const snippet = `\n\`\`\`${lang}\n${body}\n\`\`\`\n`;
				view.dispatch({
					changes: { from, to, insert: snippet },
					selection: { anchor: from + 4 + lang.length + 1, head: from + 4 + lang.length + 1 + body.length }
				});
			});
		},

		focus() {
			const view = getView();
			view?.focus();
		}
	};
}
