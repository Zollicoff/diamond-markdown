/**
 * Obsidian-style live preview for CodeMirror 6.
 *
 * Hides markdown syntax markers when the cursor is off-line and replaces
 * [[wikilinks]] with styled pill widgets. Headings stay visually big (the
 * existing syntaxHighlighting tag styles take care of that); we just hide
 * the `#` prefix when the caret isn't there.
 *
 * The pill widget rendered for a [[wikilink]] is a real <a> element — a
 * global click handler on the host can intercept it and route via
 * SvelteKit without a full page reload.
 */

import {
	Decoration,
	type DecorationSet,
	EditorView,
	ViewPlugin,
	type ViewUpdate,
	WidgetType
} from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { type Range } from '@codemirror/state';

/** Called for every [[target]] to tell us whether that note exists. */
export type LinkResolver = (target: string) => { resolved: boolean; href?: string };

class WikilinkWidget extends WidgetType {
	constructor(
		readonly target: string,
		readonly display: string,
		readonly resolved: boolean,
		readonly href: string | null
	) {
		super();
	}

	toDOM(): HTMLElement {
		const a = document.createElement('a');
		a.className = this.resolved ? 'cm-wikilink' : 'cm-wikilink cm-wikilink--broken';
		a.textContent = this.display;
		if (this.href) a.href = this.href;
		a.dataset.target = this.target;
		// Let CodeMirror ignore the mouse so the link click propagates.
		a.setAttribute('data-diamond-wikilink', '1');
		return a;
	}

	eq(other: WidgetType): boolean {
		return (
			other instanceof WikilinkWidget &&
			other.target === this.target &&
			other.display === this.display &&
			other.resolved === this.resolved
		);
	}

	ignoreEvent(): boolean {
		// false = CodeMirror does NOT eat the event; the click reaches the <a>.
		return false;
	}
}

const WIKILINK_RE = /\[\[([^\[\]|\n]+?)(?:#([^\[\]|\n]+?))?(?:\|([^\[\]\n]+?))?\]\]/g;

function buildDecorations(view: EditorView, resolveLink: LinkResolver): DecorationSet {
	const ranges: Range<Decoration>[] = [];
	const cursor = view.state.selection.main.head;
	const { state } = view;
	const doc = state.doc;

	// Does the caret sit somewhere inside [from..to]?
	const cursorInside = (from: number, to: number): boolean => cursor >= from && cursor <= to;

	// Walk the syntax tree in viewport for perf.
	for (const { from, to } of view.visibleRanges) {
		syntaxTree(state).iterate({
			from,
			to,
			enter(node) {
				const name = node.type.name;

				// Leave fenced code / code blocks entirely verbatim.
				if (name === 'FencedCode' || name === 'CodeBlock') {
					return false;
				}

				if (name === 'HeaderMark') {
					// `# ` prefix of an ATX heading. Hide when caret is not on the line.
					const line = doc.lineAt(node.from);
					if (cursor < line.from || cursor > line.to) {
						// Include trailing whitespace after the #
						const endOfMark = node.to < line.to && doc.sliceString(node.to, node.to + 1) === ' '
							? node.to + 1
							: node.to;
						ranges.push(Decoration.replace({}).range(node.from, endOfMark));
					}
					return;
				}

				if (name === 'EmphasisMark') {
					// Parent node is Emphasis / StrongEmphasis — hide the *, _, **
					// if caret is not inside that range.
					const parent = node.node.parent;
					if (parent && !cursorInside(parent.from, parent.to)) {
						ranges.push(Decoration.replace({}).range(node.from, node.to));
					}
					return;
				}

				if (name === 'CodeMark') {
					// InlineCode backticks
					const parent = node.node.parent;
					if (parent && parent.type.name === 'InlineCode' && !cursorInside(parent.from, parent.to)) {
						ranges.push(Decoration.replace({}).range(node.from, node.to));
					}
					return;
				}

				if (name === 'LinkMark') {
					// [ ] ( ) around markdown links. Hide if caret outside the containing Link.
					const parent = node.node.parent;
					if (parent && parent.type.name === 'Link' && !cursorInside(parent.from, parent.to)) {
						ranges.push(Decoration.replace({}).range(node.from, node.to));
					}
					return;
				}

				if (name === 'URL') {
					// The raw URL inside a Link. Hide when caret is not inside the link.
					const parent = node.node.parent;
					if (parent && parent.type.name === 'Link' && !cursorInside(parent.from, parent.to)) {
						ranges.push(Decoration.replace({}).range(node.from, node.to));
					}
					return;
				}
			}
		});
	}

	// Wikilink pills — scan viewport text (lezer-markdown doesn't know wikilinks).
	for (const { from: vFrom, to: vTo } of view.visibleRanges) {
		const text = doc.sliceString(vFrom, vTo);
		let m: RegExpExecArray | null;
		WIKILINK_RE.lastIndex = 0;
		while ((m = WIKILINK_RE.exec(text))) {
			const start = vFrom + m.index;
			const end = start + m[0].length;
			if (cursor >= start && cursor <= end) continue; // actively editing — leave raw
			const target = m[1].trim();
			const display = (m[3]?.trim() || target);
			const { resolved, href } = resolveLink(target);
			ranges.push(
				Decoration.replace({
					widget: new WikilinkWidget(target, display, resolved, href ?? null)
				}).range(start, end)
			);
		}
	}

	// Decoration.set sorts for us.
	return Decoration.set(ranges, true);
}

export function livePreview(resolveLink: LinkResolver) {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			constructor(view: EditorView) {
				this.decorations = buildDecorations(view, resolveLink);
			}
			update(update: ViewUpdate): void {
				if (
					update.docChanged ||
					update.selectionSet ||
					update.viewportChanged
				) {
					this.decorations = buildDecorations(update.view, resolveLink);
				}
			}
		},
		{
			decorations: (v) => v.decorations,
			provide: (plugin) =>
				EditorView.atomicRanges.of((view) => view.plugin(plugin)?.decorations || Decoration.none)
		}
	);
}
