export type SearchHighlightField = 'title' | 'path' | 'snippet';

export interface SearchHighlightPart {
	text: string;
	match: boolean;
}

interface SearchHighlightTerm {
	field: 'all' | 'file' | 'path' | 'content';
	value: string;
	lower: string;
}

export function searchHighlightParts(
	text: string,
	query: string,
	field: SearchHighlightField
): SearchHighlightPart[] {
	if (!text) return [];
	const terms = activeHighlightTerms(query, field);
	if (terms.length === 0) return [{ text, match: false }];

	const lower = text.toLowerCase();
	const parts: SearchHighlightPart[] = [];
	let index = 0;
	while (index < text.length) {
		const next = nextHighlightMatch(lower, terms, index);
		if (!next) {
			parts.push({ text: text.slice(index), match: false });
			break;
		}
		if (next.index > index) parts.push({ text: text.slice(index, next.index), match: false });
		parts.push({ text: text.slice(next.index, next.index + next.length), match: true });
		index = next.index + next.length;
	}
	return mergeAdjacentSearchHighlightParts(parts);
}

export function searchHighlightTerms(query: string, field: SearchHighlightField): string[] {
	return activeHighlightTerms(query, field).map((term) => term.value);
}

function activeHighlightTerms(query: string, displayField: SearchHighlightField): SearchHighlightTerm[] {
	const seen = new Set<string>();
	const terms: SearchHighlightTerm[] = [];
	for (const token of tokenizeSearchHighlightQuery(query)) {
		if (!token.quoted && token.raw === 'OR') continue;
		const term = searchHighlightTermFromToken(token);
		if (!term || !termAppliesToField(term.field, displayField)) continue;
		const key = term.lower;
		if (seen.has(key)) continue;
		seen.add(key);
		terms.push(term);
		if (terms.length >= 12) break;
	}
	return terms.sort((a, b) => b.value.length - a.value.length);
}

function searchHighlightTermFromToken(token: { raw: string; quoted: boolean }): SearchHighlightTerm | null {
	let raw = token.raw.trim();
	if (!raw) return null;
	if (raw.startsWith('-') && raw.length > 1) return null;
	const fieldMatch = raw.match(/^([A-Za-z][\w-]*):(.*)$/);
	const field = normalizeHighlightField(fieldMatch?.[1]);
	if (field === 'tag') return null;
	const value = (field ? fieldMatch?.[2] ?? '' : raw).replace(/\s+/g, ' ').trim();
	if (!value || looksLikeRegexSearchTerm(value)) return null;
	return {
		field: field ?? 'all',
		value,
		lower: value.toLowerCase()
	};
}

function normalizeHighlightField(field: string | undefined): SearchHighlightTerm['field'] | 'tag' | null {
	switch (field?.toLowerCase()) {
		case 'tag':
			return 'tag';
		case 'path':
			return 'path';
		case 'file':
		case 'title':
		case 'name':
			return 'file';
		case 'content':
		case 'body':
			return 'content';
		default:
			return null;
	}
}

function termAppliesToField(termField: SearchHighlightTerm['field'], displayField: SearchHighlightField): boolean {
	if (termField === 'all') return true;
	if (termField === 'file') return displayField === 'title';
	if (termField === 'path') return displayField === 'path';
	return displayField === 'snippet';
}

function tokenizeSearchHighlightQuery(input: string): { raw: string; quoted: boolean }[] {
	const tokens: { raw: string; quoted: boolean }[] = [];
	let i = 0;
	while (i < input.length) {
		while (i < input.length && /\s/.test(input[i])) i += 1;
		let raw = '';
		let quoted = false;
		let quote: string | null = null;
		while (i < input.length) {
			const char = input[i];
			if (quote) {
				if (char === quote) {
					quote = null;
					i += 1;
					continue;
				}
				if (char === '\\' && i + 1 < input.length) {
					raw += input[i + 1];
					i += 2;
					continue;
				}
				raw += char;
				i += 1;
				continue;
			}
			if (char === '"' || char === "'") {
				quoted = true;
				quote = char;
				i += 1;
				continue;
			}
			if (char === '/' && shouldReadRegexSearchToken(raw)) {
				const regex = readRegexSearchToken(input, i);
				if (regex) {
					raw += regex.raw;
					i = regex.next;
					continue;
				}
			}
			if (/\s/.test(char)) break;
			raw += char;
			i += 1;
		}
		if (raw.trim()) tokens.push({ raw: raw.trim(), quoted });
	}
	return tokens;
}

function shouldReadRegexSearchToken(raw: string): boolean {
	return raw === '' || /^-?[A-Za-z][\w-]*:$/.test(raw);
}

function readRegexSearchToken(input: string, start: number): { raw: string; next: number } | null {
	let i = start + 1;
	let escaped = false;
	while (i < input.length) {
		const char = input[i];
		if (escaped) {
			escaped = false;
			i += 1;
			continue;
		}
		if (char === '\\') {
			escaped = true;
			i += 1;
			continue;
		}
		if (char === '/') {
			i += 1;
			while (i < input.length && /[A-Za-z]/.test(input[i])) i += 1;
			return { raw: input.slice(start, i), next: i };
		}
		i += 1;
	}
	return null;
}

function looksLikeRegexSearchTerm(value: string): boolean {
	return value.trim().startsWith('/');
}

function nextHighlightMatch(
	lowerText: string,
	terms: SearchHighlightTerm[],
	fromIndex: number
): { index: number; length: number } | null {
	let best: { index: number; length: number } | null = null;
	for (const term of terms) {
		const index = lowerText.indexOf(term.lower, fromIndex);
		if (index < 0) continue;
		if (!best || index < best.index || (index === best.index && term.value.length > best.length)) {
			best = { index, length: term.value.length };
		}
	}
	return best;
}

function mergeAdjacentSearchHighlightParts(parts: SearchHighlightPart[]): SearchHighlightPart[] {
	const merged: SearchHighlightPart[] = [];
	for (const part of parts) {
		if (!part.text) continue;
		const previous = merged.at(-1);
		if (previous && previous.match === part.match) {
			previous.text += part.text;
		} else {
			merged.push({ ...part });
		}
	}
	return merged;
}
