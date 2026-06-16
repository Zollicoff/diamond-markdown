import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		// Let the server/proxy handle compression. Adapter-side precompression
		// can make node build look for stale .br/.gz sidecars during repeated
		// release smoke runs.
		adapter: adapter({ precompress: false })
	}
};

export default config;
