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

interface SearchTerm {
	field: SearchField;
	value: string;
	lower: string;
	negative: boolean;
	quoted: boolean;
}

interface QueryParts {
	raw: string;
	terms: SearchTerm[];
	positiveTerms: SearchTerm[];
	negativeTerms: SearchTerm[];
	freeTerms: SearchTerm[];
	freePhraseLower: string;
}

interface TermScore {
	matched: boolean;
	rank: number;
	firstIndex: number;
	bodyIndex: number;
	length: number;
}

export function clampSearchLimit(raw: string | null, fallback: number): number {
	if (!raw) return fallback;
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
	return Math.min(parsed, MAX_SEARCH_LIMIT);
}

export function emptySearchResponse(query: string, mode: SearchResponse['mode'], limit: number): SearchResponse {
	return {
		query: query.trim(),
		mode,
		limit,
		total: 0,
		limited: false,
		results: []
	};
}

export function buildSearchResponse(
	query: string,
	mode: SearchResponse['mode'],
	limit: number,
	results: SearchHit[],
	total = results.length
): SearchResponse {
	return {
		query: query.trim(),
		mode,
		limit,
		total,
		limited: total > results.length,
		results
	};
}

export function searchFullTextIndex(idx: VaultIndex, query: string, limit = DEFAULT_FULL_TEXT_SEARCH_LIMIT): SearchResponse {
	const parts = parseQuery(query);
	if (!parts.raw) return emptySearchResponse(query, 'full', limit);

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

	const capped = ranked.slice(0, limit).map(({ rank: _rank, firstIndex: _firstIndex, ...hit }) => hit);
	return buildSearchResponse(query, 'full', limit, capped, ranked.length);
}

function rankNote(idx: VaultIndex, meta: NoteMeta, query: QueryParts): RankedHit | null {
	const doc = idx.searchDocs.get(meta.notePath);
	const text = doc?.text ?? '';
	const textLower = doc?.textLower ?? '';
	const titleLower = meta.title.toLowerCase();
	const pathLower = meta.notePath.toLowerCase();
	const aliasLower = meta.aliases.map((alias) => alias.toLowerCase());
	const tagLower = meta.tags.map(normalizeTag);
	const positiveScores = query.positiveTerms.map((term) => scoreTerm(term, meta, titleLower, pathLower, aliasLower, tagLower, textLower));

	if (positiveScores.length === 0 && query.negativeTerms.length === 0) return null;
	if (positiveScores.some((score) => !score.matched)) return null;
	if (query.negativeTerms.some((term) => scoreTerm(term, meta, titleLower, pathLower, aliasLower, tagLower, textLower).matched)) return null;

	let rank = 0;
	let firstIndex = Number.MAX_SAFE_INTEGER;
	let bodyIndex = -1;
	let bodyLength = query.raw.length;
	if (query.freePhraseLower && query.freeTerms.length > 1) {
		const phraseScore = scoreTerm(
			{ field: 'all', value: query.freePhraseLower, lower: query.freePhraseLower, negative: false, quoted: true },
			meta,
			titleLower,
			pathLower,
			aliasLower,
			tagLower,
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

	for (const score of positiveScores) {
		rank += score.rank;
		firstIndex = Math.min(firstIndex, score.firstIndex);
		if (bodyIndex < 0 && score.bodyIndex >= 0) {
			bodyIndex = score.bodyIndex;
			bodyLength = score.length;
		}
	}

	const snippet = bodyIndex >= 0 ? snippetAround(text, bodyIndex, bodyLength) : undefined;
	return {
		path: meta.notePath,
		title: meta.title,
		snippet,
		rank,
		firstIndex: firstIndex === Number.MAX_SAFE_INTEGER ? 0 : firstIndex
	};
}

function parseQuery(query: string): QueryParts {
	const raw = query.replace(/\s+/g, ' ').trim();
	const terms = tokenizeQuery(raw)
		.map(parseTerm)
		.filter((term): term is SearchTerm => term !== null);
	const positiveTerms = terms.filter((term) => !term.negative);
	const negativeTerms = terms.filter((term) => term.negative);
	const freeTerms = positiveTerms.filter((term) => term.field === 'all');
	const freePhraseLower = freeTerms.map((term) => term.lower).join(' ').trim();
	return { raw, terms, positiveTerms, negativeTerms, freeTerms, freePhraseLower };
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
	return {
		field: field ?? 'all',
		value,
		lower: normalized,
		negative,
		quoted: token.quoted
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
	titleLower: string,
	pathLower: string,
	aliasLower: string[],
	tagLower: string[],
	textLower: string
): TermScore {
	if (term.field === 'tag') return scoreTagTerm(term, tagLower);
	if (term.field === 'path') return scorePathTerm(term, pathLower);
	if (term.field === 'file') return scoreFileTerm(term, meta, titleLower, aliasLower);
	if (term.field === 'content') return scoreContentTerm(term, textLower);
	return scoreAllTerm(term, titleLower, pathLower, aliasLower, textLower);
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

function noMatch(term: SearchTerm): TermScore {
	return { matched: false, rank: 0, firstIndex: -1, bodyIndex: -1, length: term.value.length };
}

function fieldBonus(term: SearchTerm): number {
	if (term.quoted) return 300;
	if (term.field !== 'all') return 50;
	return 0;
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
