import type { LayoutServerLoad } from './$types';
import fs from 'node:fs';
import path from 'node:path';
import { listVaults, getActiveVault } from '$lib/server/vault';

interface VaultStats {
	noteCount: number;
	lastModified: number | null; // epoch ms of most-recently-touched note
}

function statsFor(vaultPath: string): VaultStats {
	let noteCount = 0;
	let lastModified: number | null = null;

	function walk(dir: string): void {
		let entries: fs.Dirent[];
		try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
		catch { return; }
		for (const e of entries) {
			if (e.name.startsWith('.') || e.name === 'node_modules') continue;
			const full = path.join(dir, e.name);
			if (e.isDirectory()) walk(full);
			else if (e.isFile() && e.name.endsWith('.md')) {
				noteCount++;
				try {
					const mtime = fs.statSync(full).mtimeMs;
					if (lastModified === null || mtime > lastModified) lastModified = mtime;
				} catch { /* skip */ }
			}
		}
	}
	walk(vaultPath);
	return { noteCount, lastModified };
}

export const load: LayoutServerLoad = async () => {
	const vaults = listVaults();
	return {
		vaults: vaults.map((v) => ({ ...v, stats: statsFor(v.path) })),
		activeVaultId: getActiveVault()?.id ?? null
	};
};
