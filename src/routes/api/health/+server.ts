import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isReadOnlyMode } from '$lib/server/read-only';

export const GET: RequestHandler = () => {
	return json({
		ok: true,
		service: 'diamondmarkdown',
		readOnly: isReadOnlyMode()
	});
};
