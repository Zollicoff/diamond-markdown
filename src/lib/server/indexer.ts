/**
 * Vault indexer. Walks a vault once at startup, then updates incrementally
 * as notes are saved/renamed/deleted. Exposes:
 *
 *   - `titleIndex` — basename and alias → notePath (case-insensitive)
 *   - `linksOut`   — notePath → set of outgoing notePaths
 *   - `backlinks`  — notePath → set of incoming notePaths
 *   - `tagIndex`   — tag → set of notePaths
 *   - `searchDocs` — notePath → normalized note body text
 *
 * All state is keyed by vault-relative path with forward slashes.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getConfigDir, type Vault } from './vault';
import { parseWikilinks, parseInlineTags } from './wikilink';
import { splitFrontmatter, collectTags, aliasesOf } from './frontmatter';

export interface NoteMeta {
	/** Vault-relative path with `/` separators, e.g. "Features/Wikilinks.md" */
	notePath: string;
	/** Title — frontmatter `title` or filename stem */
	title: string;
	aliases: string[];
	tags: string[];
	/** Lowercased stem for basename matching */
	stem: string;
}

export interface SearchDocument {
	/** Vault-relative path matching the note metadata key. */
	notePath: string;
	/** Whitespace-normalized markdown body text, excluding frontmatter. */
	text: string;
	/** Lowercase copy kept in memory so search does not recase every query. */
	textLower: string;
}

export interface VaultIndex {
	/** All notes. */
	notes: Map<string, NoteMeta>;
	/** Lowercased title/alias/stem/path → notePath. Case-insensitive lookup. */
	titleIndex: Map<string, string>;
	/** Outgoing wikilink targets (unresolved text) per note. */
	linksOutRaw: Map<string, Set<string>>;
	/** Resolved outgoing links. */
	linksOut: Map<string, Set<string>>;
	/** Incoming links per note. */
	backlinks: Map<string, Set<string>>;
	/** tag → set of note paths. */
	tagIndex: Map<string, Set<string>>;
	/** notePath → indexed body text for full-vault search. */
	searchDocs: Map<string, SearchDocument>;
}

interface FileSnapshot {
	rel: string;
	size: number;
	mtimeMs: number;
}

interface MarkdownFile extends FileSnapshot {
	abs: string;
}

interface IndexCacheFile {
	version: number;
	vaultId: string;
	vaultPath: string;
	excludedFolders: string[];
	files: FileSnapshot[];
	notes: NoteMeta[];
	linksOutRaw: { notePath: string; targets: string[] }[];
	searchDocs: { notePath: string; text: string }[];
}

const INDEX_CACHE_VERSION = 2;
const indexes = new Map<string, VaultIndex>();

export function getIndex(vault: Vault): VaultIndex {
	let idx = indexes.get(vault.id);
	if (!idx) {
		idx = buildIndex(vault);
		indexes.set(vault.id, idx);
	}
	return idx;
}

export function rebuildIndex(vault: Vault): VaultIndex {
	const idx = buildIndex(vault);
	indexes.set(vault.id, idx);
	return idx;
}

/** Full rebuild — walks every `.md` under the vault, skipping excluded folders. */
function buildIndex(vault: Vault): VaultIndex {
	const excluded = normalizedExcludedFolders(vault);
	const files = collectMarkdownFiles(vault, excluded);
	const cached = tryLoadIndexCache(vault, excluded, files);
	if (cached) return cached;

	const idx = emptyIndex();

	for (const file of files) {
		try {
			const body = fs.readFileSync(file.abs, 'utf-8');
			ingestNote(idx, file.rel, body);
		} catch { /* skip unreadable file */ }
	}

	rebuildDerivedIndexes(idx);
	writeIndexCache(vault, idx, files);
	return idx;
}

/** Incremental add/update of one note's contribution to the index. */
export function upsertNote(vault: Vault, notePath: string, body: string): void {
	const idx = getIndex(vault);
	idx.notes.delete(notePath);
	idx.linksOutRaw.delete(notePath);
	idx.searchDocs.delete(notePath);
	ingestNote(idx, notePath, body);
	rebuildDerivedIndexes(idx);
	writeIndexCache(vault, idx);
}

export function removeNote(vault: Vault, notePath: string, opts: { skipCache?: boolean } = {}): void {
	const idx = getIndex(vault);
	const existed = idx.notes.has(notePath) || idx.linksOutRaw.has(notePath) || idx.searchDocs.has(notePath);
	if (!existed) return;
	idx.notes.delete(notePath);
	idx.linksOutRaw.delete(notePath);
	idx.searchDocs.delete(notePath);
	rebuildDerivedIndexes(idx);
	if (!opts.skipCache) writeIndexCache(vault, idx);
}

/** Parse frontmatter + body, add to maps. No link resolution yet. */
function ingestNote(idx: VaultIndex, notePath: string, body: string): void {
	const { frontmatter, body: main } = splitFrontmatter(body);
	const stem = path.basename(notePath, path.extname(notePath));
	const title = typeof frontmatter.title === 'string' ? frontmatter.title : stem;
	const aliases = aliasesOf(frontmatter);
	const tags = collectTags(frontmatter, parseInlineTags(main));
	const meta: NoteMeta = { notePath, title, aliases, tags, stem: stem.toLowerCase() };
	idx.notes.set(notePath, meta);
	const rawOut = new Set<string>();
	for (const link of parseWikilinks(main)) rawOut.add(link.target);
	idx.linksOutRaw.set(notePath, rawOut);
	const text = normalizeSearchText(main);
	idx.searchDocs.set(notePath, { notePath, text, textLower: text.toLowerCase() });
}

function emptyIndex(): VaultIndex {
	return {
		notes: new Map(),
		titleIndex: new Map(),
		linksOutRaw: new Map(),
		linksOut: new Map(),
		backlinks: new Map(),
		tagIndex: new Map(),
		searchDocs: new Map()
	};
}

function rebuildDerivedIndexes(idx: VaultIndex): void {
	idx.titleIndex.clear();
	idx.tagIndex.clear();
	idx.linksOut.clear();
	idx.backlinks.clear();

	for (const meta of idx.notes.values()) {
		for (const key of titleKeys(meta)) idx.titleIndex.set(key, meta.notePath);
		for (const tag of meta.tags) {
			let set = idx.tagIndex.get(tag);
			if (!set) idx.tagIndex.set(tag, (set = new Set()));
			set.add(meta.notePath);
		}
	}

	for (const [notePath, rawTargets] of idx.linksOutRaw) {
		const resolved = new Set<string>();
		for (const raw of rawTargets) {
			const target = resolveTarget(idx, raw);
			if (target) {
				resolved.add(target);
				addBacklink(idx, target, notePath);
			}
		}
		idx.linksOut.set(notePath, resolved);
	}
}

function titleKeys(meta: NoteMeta): string[] {
	const keys = [
		meta.notePath.toLowerCase(),
		meta.notePath.toLowerCase().replace(/\.md$/, ''),
		meta.stem.toLowerCase(),
		meta.title.toLowerCase()
	];
	for (const a of meta.aliases) keys.push(a.toLowerCase());
	return [...new Set(keys)];
}

/** Obsidian-style resolution: path → basename → alias → null. */
export function resolveTarget(idx: VaultIndex, target: string): string | null {
	const t = target.trim().toLowerCase();
	if (!t) return null;
	// Path (with or without .md)
	if (idx.titleIndex.has(t)) return idx.titleIndex.get(t)!;
	if (idx.titleIndex.has(t + '.md')) return idx.titleIndex.get(t + '.md')!;
	return null;
}

function addBacklink(idx: VaultIndex, target: string, source: string): void {
	let set = idx.backlinks.get(target);
	if (!set) idx.backlinks.set(target, (set = new Set()));
	set.add(source);
}

function normalizedExcludedFolders(vault: Vault): string[] {
	return [...new Set(
		(vault.excludedFolders ?? [])
			.map((f) => f.replace(/^\/+|\/+$/g, ''))
			.filter(Boolean)
	)].sort();
}

function collectMarkdownFiles(vault: Vault, excludedFolders: string[]): MarkdownFile[] {
	const excluded = new Set(excludedFolders);
	const files: MarkdownFile[] = [];
	for (const abs of walkMarkdown(vault.path)) {
		const rel = path.relative(vault.path, abs).split(path.sep).join('/');
		if (isInExcluded(rel, excluded)) continue;
		try {
			const stat = fs.statSync(abs);
			if (!stat.isFile()) continue;
			files.push({ abs, rel, size: stat.size, mtimeMs: stat.mtimeMs });
		} catch { /* skip files that disappear mid-walk */ }
	}
	files.sort((a, b) => a.rel.localeCompare(b.rel));
	return files;
}

function cacheFileSnapshot(files: MarkdownFile[]): FileSnapshot[] {
	return files.map((f) => ({ rel: f.rel, size: f.size, mtimeMs: f.mtimeMs }));
}

function indexCachePath(vault: Vault): string {
	const safeId = vault.id.replace(/[^a-zA-Z0-9._-]+/g, '-') || 'vault';
	const hash = crypto
		.createHash('sha256')
		.update(`${vault.id}\0${path.resolve(vault.path)}`)
		.digest('hex')
		.slice(0, 16);
	return path.join(getConfigDir(), 'index-cache', `${safeId}-${hash}.json`);
}

function tryLoadIndexCache(
	vault: Vault,
	excludedFolders: string[],
	files: MarkdownFile[]
): VaultIndex | null {
	try {
		const cache = JSON.parse(fs.readFileSync(indexCachePath(vault), 'utf-8')) as IndexCacheFile;
		if (cache.version !== INDEX_CACHE_VERSION) return null;
		if (cache.vaultId !== vault.id) return null;
		if (cache.vaultPath !== path.resolve(vault.path)) return null;
		if (!sameStringArray(cache.excludedFolders, excludedFolders)) return null;
		if (!sameFileSnapshot(cache.files, cacheFileSnapshot(files))) return null;
		if (!Array.isArray(cache.notes) || !Array.isArray(cache.linksOutRaw) || !Array.isArray(cache.searchDocs)) return null;
		const searchDocPaths = new Set(cache.searchDocs.map((doc) => doc.notePath));
		if (cache.notes.some((meta) => !searchDocPaths.has(meta.notePath))) return null;
		return hydrateIndex(cache);
	} catch {
		return null;
	}
}

function hydrateIndex(cache: IndexCacheFile): VaultIndex {
	const idx = emptyIndex();
	for (const meta of cache.notes) {
		idx.notes.set(meta.notePath, {
			notePath: meta.notePath,
			title: meta.title,
			aliases: Array.isArray(meta.aliases) ? meta.aliases : [],
			tags: Array.isArray(meta.tags) ? meta.tags : [],
			stem: meta.stem
		});
	}
	for (const entry of cache.linksOutRaw) {
		idx.linksOutRaw.set(entry.notePath, new Set(Array.isArray(entry.targets) ? entry.targets : []));
	}
	for (const doc of cache.searchDocs) {
		if (typeof doc.notePath !== 'string' || typeof doc.text !== 'string') continue;
		idx.searchDocs.set(doc.notePath, {
			notePath: doc.notePath,
			text: doc.text,
			textLower: doc.text.toLowerCase()
		});
	}
	rebuildDerivedIndexes(idx);
	return idx;
}

function writeIndexCache(vault: Vault, idx: VaultIndex, files?: MarkdownFile[]): void {
	try {
		const excludedFolders = normalizedExcludedFolders(vault);
		const snapshot = cacheFileSnapshot(files ?? collectMarkdownFiles(vault, excludedFolders));
		const cache: IndexCacheFile = {
			version: INDEX_CACHE_VERSION,
			vaultId: vault.id,
			vaultPath: path.resolve(vault.path),
			excludedFolders,
			files: snapshot,
			notes: [...idx.notes.values()].sort((a, b) => a.notePath.localeCompare(b.notePath)),
			linksOutRaw: [...idx.linksOutRaw.entries()]
				.map(([notePath, targets]) => ({ notePath, targets: [...targets].sort() }))
				.sort((a, b) => a.notePath.localeCompare(b.notePath)),
			searchDocs: [...idx.searchDocs.values()]
				.map(({ notePath, text }) => ({ notePath, text }))
				.sort((a, b) => a.notePath.localeCompare(b.notePath))
		};
		const target = indexCachePath(vault);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		const tmp = `${target}.tmp`;
		fs.writeFileSync(tmp, JSON.stringify(cache));
		fs.renameSync(tmp, target);
	} catch {
		// Cache is derived state. If persistence fails, the in-memory index is still valid.
	}
}

function sameStringArray(a: string[], b: string[]): boolean {
	return a.length === b.length && a.every((value, i) => value === b[i]);
}

function sameFileSnapshot(a: FileSnapshot[], b: FileSnapshot[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i].rel !== b[i].rel) return false;
		if (a[i].size !== b[i].size) return false;
		if (a[i].mtimeMs !== b[i].mtimeMs) return false;
	}
	return true;
}

function normalizeSearchText(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

/** Recursive .md walker, skipping hidden dirs + node_modules. */
function* walkMarkdown(dir: string): Iterable<string> {
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
			yield* walkMarkdown(full);
		} else if (entry.isFile() && entry.name.endsWith('.md')) {
			yield full;
		}
	}
}

/** Is `rel` (forward-slash, vault-relative) inside any excluded folder? */
function isInExcluded(rel: string, excluded: Set<string>): boolean {
	if (excluded.size === 0) return false;
	for (const folder of excluded) {
		if (rel === folder) return true;
		if (rel.startsWith(folder + '/')) return true;
	}
	return false;
}
