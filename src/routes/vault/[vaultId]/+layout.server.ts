import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import fs from 'node:fs';
import path from 'node:path';
import { getVault } from '$lib/server/vault';

interface TreeNode {
	name: string;
	path: string;
	type: 'file' | 'directory';
	/** Modified time (ms since epoch). 0 for directories. */
	mtime: number;
	/** Created/birth time (ms since epoch). Falls back to mtime on
	 *  filesystems that don't track birthtime. 0 for directories. */
	ctime: number;
	children?: TreeNode[];
}

function walk(dir: string, base: string): TreeNode[] {
	let entries: fs.Dirent[];
	try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
	catch { return []; }
	const nodes: TreeNode[] = [];
	for (const e of entries) {
		if (e.name.startsWith('.') || e.name === 'node_modules') continue;
		const abs = path.join(dir, e.name);
		const rel = path.relative(base, abs).split(path.sep).join('/');
		if (e.isDirectory()) {
			nodes.push({
				name: e.name,
				path: rel,
				type: 'directory',
				mtime: 0,
				ctime: 0,
				children: walk(abs, base)
			});
		} else if (e.isFile() && e.name.endsWith('.md')) {
			let mtime = 0;
			let ctime = 0;
			try {
				const st = fs.statSync(abs);
				mtime = st.mtimeMs;
				// birthtime can be 0 on Linux ext4; fall back to mtime.
				ctime = st.birthtimeMs && st.birthtimeMs > 0 ? st.birthtimeMs : st.mtimeMs;
			} catch { /* permissions / race — leave zeros */ }
			nodes.push({ name: e.name, path: rel, type: 'file', mtime, ctime });
		}
	}
	// Default sort: directories first, then alphanumeric. Client may
	// re-sort based on user-selected mode (name/mtime/ctime asc/desc).
	return nodes.sort((a, b) => {
		if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
		return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
	});
}

export const load: LayoutServerLoad = async ({ params }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	return {
		vault: {
			id: vault.id,
			name: vault.name,
			path: vault.path,
			excludedFolders: vault.excludedFolders ?? []
		},
		tree: walk(vault.path, vault.path)
	};
};
