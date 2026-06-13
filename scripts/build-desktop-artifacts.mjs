import { spawnSync } from 'node:child_process';
import { commandSpec, formatCommand } from './command-runner.mjs';

const defaultBundlesByPlatform = {
	darwin: 'app',
	win32: 'nsis',
	linux: 'deb,appimage'
};

function failStatus(result) {
	if (result.error) return result.error.message;
	if (typeof result.status === 'number') return `exited ${result.status}`;
	if (result.signal) return `signaled ${result.signal}`;
	return 'failed';
}

function run(label, command, args) {
	const spec = commandSpec(command, args);
	console.log(`\n==> ${label}`);
	console.log(`$ ${formatCommand(command, args)}`);
	const result = spawnSync(spec.command, spec.args, {
		stdio: 'inherit',
		env: process.env
	});
	if (result.status !== 0) {
		console.error(`${label} ${failStatus(result)}.`);
		process.exit(result.status ?? 1);
	}
}

const bundles = process.env.DIAMOND_DESKTOP_BUNDLES || defaultBundlesByPlatform[process.platform];

if (!bundles) {
	console.error(`No default Tauri bundle target is configured for platform ${process.platform}.`);
	console.error('Set DIAMOND_DESKTOP_BUNDLES to a comma-separated Tauri bundle list.');
	process.exit(1);
}

console.log(`Building unsigned desktop artifacts for ${process.platform}: ${bundles}`);
run('Prepare Node sidecar', 'npm', ['run', 'desktop:prepare-node-sidecar']);
run('Build Tauri desktop artifacts', 'npx', [
	'tauri',
	'build',
	'--config',
	'src-tauri/tauri.sidecar.conf.json',
	'--bundles',
	bundles,
	'--ci',
	'--no-sign'
]);

console.log('\nDesktop artifact build passed.');
