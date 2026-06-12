import type { EditorLinkStyle } from '$lib/types';

export interface LinkInsertion {
	text: string;
	anchorOffset: number;
	headOffset: number;
}

export interface LinkToolbarButton {
	icon: string;
	title: string;
}

export function linkToolbarButton(style: EditorLinkStyle): LinkToolbarButton {
	return style === 'markdown'
		? { icon: '[]()', title: 'Markdown link' }
		: { icon: '[[ ]]', title: 'Wikilink' };
}

export function linkInsertion(selection: string, style: EditorLinkStyle): LinkInsertion {
	if (style === 'markdown') {
		if (selection) {
			return {
				text: `[${selection}]()`,
				anchorOffset: selection.length + 3,
				headOffset: selection.length + 3
			};
		}
		return { text: '[]()', anchorOffset: 1, headOffset: 1 };
	}

	if (selection) {
		return {
			text: `[[${selection}]]`,
			anchorOffset: 2,
			headOffset: selection.length + 2
		};
	}
	return { text: '[[]]', anchorOffset: 2, headOffset: 2 };
}
