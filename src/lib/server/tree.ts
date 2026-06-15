import fs from 'node:fs';
import path from 'node:path';
import type { TreeNode } from '$lib/types';
import type { Vault } from './vault';
import { shouldShowUnsupportedFiles } from './obsidian-config';

export interface BuildVaultTreeOptions {
	showUnsupportedFiles?: boolean;
}

function fileKind(name: string, showUnsupportedFiles: boolean): TreeNode['fileKind'] | null {
	const lower = name.toLowerCase();
	if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown';
	if (lower.endsWith('.canvas')) return 'canvas';
	if (showUnsupportedFiles) return 'unsupported';
	return null;
}

function fileTimes(abs: string): { mtime: number; ctime: number } {
	try {
		const stat = fs.statSync(abs);
		return {
			mtime: stat.mtimeMs,
			ctime: stat.birthtimeMs && stat.birthtimeMs > 0 ? stat.birthtimeMs : stat.mtimeMs
		};
	} catch {
		return { mtime: 0, ctime: 0 };
	}
}

function normalizeExcluded(folders: string[] | undefined): Set<string> {
	return new Set((folders ?? []).map((folder) => folder.replace(/^\/+|\/+$/g, '')).filter(Boolean));
}

function walk(dir: string, base: string, excluded: Set<string>, showUnsupportedFiles: boolean): TreeNode[] {
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return [];
	}

	const nodes: TreeNode[] = [];
	for (const entry of entries) {
		if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
		const abs = path.join(dir, entry.name);
		const rel = path.relative(base, abs).split(path.sep).join('/');
		if (entry.isDirectory()) {
			if (excluded.has(rel)) continue;
			nodes.push({
				name: entry.name,
				path: rel,
				type: 'directory',
				mtime: 0,
				ctime: 0,
				children: walk(abs, base, excluded, showUnsupportedFiles)
			});
			continue;
		}

		if (!entry.isFile()) continue;
		const kind = fileKind(entry.name, showUnsupportedFiles);
		if (!kind) continue;
		const times = fileTimes(abs);
		nodes.push({
			name: entry.name,
			path: rel,
			type: 'file',
			fileKind: kind,
			...times
		});
	}

	return nodes.sort((a, b) => {
		if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
		return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
	});
}

export function buildVaultTree(vault: Vault, options: BuildVaultTreeOptions = {}): TreeNode[] {
	const showUnsupportedFiles = options.showUnsupportedFiles ?? shouldShowUnsupportedFiles(vault.path);
	return walk(vault.path, vault.path, normalizeExcluded(vault.excludedFolders), showUnsupportedFiles);
}
