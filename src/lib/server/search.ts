import type { SearchHit, SearchResponse } from '$lib/types';
import type { NoteMeta, VaultIndex } from './indexer';

export const DEFAULT_TITLE_SEARCH_LIMIT = 25;
export const DEFAULT_FULL_TEXT_SEARCH_LIMIT = 50;
export const MAX_SEARCH_LIMIT = 200;

interface RankedHit extends SearchHit {
	rank: number;
	firstIndex: number;
}

type SearchField = 'all' | 'tag' | 'path' | 'file' | 'content';
type SearchMatcher = 'literal' | 'regex';

interface SearchTerm {
	field: SearchField;
	matcher: SearchMatcher;
	value: string;
	lower: string;
	negative: boolean;
	quoted: boolean;
	regex?: RegExp;
}

interface QueryParts {
	raw: string;
	terms: SearchTerm[];
	positiveTerms: SearchTerm[];
	negativeTerms: SearchTerm[];
	positiveGroups: SearchTerm[][];
}

interface TermScore {
	matched: boolean;
	rank: number;
	firstIndex: number;
	bodyIndex: number;
	length: number;
}

interface GroupScore {
	rank: number;
	firstIndex: number;
	bodyIndex: number;
	bodyLength: number;
}

export function clampSearchLimit(raw: string | null, fallback: number): number {
	if (!raw) return fallback;
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
	return Math.min(parsed, MAX_SEARCH_LIMIT);
}

export function clampSearchOffset(raw: string | null): number {
	if (!raw) return 0;
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return 0;
	return parsed;
}

export function emptySearchResponse(query: string, mode: SearchResponse['mode'], limit: number, offset = 0): SearchResponse {
	return {
		query: query.trim(),
		mode,
		limit,
		offset,
		total: 0,
		limited: false,
		hasMore: false,
		nextOffset: null,
		results: []
	};
}

export function buildSearchResponse(
	query: string,
	mode: SearchResponse['mode'],
	limit: number,
	results: SearchHit[],
	total = results.length,
	offset = 0
): SearchResponse {
	const nextOffset = offset + results.length;
	const hasMore = nextOffset < total;
	return {
		query: query.trim(),
		mode,
		limit,
		offset,
		total,
		limited: hasMore,
		hasMore,
		nextOffset: hasMore ? nextOffset : null,
		results
	};
}

export function searchFullTextIndex(idx: VaultIndex, query: string, limit = DEFAULT_FULL_TEXT_SEARCH_LIMIT, offset = 0): SearchResponse {
	const parts = parseQuery(query);
	if (!parts.raw) return emptySearchResponse(query, 'full', limit, offset);

	const ranked: RankedHit[] = [];
	for (const meta of idx.notes.values()) {
		const hit = rankNote(idx, meta, parts);
		if (hit) ranked.push(hit);
	}

	ranked.sort((a, b) => {
		if (b.rank !== a.rank) return b.rank - a.rank;
		if (a.firstIndex !== b.firstIndex) return a.firstIndex - b.firstIndex;
		return a.path.localeCompare(b.path);
	});

	const capped = ranked.slice(offset, offset + limit).map(({ rank: _rank, firstIndex: _firstIndex, ...hit }) => hit);
	return buildSearchResponse(query, 'full', limit, capped, ranked.length, offset);
}

function rankNote(idx: VaultIndex, meta: NoteMeta, query: QueryParts): RankedHit | null {
	const doc = idx.searchDocs.get(meta.notePath);
	const text = doc?.text ?? '';
	const textLower = doc?.textLower ?? '';
	const title = meta.title;
	const titleLower = meta.title.toLowerCase();
	const path = meta.notePath;
	const pathLower = meta.notePath.toLowerCase();
	const aliases = meta.aliases;
	const aliasLower = meta.aliases.map((alias) => alias.toLowerCase());
	const tags = meta.tags.map((tag) => tag.replace(/^#+/, ''));
	const tagLower = meta.tags.map(normalizeTag);

	if (query.positiveTerms.length === 0 && query.negativeTerms.length === 0) return null;

	if (query.negativeTerms.some((term) => scoreTerm(term, meta, title, titleLower, path, pathLower, aliases, aliasLower, tags, tagLower, text, textLower).matched)) return null;

	const groupScores = query.positiveGroups.length === 0
		? [{ rank: 1, firstIndex: 0, bodyIndex: -1, bodyLength: query.raw.length }]
		: query.positiveGroups
			.map((group) => scorePositiveGroup(group, meta, title, titleLower, path, pathLower, aliases, aliasLower, tags, tagLower, text, textLower))
			.filter((score): score is GroupScore => score !== null);
	if (groupScores.length === 0) return null;

	const best = groupScores.sort((a, b) => {
		if (b.rank !== a.rank) return b.rank - a.rank;
		return a.firstIndex - b.firstIndex;
	})[0];

	const snippet = best.bodyIndex >= 0 ? snippetAround(text, best.bodyIndex, best.bodyLength) : undefined;
	return {
		path: meta.notePath,
		title: meta.title,
		snippet,
		rank: best.rank,
		firstIndex: best.firstIndex === Number.MAX_SAFE_INTEGER ? 0 : best.firstIndex
	};
}

function parseQuery(query: string): QueryParts {
	const raw = query.replace(/\s+/g, ' ').trim();
	const terms: SearchTerm[] = [];
	const positiveGroups: SearchTerm[][] = [];
	let currentGroup: SearchTerm[] = [];
	for (const token of tokenizeQuery(raw)) {
		if (!token.quoted && token.raw === 'OR') {
			if (currentGroup.length > 0) {
				positiveGroups.push(currentGroup);
				currentGroup = [];
			}
			continue;
		}
		const term = parseTerm(token);
		if (!term) continue;
		terms.push(term);
		if (!term.negative) currentGroup.push(term);
	}
	if (currentGroup.length > 0) positiveGroups.push(currentGroup);
	const positiveTerms = terms.filter((term) => !term.negative);
	const negativeTerms = terms.filter((term) => term.negative);
	return { raw, terms, positiveTerms, negativeTerms, positiveGroups };
}

function tokenizeQuery(input: string): { raw: string; quoted: boolean }[] {
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
			if (char === '/' && shouldReadRegexToken(raw)) {
				const regex = readRegexLiteral(input, i);
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

function parseTerm(token: { raw: string; quoted: boolean }): SearchTerm | null {
	let raw = token.raw;
	let negative = false;
	if (raw.startsWith('-') && raw.length > 1) {
		negative = true;
		raw = raw.slice(1);
	}
	const fieldMatch = raw.match(/^([A-Za-z][\w-]*):(.*)$/);
	const field = normalizeField(fieldMatch?.[1]);
	const value = (field ? fieldMatch?.[2] ?? '' : raw).replace(/\s+/g, ' ').trim();
	if (!value) return null;
	const normalized = field === 'tag' ? normalizeTag(value) : value.toLowerCase();
	if (!normalized) return null;
	const regex = parseRegexValue(value);
	if (looksLikeRegexValue(value) && !regex) return null;
	return {
		field: field ?? 'all',
		matcher: regex ? 'regex' : 'literal',
		value,
		lower: regex ? value : normalized,
		negative,
		quoted: token.quoted,
		regex: regex ?? undefined
	};
}

function normalizeField(field: string | undefined): SearchField | null {
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

function scoreTerm(
	term: SearchTerm,
	meta: NoteMeta,
	title: string,
	titleLower: string,
	path: string,
	pathLower: string,
	aliases: string[],
	aliasLower: string[],
	tags: string[],
	tagLower: string[],
	text: string,
	textLower: string
): TermScore {
	if (term.matcher === 'regex') return scoreRegexTerm(term, meta, title, path, aliases, tags, text);
	if (term.field === 'tag') return scoreTagTerm(term, tagLower);
	if (term.field === 'path') return scorePathTerm(term, pathLower);
	if (term.field === 'file') return scoreFileTerm(term, meta, titleLower, aliasLower);
	if (term.field === 'content') return scoreContentTerm(term, textLower);
	return scoreAllTerm(term, titleLower, pathLower, aliasLower, textLower);
}

function scoreRegexTerm(term: SearchTerm, meta: NoteMeta, title: string, path: string, aliases: string[], tags: string[], text: string): TermScore {
	if (!term.regex) return noMatch(term);
	if (term.field === 'tag') return scoreRegexTagTerm(term, tags);
	if (term.field === 'path') return scoreRegexPathTerm(term, path);
	if (term.field === 'file') return scoreRegexFileTerm(term, meta, title, aliases);
	if (term.field === 'content') return scoreRegexContentTerm(term, text);
	return scoreRegexAllTerm(term, title, path, aliases, text);
}

function scorePositiveGroup(
	group: SearchTerm[],
	meta: NoteMeta,
	title: string,
	titleLower: string,
	path: string,
	pathLower: string,
	aliases: string[],
	aliasLower: string[],
	tags: string[],
	tagLower: string[],
	text: string,
	textLower: string
): GroupScore | null {
	const scores = group.map((term) => scoreTerm(term, meta, title, titleLower, path, pathLower, aliases, aliasLower, tags, tagLower, text, textLower));
	if (scores.some((score) => !score.matched)) return null;

	let rank = 0;
	let firstIndex = Number.MAX_SAFE_INTEGER;
	let bodyIndex = -1;
	let bodyLength = group.map((term) => term.value).join(' ').length;
	const freeTerms = group.filter((term) => term.field === 'all' && term.matcher === 'literal');
	const freePhraseLower = freeTerms.map((term) => term.lower).join(' ').trim();
	if (freePhraseLower && freeTerms.length > 1) {
		const phraseScore = scoreTerm(
			{ field: 'all', matcher: 'literal', value: freePhraseLower, lower: freePhraseLower, negative: false, quoted: true },
			meta,
			title,
			titleLower,
			path,
			pathLower,
			aliases,
			aliasLower,
			tags,
			tagLower,
			text,
			textLower
		);
		if (phraseScore.matched) {
			rank += phraseScore.rank;
			firstIndex = Math.min(firstIndex, phraseScore.firstIndex);
			if (phraseScore.bodyIndex >= 0) {
				bodyIndex = phraseScore.bodyIndex;
				bodyLength = phraseScore.length;
			}
		}
	}

	for (const score of scores) {
		rank += score.rank;
		firstIndex = Math.min(firstIndex, score.firstIndex);
		if (bodyIndex < 0 && score.bodyIndex >= 0) {
			bodyIndex = score.bodyIndex;
			bodyLength = score.length;
		}
	}

	return { rank, firstIndex, bodyIndex, bodyLength };
}

function scoreAllTerm(term: SearchTerm, titleLower: string, pathLower: string, aliasLower: string[], textLower: string): TermScore {
	const titleIndex = titleLower.indexOf(term.lower);
	const aliasIndex = firstMatchingIndex(aliasLower, term.lower);
	const pathIndex = pathLower.indexOf(term.lower);
	const bodyIndex = textLower.indexOf(term.lower);
	const first = minFound(titleIndex, aliasIndex, pathIndex, bodyIndex);
	if (first < 0) return noMatch(term);
	let rank = 0;
	if (titleIndex >= 0) rank += 220 + fieldBonus(term) + earlyBonus(titleIndex);
	if (aliasIndex >= 0) rank += 170 + fieldBonus(term) + earlyBonus(aliasIndex);
	if (pathIndex >= 0) rank += 95 + fieldBonus(term) + earlyBonus(pathIndex);
	if (bodyIndex >= 0) {
		rank += 60 + fieldBonus(term) + earlyBonus(bodyIndex);
		rank += Math.min(80, countOccurrences(textLower, term.lower) * 8);
	}
	return { matched: true, rank, firstIndex: first, bodyIndex, length: term.value.length };
}

function scoreContentTerm(term: SearchTerm, textLower: string): TermScore {
	const bodyIndex = textLower.indexOf(term.lower);
	if (bodyIndex < 0) return noMatch(term);
	return {
		matched: true,
		rank: 460 + fieldBonus(term) + earlyBonus(bodyIndex) + Math.min(80, countOccurrences(textLower, term.lower) * 8),
		firstIndex: bodyIndex,
		bodyIndex,
		length: term.value.length
	};
}

function scoreFileTerm(term: SearchTerm, meta: NoteMeta, titleLower: string, aliasLower: string[]): TermScore {
	const stemIndex = meta.stem.indexOf(term.lower);
	const titleIndex = titleLower.indexOf(term.lower);
	const aliasIndex = firstMatchingIndex(aliasLower, term.lower);
	const first = minFound(titleIndex, aliasIndex, stemIndex);
	if (first < 0) return noMatch(term);
	let rank = 0;
	if (titleIndex >= 0) rank += 820 + fieldBonus(term) + earlyBonus(titleIndex);
	if (aliasIndex >= 0) rank += 720 + fieldBonus(term) + earlyBonus(aliasIndex);
	if (stemIndex >= 0) rank += 640 + fieldBonus(term) + earlyBonus(stemIndex);
	return { matched: true, rank, firstIndex: first, bodyIndex: -1, length: term.value.length };
}

function scorePathTerm(term: SearchTerm, pathLower: string): TermScore {
	const pathIndex = pathLower.indexOf(term.lower);
	if (pathIndex < 0) return noMatch(term);
	return {
		matched: true,
		rank: 680 + fieldBonus(term) + earlyBonus(pathIndex),
		firstIndex: pathIndex,
		bodyIndex: -1,
		length: term.value.length
	};
}

function scoreTagTerm(term: SearchTerm, tagLower: string[]): TermScore {
	const matched = tagLower.some((tag) => tag === term.lower || tag.startsWith(`${term.lower}/`));
	if (!matched) return noMatch(term);
	return { matched: true, rank: 760 + fieldBonus(term), firstIndex: 0, bodyIndex: -1, length: term.value.length };
}

function scoreRegexAllTerm(term: SearchTerm, title: string, path: string, aliases: string[], text: string): TermScore {
	const titleMatch = regexMatch(term.regex, title);
	const aliasMatch = firstRegexMatch(term.regex, aliases);
	const pathMatch = regexMatch(term.regex, path);
	const bodyMatch = regexMatch(term.regex, text);
	const first = minFound(titleMatch?.index ?? -1, aliasMatch?.index ?? -1, pathMatch?.index ?? -1, bodyMatch?.index ?? -1);
	if (first < 0) return noMatch(term);
	let rank = 0;
	if (titleMatch) rank += 220 + fieldBonus(term) + earlyBonus(titleMatch.index);
	if (aliasMatch) rank += 170 + fieldBonus(term) + earlyBonus(aliasMatch.index);
	if (pathMatch) rank += 95 + fieldBonus(term) + earlyBonus(pathMatch.index);
	if (bodyMatch) rank += 60 + fieldBonus(term) + earlyBonus(bodyMatch.index);
	return {
		matched: true,
		rank,
		firstIndex: first,
		bodyIndex: bodyMatch?.index ?? -1,
		length: bodyMatch?.length ?? titleMatch?.length ?? aliasMatch?.length ?? pathMatch?.length ?? term.value.length
	};
}

function scoreRegexContentTerm(term: SearchTerm, text: string): TermScore {
	const bodyMatch = regexMatch(term.regex, text);
	if (!bodyMatch) return noMatch(term);
	return {
		matched: true,
		rank: 460 + fieldBonus(term) + earlyBonus(bodyMatch.index),
		firstIndex: bodyMatch.index,
		bodyIndex: bodyMatch.index,
		length: bodyMatch.length
	};
}

function scoreRegexFileTerm(term: SearchTerm, meta: NoteMeta, title: string, aliases: string[]): TermScore {
	const stemMatch = regexMatch(term.regex, meta.stem);
	const titleMatch = regexMatch(term.regex, title);
	const aliasMatch = firstRegexMatch(term.regex, aliases);
	const first = minFound(titleMatch?.index ?? -1, aliasMatch?.index ?? -1, stemMatch?.index ?? -1);
	if (first < 0) return noMatch(term);
	let rank = 0;
	if (titleMatch) rank += 820 + fieldBonus(term) + earlyBonus(titleMatch.index);
	if (aliasMatch) rank += 720 + fieldBonus(term) + earlyBonus(aliasMatch.index);
	if (stemMatch) rank += 640 + fieldBonus(term) + earlyBonus(stemMatch.index);
	return {
		matched: true,
		rank,
		firstIndex: first,
		bodyIndex: -1,
		length: titleMatch?.length ?? aliasMatch?.length ?? stemMatch?.length ?? term.value.length
	};
}

function scoreRegexPathTerm(term: SearchTerm, path: string): TermScore {
	const pathMatch = regexMatch(term.regex, path);
	if (!pathMatch) return noMatch(term);
	return {
		matched: true,
		rank: 680 + fieldBonus(term) + earlyBonus(pathMatch.index),
		firstIndex: pathMatch.index,
		bodyIndex: -1,
		length: pathMatch.length
	};
}

function scoreRegexTagTerm(term: SearchTerm, tags: string[]): TermScore {
	const tagMatch = firstRegexMatch(term.regex, tags);
	if (!tagMatch) return noMatch(term);
	return { matched: true, rank: 760 + fieldBonus(term), firstIndex: tagMatch.index, bodyIndex: -1, length: tagMatch.length };
}

function noMatch(term: SearchTerm): TermScore {
	return { matched: false, rank: 0, firstIndex: -1, bodyIndex: -1, length: term.value.length };
}

function fieldBonus(term: SearchTerm): number {
	if (term.matcher === 'regex') return term.field === 'all' ? 130 : 180;
	if (term.quoted) return 300;
	if (term.field !== 'all') return 50;
	return 0;
}

function shouldReadRegexToken(raw: string): boolean {
	return raw === '' || /^-?[A-Za-z][\w-]*:$/.test(raw);
}

function readRegexLiteral(input: string, start: number): { raw: string; next: number } | null {
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

function parseRegexValue(value: string): RegExp | null {
	const parts = splitRegexValue(value.trim());
	if (!parts) return null;
	if (!isProbablySafeRegex(parts.pattern)) return null;
	const flags = normalizeRegexFlags(parts.flags);
	if (flags === null) return null;
	try {
		return new RegExp(parts.pattern, flags);
	} catch {
		return null;
	}
}

function looksLikeRegexValue(value: string): boolean {
	return value.trim().startsWith('/');
}

function splitRegexValue(value: string): { pattern: string; flags: string } | null {
	if (!value.startsWith('/')) return null;
	for (let i = value.length - 1; i > 0; i -= 1) {
		if (value[i] === '/' && !isEscaped(value, i)) {
			return {
				pattern: value.slice(1, i),
				flags: value.slice(i + 1)
			};
		}
	}
	return null;
}

function normalizeRegexFlags(flags: string): string | null {
	if (!/^[imsu]*$/.test(flags)) return null;
	const unique = new Set(flags.split('').filter(Boolean));
	unique.add('i');
	return [...unique].sort().join('');
}

function isProbablySafeRegex(pattern: string): boolean {
	if (!pattern || pattern.length > 120) return false;
	const compact = pattern.replace(/\\./g, '');
	if (/\\[1-9]/.test(pattern) || /\\k</.test(pattern)) return false;
	if (/\(\?<([=!]|!)/.test(pattern)) return false;
	if (/\([^)]*[+*][^)]*\)[+*{]/.test(compact)) return false;
	if (/\([^)]*\{[^)]*\}[^)]*\)[+*{]/.test(compact)) return false;
	if (/([+*?]|\{\d+,?\d*})\s*([+*?]|\{)/.test(compact)) return false;
	return true;
}

function isEscaped(value: string, index: number): boolean {
	let count = 0;
	for (let i = index - 1; i >= 0 && value[i] === '\\'; i -= 1) count += 1;
	return count % 2 === 1;
}

function regexMatch(regex: RegExp | undefined, value: string): { index: number; length: number } | null {
	if (!regex) return null;
	regex.lastIndex = 0;
	const match = regex.exec(value);
	if (!match || match.index === undefined) return null;
	return { index: match.index, length: Math.max(1, match[0]?.length ?? 0) };
}

function firstRegexMatch(regex: RegExp | undefined, values: string[]): { index: number; length: number } | null {
	for (const value of values) {
		const match = regexMatch(regex, value);
		if (match) return match;
	}
	return null;
}

function normalizeTag(tag: string): string {
	return tag.trim().replace(/^#+/, '').toLowerCase();
}

function snippetAround(text: string, index: number, length: number): string {
	const start = Math.max(0, index - 48);
	const end = Math.min(text.length, index + length + 64);
	return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

function earlyBonus(index: number): number {
	return Math.max(0, 80 - Math.min(index, 80));
}

function firstMatchingIndex(values: string[], needle: string): number {
	let first = -1;
	for (const value of values) {
		const index = value.indexOf(needle);
		if (index >= 0 && (first < 0 || index < first)) first = index;
	}
	return first;
}

function minFound(...indexes: number[]): number {
	let min = -1;
	for (const index of indexes) {
		if (index >= 0 && (min < 0 || index < min)) min = index;
	}
	return min;
}

function countOccurrences(value: string, needle: string): number {
	let count = 0;
	let offset = 0;
	while (offset < value.length) {
		const index = value.indexOf(needle, offset);
		if (index < 0) break;
		count += 1;
		offset = index + needle.length;
	}
	return count;
}
