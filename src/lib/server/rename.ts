/**
 * Rename/move logic with cross-vault wikilink rewrites.
 *
 * Core invariant: when a note or folder moves, every *other* note whose
 * wikilink used to resolve to the old location gets rewritten to the new
 * one in the same operation. All changes land in a single git commit.
 */

import fs from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import type { Vault } from './vault';
import { getIndex, upsertNote, removeNote } from './indexer';
import { resolveInVault } from './paths';

interface RewriteResult {
	/** Vault-relative paths modified (excludes the file being renamed). */
	touched: string[];
	linksUpdated: number;
}

const WIKILINK_RE = /\[\[([^\[\]|\n]+?)(?:#([^\[\]|\n]+?))?(?:\|([^\[\]\n]+?))?\]\]/g;

/** Drop a trailing `.md` for path-style compare. */
const stripMd = (p: string): string => p.replace(/\.md$/i, '');

/** Path.basename without extension. */
const stem = (p: string): string => path.basename(p, path.extname(p));

/** Escape a string for use inside a regex. */
const reEsc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Rewrite wikilinks across the vault after a note moves from `oldPath`
 * to `newPath`. Returns which files were touched + a link count for the
 * commit message.
 */
export function rewriteLinksForNoteRename(
	vault: Vault,
	oldPath: string,
	newPath: string
): RewriteResult {
	const idx = getIndex(vault);

	const oldStem = stem(oldPath);
	const newStem = stem(newPath);
	const oldPathNoExt = stripMd(oldPath);
	const newPathNoExt = stripMd(newPath);

	// Basename rewrites are only safe if `oldStem` was unambiguous in the
	// vault. If two notes shared that stem, someone else still resolves to
	// the remaining one — don't touch those.
	let otherNotesWithSameStem = 0;
	for (const meta of idx.notes.values()) {
		if (meta.notePath === oldPath) continue;
		if (meta.stem.toLowerCase() === oldStem.toLowerCase()) otherNotesWithSameStem++;
	}
	const stemAmbiguous = otherNotesWithSameStem > 0;

	// Scope the scan: backlinks index tells us which notes referenced the
	// old path via its *resolved* target. Anything else that used `[[OldStem]]`
	// but resolved elsewhere is none of our business.
	const linking = [...(idx.backlinks.get(oldPath) ?? new Set<string>())];

	const touched = new Set<string>();
	let linksUpdated = 0;

	for (const linkingNote of linking) {
		let abs: string;
		try { abs = resolveInVault(vault, linkingNote); } catch { continue; }
		if (!fs.existsSync(abs)) continue;
		const content = fs.readFileSync(abs, 'utf-8');
		const next = rewriteWikilinksInText(content, (rawTarget) => {
			const t = rawTarget.trim();
			const tLower = t.toLowerCase();
			// Path-style match (with or without .md)
			if (tLower === oldPath.toLowerCase()) return newPath;
			if (tLower === oldPathNoExt.toLowerCase()) return newPathNoExt;
			// Basename match (safe only if unambiguous)
			if (!stemAmbiguous && tLower === oldStem.toLowerCase()) return newStem;
			return null;
		}, (n) => { linksUpdated += n; });

		if (next !== content) {
			fs.writeFileSync(abs, next);
			upsertNote(vault, linkingNote, next);
			touched.add(linkingNote);
		}
	}

	return { touched: [...touched], linksUpdated };
}

/**
 * Rewrite path-style wikilinks that started with `oldFolder/` when a
 * folder moves to `newFolder/`. Basename-style wikilinks don't need
 * changes because note stems are unchanged.
 */
export function rewriteLinksForFolderRename(
	vault: Vault,
	oldFolder: string,
	newFolder: string
): RewriteResult {
	const idx = getIndex(vault);
	const touched = new Set<string>();
	let linksUpdated = 0;

	const oldPrefix = oldFolder.replace(/\/+$/, '') + '/';
	const newPrefix = newFolder.replace(/\/+$/, '') + '/';
	const oldPrefixLower = oldPrefix.toLowerCase();

	for (const note of idx.notes.keys()) {
		let abs: string;
		try { abs = resolveInVault(vault, note); } catch { continue; }
		if (!fs.existsSync(abs)) continue;
		const content = fs.readFileSync(abs, 'utf-8');
		const next = rewriteWikilinksInText(content, (rawTarget) => {
			const t = rawTarget.trim();
			const tLower = t.toLowerCase();
			if (tLower.startsWith(oldPrefixLower)) {
				return newPrefix + t.slice(oldPrefix.length);
			}
			return null;
		}, (n) => { linksUpdated += n; });

		if (next !== content) {
			fs.writeFileSync(abs, next);
			upsertNote(vault, note, next);
			touched.add(note);
		}
	}
	return { touched: [...touched], linksUpdated };
}

function rewriteWikilinksInText(
	text: string,
	replaceTarget: (target: string) => string | null,
	onHit: (n: number) => void
): string {
	let hits = 0;
	const next = text.replace(WIKILINK_RE, (whole, target: string, heading: string | undefined, display: string | undefined) => {
		const rewritten = replaceTarget(target);
		if (rewritten === null) return whole;
		hits++;
		const h = heading ? `#${heading}` : '';
		const d = display ? `|${display}` : '';
		return `[[${rewritten}${h}${d}]]`;
	});
	if (hits) onHit(hits);
	return next;
}

/**
 * Atomic rename + link-update + git commit for a single note.
 */
export async function renameNoteAtomically(
	vault: Vault,
	oldPath: string,
	newPath: string
): Promise<{ touched: string[]; linksUpdated: number; sha: string | null }> {
	const absOld = resolveInVault(vault, oldPath);
	const absNew = resolveInVault(vault, newPath);
	if (!fs.existsSync(absOld)) throw new Error('source does not exist');
	if (fs.existsSync(absNew)) throw new Error('destination already exists');

	// Rewrite incoming wikilinks (before the rename so the backlink index
	// still points at oldPath).
	const { touched, linksUpdated } = rewriteLinksForNoteRename(vault, oldPath, newPath);

	// Create any intermediate dirs.
	fs.mkdirSync(path.dirname(absNew), { recursive: true });

	const g = simpleGit(vault.path);
	// Use git mv so history tracks the rename. If the file isn't tracked
	// yet, fall back to fs rename.
	try {
		await g.mv(oldPath, newPath);
	} catch {
		fs.renameSync(absOld, absNew);
	}

	// Re-index.
	const newContent = fs.readFileSync(absNew, 'utf-8');
	removeNote(vault, oldPath);
	upsertNote(vault, newPath, newContent);

	// Commit everything as one.
	const filesToAdd = [oldPath, newPath, ...touched];
	await g.add(filesToAdd).catch(() => { /* may race; simple-git is forgiving */ });
	const summary = linksUpdated > 0
		? `${oldPath} → ${newPath} (+${linksUpdated} link${linksUpdated === 1 ? '' : 's'} updated)`
		: `${oldPath} → ${newPath}`;
	try {
		const res = await g.commit(`rename: ${summary}`);
		return { touched, linksUpdated, sha: res.commit || null };
	} catch {
		return { touched, linksUpdated, sha: null };
	}
}

/**
 * Atomic folder rename. Moves every note in the folder (and subfolders),
 * rewrites path-style wikilinks across the vault, re-indexes each moved
 * note, and commits once.
 */
export async function renameFolderAtomically(
	vault: Vault,
	oldFolder: string,
	newFolder: string
): Promise<{ touched: string[]; linksUpdated: number; movedNotes: number; sha: string | null }> {
	const absOld = resolveInVault(vault, oldFolder);
	const absNew = resolveInVault(vault, newFolder);
	if (!fs.existsSync(absOld) || !fs.statSync(absOld).isDirectory()) {
		throw new Error('source folder does not exist');
	}
	if (fs.existsSync(absNew)) throw new Error('destination already exists');

	// Rewrite links first — before moving, so paths.relative calculations
	// against the *old* index are still valid.
	const { touched, linksUpdated } = rewriteLinksForFolderRename(vault, oldFolder, newFolder);

	// Enumerate notes under the old folder (for re-indexing later).
	const oldPrefix = oldFolder.replace(/\/+$/, '') + '/';
	const newPrefix = newFolder.replace(/\/+$/, '') + '/';
	const idx = getIndex(vault);
	const moves: { from: string; to: string }[] = [];
	for (const note of idx.notes.keys()) {
		if (note.startsWith(oldPrefix) || note === oldFolder) {
			moves.push({ from: note, to: newPrefix + note.slice(oldPrefix.length) });
		}
	}

	// Move the folder on disk. git mv on directories is supported.
	fs.mkdirSync(path.dirname(absNew), { recursive: true });
	const g = simpleGit(vault.path);
	try {
		await g.mv(oldFolder, newFolder);
	} catch {
		fs.renameSync(absOld, absNew);
	}

	// Re-index: remove old, upsert new.
	for (const m of moves) {
		removeNote(vault, m.from);
		const absMoved = resolveInVault(vault, m.to);
		if (fs.existsSync(absMoved)) {
			upsertNote(vault, m.to, fs.readFileSync(absMoved, 'utf-8'));
		}
	}

	// Commit.
	const filesToAdd = [oldFolder, newFolder, ...touched];
	await g.add(filesToAdd).catch(() => { /* ok */ });
	const summary = linksUpdated > 0
		? `${oldFolder}/ → ${newFolder}/ (+${linksUpdated} link${linksUpdated === 1 ? '' : 's'} updated)`
		: `${oldFolder}/ → ${newFolder}/`;
	try {
		const res = await g.commit(`rename: ${summary}`);
		return { touched, linksUpdated, movedNotes: moves.length, sha: res.commit || null };
	} catch {
		return { touched, linksUpdated, movedNotes: moves.length, sha: null };
	}
}

/**
 * Duplicate a note to a new path (or `${stem} (copy).md` if not specified).
 * No link updates — copies are standalone.
 */
export async function duplicateNoteAtomically(
	vault: Vault,
	srcPath: string,
	dstPath?: string
): Promise<{ path: string; sha: string | null }> {
	const absSrc = resolveInVault(vault, srcPath);
	if (!fs.existsSync(absSrc)) throw new Error('source does not exist');
	let target = dstPath;
	if (!target) {
		const dir = path.dirname(srcPath);
		const base = stem(srcPath);
		let n = 0;
		do {
			const suffix = n === 0 ? ' (copy)' : ` (copy ${n + 1})`;
			target = (dir && dir !== '.' ? `${dir}/` : '') + `${base}${suffix}.md`;
			n++;
		} while (fs.existsSync(resolveInVault(vault, target)));
	}
	const absDst = resolveInVault(vault, target);
	if (fs.existsSync(absDst)) throw new Error('destination already exists');
	fs.mkdirSync(path.dirname(absDst), { recursive: true });
	fs.copyFileSync(absSrc, absDst);
	const content = fs.readFileSync(absDst, 'utf-8');
	upsertNote(vault, target, content);

	const g = simpleGit(vault.path);
	await g.add([target]).catch(() => {});
	try {
		const res = await g.commit(`create: ${target} (copied from ${srcPath})`);
		return { path: target, sha: res.commit || null };
	} catch {
		return { path: target, sha: null };
	}
}
