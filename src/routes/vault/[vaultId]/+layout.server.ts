import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import fs from 'node:fs';
import path from 'node:path';
import { getVault } from '$lib/server/vault';

interface TreeNode {
	name: string;
	path: string;
	type: 'file' | 'directory';
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
			nodes.push({ name: e.name, path: rel, type: 'directory', children: walk(abs, base) });
		} else if (e.isFile() && e.name.endsWith('.md')) {
			nodes.push({ name: e.name, path: rel, type: 'file' });
		}
	}
	return nodes.sort((a, b) => {
		if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
		return a.name.localeCompare(b.name);
	});
}

export const load: LayoutServerLoad = async ({ params }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	return {
		vault: { id: vault.id, name: vault.name },
		tree: walk(vault.path, vault.path)
	};
};
