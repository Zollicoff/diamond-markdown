import type { Handle } from '@sveltejs/kit';

/**
 * Strip the `rel="modulepreload"` Link response header that SvelteKit
 * emits for every page.
 *
 * Why: Safari over Tailscale HTTPS would issue the preloads from the
 * Link header but fail to match them to the subsequent dynamic import()
 * calls in the inline boot script, surfacing as
 * "TypeError: Importing a module script failed" plus a cascade of
 * "preloaded but not used within a few seconds" warnings, breaking
 * client-side hydration entirely (tabs, sidebar, everything).
 *
 * Chrome / Edge / Firefox match the preload to the import correctly.
 * Removing the Link header costs us nothing on those — the inline
 * `<link rel="modulepreload">` tags in the HTML head still drive the
 * preload there. Safari falls back to fetching modules on demand from
 * the import() call, which works.
 *
 * SvelteKit hardcodes the Link header to `rel="modulepreload"` (the
 * `kit.output.preloadStrategy` option only affects inline tags), so
 * the only place to drop it is here.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	response.headers.delete('link');
	return response;
};
