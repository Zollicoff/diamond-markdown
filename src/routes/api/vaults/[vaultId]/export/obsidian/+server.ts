import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getVault } from '$lib/server/vault';
import { buildObsidianExportPackage, ObsidianExportError } from '$lib/server/obsidian-export';

function contentDisposition(filename: string): string {
	return `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export const GET: RequestHandler = ({ params }) => {
	const vault = getVault(params.vaultId);
	if (!vault) throw error(404, 'vault not found');

	try {
		const pkg = buildObsidianExportPackage(vault);
		return new Response(new Uint8Array(pkg.bytes), {
			status: 200,
			headers: {
				'content-type': 'application/zip',
				'content-length': String(pkg.bytes.length),
				'content-disposition': contentDisposition(pkg.filename),
				'cache-control': 'no-store',
				'x-content-type-options': 'nosniff',
				'x-diamond-export-file-count': String(pkg.fileCount),
				'x-diamond-export-source-bytes': String(pkg.totalBytes)
			}
		});
	} catch (e) {
		if (e instanceof ObsidianExportError) throw error(e.status, e.message);
		throw error(500, (e as Error).message);
	}
};
