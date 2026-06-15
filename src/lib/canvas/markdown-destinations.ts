export interface CanvasMarkdownInlineSyntax {
	index: number;
	raw: string;
	label: string;
	href: string;
}

export function canvasMarkdownLinkDestination(rawHref: string): string | null {
	const href = rawHref.trim();
	if (!href || /[\r\n]/.test(href)) return null;
	if (href.startsWith('<')) {
		const close = href.indexOf('>');
		if (close <= 1) return null;
		const destination = href.slice(1, close).trim();
		const title = href.slice(close + 1).trim();
		if (title && !canvasMarkdownOptionalTitle(title)) return null;
		return destination || null;
	}
	const titled = href.match(/^(.+?)\s+("[^"\n]*"|'[^'\n]*'|\([^()\n]*\))$/);
	return titled?.[1]?.trim() || href;
}

export function safeDecodeCanvasMarkdownUri(input: string): string {
	try {
		return decodeURI(input);
	} catch {
		return input;
	}
}

export function canvasMarkdownInlineSyntaxCandidate(
	value: string,
	image: boolean,
	start = 0
): CanvasMarkdownInlineSyntax | null {
	const opener = image ? '![' : '[';
	let searchIndex = start;
	while (searchIndex < value.length) {
		const index = value.indexOf(opener, searchIndex);
		if (index < 0) return null;
		if (!image && index > 0 && value[index - 1] === '!') {
			searchIndex = index + 1;
			continue;
		}
		const labelStart = index + opener.length;
		const labelEnd = markdownClosingBracket(value, labelStart);
		if (labelEnd < 0 || value[labelEnd + 1] !== '(') {
			searchIndex = index + 1;
			continue;
		}
		const hrefStart = labelEnd + 2;
		const hrefEnd = markdownClosingParen(value, hrefStart);
		if (hrefEnd < 0) {
			searchIndex = index + 1;
			continue;
		}
		return {
			index,
			raw: value.slice(index, hrefEnd + 1),
			label: value.slice(labelStart, labelEnd),
			href: value.slice(hrefStart, hrefEnd)
		};
	}
	return null;
}

function canvasMarkdownOptionalTitle(value: string): boolean {
	return /^"[^"\n]*"$/.test(value) || /^'[^'\n]*'$/.test(value) || /^\([^()\n]*\)$/.test(value);
}

function markdownClosingBracket(value: string, start: number): number {
	for (let index = start; index < value.length; index += 1) {
		const char = value[index];
		if (char === '\n' || char === '\r') return -1;
		if (char === '\\') {
			index += 1;
			continue;
		}
		if (char === ']') return index;
	}
	return -1;
}

function markdownClosingParen(value: string, start: number): number {
	let depth = 0;
	let inAngleDestination = false;
	let quote: '"' | "'" | null = null;
	for (let index = start; index < value.length; index += 1) {
		const char = value[index];
		if (char === '\n' || char === '\r') return -1;
		if (char === '\\') {
			index += 1;
			continue;
		}
		if (quote) {
			if (char === quote) quote = null;
			continue;
		}
		if (inAngleDestination) {
			if (char === '>') inAngleDestination = false;
			continue;
		}
		if (char === '<') {
			inAngleDestination = true;
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}
		if (char === '(') {
			depth += 1;
			continue;
		}
		if (char === ')') {
			if (depth === 0) return index;
			depth -= 1;
		}
	}
	return -1;
}
