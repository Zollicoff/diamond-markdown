import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'node:fs';
import { getVault } from '$lib/server/vault';
import { resolveInVault } from '$lib/server/paths';

export const POST: RequestHandler = async ({ params, request }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	const body = (await request.json().catch(() => ({}))) as { path?: string };
	const rel = (body.path ?? '').replace(/^\/+/, '').trim();
	if (!rel) throw error(400, 'path required');
	let abs: string;
	try { abs = resolveInVault(vault, rel); }
	catch (e) { throw error(400, (e as Error).message); }
	if (fs.existsSync(abs)) {
		if (fs.statSync(abs).isDirectory()) return json({ ok: true, existed: true });
		throw error(409, 'path exists and is not a directory');
	}
	fs.mkdirSync(abs, { recursive: true });
	return json({ ok: true, existed: false });
};

export const DELETE: RequestHandler = async ({ params, url }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');
	const rel = (url.searchParams.get('path') ?? '').replace(/^\/+/, '').trim();
	if (!rel) throw error(400, 'path required');
	let abs: string;
	try { abs = resolveInVault(vault, rel); }
	catch (e) { throw error(400, (e as Error).message); }
	if (!fs.existsSync(abs)) return json({ ok: true });
	if (!fs.statSync(abs).isDirectory()) throw error(409, 'not a directory');
	// Guard against accidentally deleting non-empty folders without a force flag.
	const entries = fs.readdirSync(abs);
	if (entries.length > 0) throw error(409, 'folder not empty');
	fs.rmdirSync(abs);
	return json({ ok: true });
};
