import type { SearchHit, SearchResponse } from '$lib/types';
import type { NoteMeta, VaultIndex } from './indexer';

export const DEFAULT_TITLE_SEARCH_LIMIT = 25;
export const DEFAULT_FULL_TEXT_SEARCH_LIMIT = 50;
export const MAX_SEARCH_LIMIT = 200;

interface RankedHit extends SearchHit {
	rank: number;
	firstIndex: number;
}

interface QueryParts {
	raw: string;
	lower: string;
	tokens: string[];
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
	if (!parts.lower) return emptySearchResponse(query, 'full', limit);

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
	const titlePhrase = titleLower.indexOf(query.lower);
	const pathPhrase = pathLower.indexOf(query.lower);
	const aliasPhrase = firstMatchingIndex(aliasLower, query.lower);
	const bodyPhrase = textLower.indexOf(query.lower);
	const phraseMatched = [titlePhrase, pathPhrase, aliasPhrase, bodyPhrase].some((index) => index >= 0);
	const tokenScores = query.tokens.map((token) => rankToken(token, titleLower, pathLower, aliasLower, textLower));

	if (!phraseMatched && (tokenScores.length === 0 || tokenScores.some((score) => score.firstIndex < 0))) return null;

	let rank = 0;
	let firstIndex = Number.MAX_SAFE_INTEGER;
	if (titlePhrase >= 0) {
		rank += 900 + earlyBonus(titlePhrase);
		firstIndex = Math.min(firstIndex, titlePhrase);
	}
	if (aliasPhrase >= 0) {
		rank += 760 + earlyBonus(aliasPhrase);
		firstIndex = Math.min(firstIndex, aliasPhrase);
	}
	if (pathPhrase >= 0) {
		rank += 560 + earlyBonus(pathPhrase);
		firstIndex = Math.min(firstIndex, pathPhrase);
	}
	if (bodyPhrase >= 0) {
		rank += 420 + earlyBonus(bodyPhrase);
		firstIndex = Math.min(firstIndex, bodyPhrase);
	}

	for (const score of tokenScores) {
		if (score.firstIndex < 0) continue;
		rank += score.rank;
		firstIndex = Math.min(firstIndex, score.firstIndex);
	}

	const bodyIndex = bodyPhrase >= 0 ? bodyPhrase : firstBodyTokenIndex(query.tokens, textLower);
	const snippet = bodyIndex >= 0 ? snippetAround(text, bodyIndex, bodyPhrase >= 0 ? query.raw.length : query.tokens[0]?.length ?? query.raw.length) : undefined;
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
	const lower = raw.toLowerCase();
	const tokens = [...new Set(lower.split(/[^\p{L}\p{N}_-]+/u).filter(Boolean))];
	return { raw, lower, tokens };
}

function rankToken(token: string, titleLower: string, pathLower: string, aliasLower: string[], textLower: string): { rank: number; firstIndex: number } {
	const titleIndex = titleLower.indexOf(token);
	const aliasIndex = firstMatchingIndex(aliasLower, token);
	const pathIndex = pathLower.indexOf(token);
	const bodyIndex = textLower.indexOf(token);
	const first = minFound(titleIndex, aliasIndex, pathIndex, bodyIndex);
	if (first < 0) return { rank: 0, firstIndex: -1 };
	let rank = 0;
	if (titleIndex >= 0) rank += 180 + earlyBonus(titleIndex);
	if (aliasIndex >= 0) rank += 140 + earlyBonus(aliasIndex);
	if (pathIndex >= 0) rank += 80 + earlyBonus(pathIndex);
	if (bodyIndex >= 0) {
		rank += 45 + earlyBonus(bodyIndex);
		rank += Math.min(60, countOccurrences(textLower, token) * 6);
	}
	return { rank, firstIndex: first };
}

function firstBodyTokenIndex(tokens: string[], textLower: string): number {
	let first = -1;
	for (const token of tokens) {
		const index = textLower.indexOf(token);
		if (index >= 0 && (first < 0 || index < first)) first = index;
	}
	return first;
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
