/**
 * Vault indexer. Walks a vault once at startup, then updates incrementally
 * as notes are saved/renamed/deleted. Exposes:
 *
 *   - `titleIndex` — basename and alias → notePath (case-insensitive)
 *   - `linksOut`   — notePath → set of outgoing notePaths
 *   - `backlinks`  — notePath → set of incoming notePaths
 *   - `tagIndex`   — tag → set of notePaths
 *
 * All state is keyed by vault-relative path with forward slashes.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Vault } from './vault';
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
}

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

/** Full rebuild — walks every `.md` under the vault. */
function buildIndex(vault: Vault): VaultIndex {
	const idx: VaultIndex = {
		notes: new Map(),
		titleIndex: new Map(),
		linksOutRaw: new Map(),
		linksOut: new Map(),
		backlinks: new Map(),
		tagIndex: new Map()
	};

	for (const abs of walkMarkdown(vault.path)) {
		const rel = path.relative(vault.path, abs).split(path.sep).join('/');
		try {
			const body = fs.readFileSync(abs, 'utf-8');
			ingestNote(idx, rel, body);
		} catch { /* skip unreadable file */ }
	}

	// Second pass: resolve outgoing links now that the title index is complete.
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
	return idx;
}

/** Incremental add/update of one note's contribution to the index. */
export function upsertNote(vault: Vault, notePath: string, body: string): void {
	const idx = getIndex(vault);
	removeNote(vault, notePath, { skipRebuild: true });
	ingestNote(idx, notePath, body);
	// Resolve the new note's outgoing links + seed backlinks
	const raw = idx.linksOutRaw.get(notePath) ?? new Set();
	const resolved = new Set<string>();
	for (const r of raw) {
		const target = resolveTarget(idx, r);
		if (target) {
			resolved.add(target);
			addBacklink(idx, target, notePath);
		}
	}
	idx.linksOut.set(notePath, resolved);
	// Some backlinks elsewhere may now resolve (if this note was previously missing).
	// Cheap rebuild of incoming: walk every note's raw links.
	for (const [other, rawSet] of idx.linksOutRaw) {
		if (other === notePath) continue;
		if (idx.linksOut.get(other)?.has(notePath)) continue;
		for (const r of rawSet) {
			if (resolveTarget(idx, r) === notePath) {
				idx.linksOut.get(other)?.add(notePath);
				addBacklink(idx, notePath, other);
			}
		}
	}
}

export function removeNote(vault: Vault, notePath: string, opts: { skipRebuild?: boolean } = {}): void {
	const idx = getIndex(vault);
	const meta = idx.notes.get(notePath);
	if (!meta) return;
	// Remove from title index
	for (const key of titleKeys(meta)) idx.titleIndex.delete(key);
	idx.notes.delete(notePath);
	// Remove from tag index
	for (const tag of meta.tags) {
		idx.tagIndex.get(tag)?.delete(notePath);
		if ((idx.tagIndex.get(tag)?.size ?? 0) === 0) idx.tagIndex.delete(tag);
	}
	// Remove this note's outgoing links and clear its backlinks-into-others
	const out = idx.linksOut.get(notePath);
	if (out) {
		for (const target of out) idx.backlinks.get(target)?.delete(notePath);
	}
	idx.linksOut.delete(notePath);
	idx.linksOutRaw.delete(notePath);
	// Clear others' links *to* this note
	for (const [other, outs] of idx.linksOut) {
		if (outs.delete(notePath)) {
			idx.backlinks.get(notePath)?.delete(other);
		}
	}
	idx.backlinks.delete(notePath);
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
	for (const key of titleKeys(meta)) idx.titleIndex.set(key, notePath);
	// tag index
	for (const tag of tags) {
		let set = idx.tagIndex.get(tag);
		if (!set) idx.tagIndex.set(tag, (set = new Set()));
		set.add(notePath);
	}
	// raw outgoing links
	const rawOut = new Set<string>();
	for (const link of parseWikilinks(main)) rawOut.add(link.target);
	idx.linksOutRaw.set(notePath, rawOut);
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
