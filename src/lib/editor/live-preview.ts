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
import { WIKILINK_RE } from '$lib/util/strings';
import { parseWikilinkSubpath, wikilinkFragment } from '$lib/markdown/wikilinks';

/** Called for every [[target]] to tell us whether that note exists. */
export type LinkResolver = (target: string) => { resolved: boolean; href?: string };

interface PreviewSpan {
	from: number;
	to: number;
}

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
		a.contentEditable = 'false';
		a.setAttribute('data-diamond-wikilink', '1');
		const dispatch = (event: MouseEvent, name: 'diamond-wikilink-click' | 'diamond-wikilink-context') => {
			event.preventDefault();
			event.stopPropagation();
			a.dispatchEvent(new CustomEvent(name, {
				bubbles: true,
				composed: true,
				detail: {
					target: this.target,
					href: this.href,
					resolved: this.resolved,
					mouseEvent: event
				}
			}));
		};
		a.addEventListener('mousedown', (event) => {
			if (event.button === 0) dispatch(event, 'diamond-wikilink-click');
		});
		a.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
		});
		a.addEventListener('auxclick', (event) => {
			if (event.button === 1) dispatch(event, 'diamond-wikilink-click');
		});
		a.addEventListener('contextmenu', (event) => dispatch(event, 'diamond-wikilink-context'));
		return a;
	}

	eq(other: WidgetType): boolean {
		return (
			other instanceof WikilinkWidget &&
			other.target === this.target &&
			other.display === this.display &&
			other.resolved === this.resolved &&
			other.href === this.href
		);
	}

	ignoreEvent(): boolean {
		// Keep CodeMirror from moving the caret into the raw wikilink before
		// the delegated link handler can route the click.
		return true;
	}
}

function spansOverlap(left: PreviewSpan, right: PreviewSpan): boolean {
	return left.from < right.to && right.from < left.to;
}

function containsSpan(spans: PreviewSpan[], from: number, to: number): boolean {
	for (const span of spans) {
		if (from >= span.from && to <= span.to) return true;
	}
	return false;
}

function overlapsSpan(spans: PreviewSpan[], from: number, to: number): boolean {
	const candidate = { from, to };
	for (const span of spans) {
		if (spansOverlap(candidate, span)) return true;
	}
	return false;
}

function collectCodeSpans(view: EditorView): PreviewSpan[] {
	const spans: PreviewSpan[] = [];
	syntaxTree(view.state).iterate({
		from: 0,
		to: view.state.doc.length,
		enter(node) {
			const name = node.type.name;
			if (name === 'FencedCode' || name === 'CodeBlock' || name === 'InlineCode') {
				spans.push({ from: node.from, to: node.to });
				return false;
			}
		}
	});
	return spans;
}

function collectObsidianCommentSpans(view: EditorView, codeSpans: PreviewSpan[]): PreviewSpan[] {
	const spans: PreviewSpan[] = [];
	const text = view.state.doc.toString();
	const commentRe = /%%[\s\S]*?%%/g;
	let match: RegExpExecArray | null;
	while ((match = commentRe.exec(text))) {
		const from = match.index;
		const to = from + match[0].length;
		if (overlapsSpan(codeSpans, from, to)) continue;
		spans.push({ from, to });
	}
	return spans;
}

function buildDecorations(view: EditorView, resolveLink: LinkResolver): DecorationSet {
	const ranges: Range<Decoration>[] = [];
	const cursor = view.state.selection.main.head;
	const { state } = view;
	const doc = state.doc;

	// Does the caret sit somewhere inside [from..to]?
	const cursorInside = (from: number, to: number): boolean => cursor >= from && cursor <= to;
	const codeSpans = collectCodeSpans(view);
	const commentSpans = collectObsidianCommentSpans(view, codeSpans);

	// Pre-pass: collect [[wikilink]] spans across the visible viewport.
	// lezer-markdown parses `[[Note]]` as a literal `[` + standard Link `[Note]`
	// + literal `]`, so the LinkMark/URL handlers below would hide the inner
	// brackets — leaving the outer pair visible as `[Note]`. We need to know
	// the wikilink spans first so those passes can skip anything inside them.
	const wikilinkSpans: Array<{ from: number; to: number; target: string; display: string; fragment: string }> = [];
	for (const { from: vFrom, to: vTo } of view.visibleRanges) {
		const text = doc.sliceString(vFrom, vTo);
		let m: RegExpExecArray | null;
		WIKILINK_RE.lastIndex = 0;
		while ((m = WIKILINK_RE.exec(text))) {
			const start = vFrom + m.index;
			const end = start + m[0].length;
			const target = m[1].trim();
			const subpath = parseWikilinkSubpath(m[2]);
			const display = (m[3]?.trim() || target);
			const fragment = wikilinkFragment(subpath);
			if (overlapsSpan(commentSpans, start, end)) continue;
			wikilinkSpans.push({ from: start, to: end, target, display, fragment });
		}
	}
	const insideWikilink = (from: number, to: number): boolean => {
		for (const w of wikilinkSpans) {
			if (from >= w.from && to <= w.to) return true;
		}
		return false;
	};

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

				// Skip anything that lezer parsed inside a [[wikilink]] — the
				// wikilink widget will own that whole range below. Returning
				// false prevents descent into children (the inner LinkMarks
				// that would otherwise hide the inner brackets, leaving the
				// outer pair visible as `[Note]`).
				if (insideWikilink(node.from, node.to)) return false;
				if (containsSpan(commentSpans, node.from, node.to)) return false;

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

	// Hide paired Obsidian `%%...%%` comments unless the caret is inside the
	// span, which keeps the raw text reachable for edits in Live mode.
	for (const comment of commentSpans) {
		if (cursorInside(comment.from, comment.to)) continue;
		ranges.push(Decoration.replace({}).range(comment.from, comment.to));
	}

	// Wikilink pills — replace each pre-collected span with a widget unless
	// the caret is inside it (then leave the raw `[[…]]` text for editing).
	for (const w of wikilinkSpans) {
		if (cursor >= w.from && cursor <= w.to) continue;
		const { resolved, href } = resolveLink(w.target);
		const hrefWithFragment = href ? `${href}${w.fragment}` : null;
		ranges.push(
			Decoration.replace({
				widget: new WikilinkWidget(w.target, w.display, resolved, hrefWithFragment)
			}).range(w.from, w.to)
		);
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
