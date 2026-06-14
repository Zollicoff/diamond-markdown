import type {
	MarkedExtension,
	Token,
	TokenizerAndRendererExtension,
	Tokens
} from 'marked';

interface ObsidianHighlightToken extends Tokens.Generic {
	type: 'obsidianHighlight';
	raw: string;
	text: string;
	tokens: Token[];
}

interface MarkedLike {
	use: (...args: MarkedExtension[]) => unknown;
}

const installed = new WeakSet<object>();

const obsidianHighlightExtension: TokenizerAndRendererExtension<string, string> = {
	name: 'obsidianHighlight',
	level: 'inline',
	start(src) {
		const index = src.indexOf('==');
		return index >= 0 ? index : undefined;
	},
	tokenizer(src) {
		const match = /^==(?!=)(?=\S)([^\n]*?\S)==(?![=])/.exec(src);
		if (!match) return undefined;
		const text = match[1];
		return {
			type: 'obsidianHighlight',
			raw: match[0],
			text,
			tokens: this.lexer.inlineTokens(text)
		} satisfies ObsidianHighlightToken;
	},
	renderer(token) {
		const highlight = token as ObsidianHighlightToken;
		return `<mark>${this.parser.parseInline(highlight.tokens)}</mark>`;
	},
	childTokens: ['tokens']
};

export function useObsidianMarkedExtensions(markedInstance: MarkedLike): void {
	if (installed.has(markedInstance)) return;
	markedInstance.use({ extensions: [obsidianHighlightExtension] });
	installed.add(markedInstance);
}
