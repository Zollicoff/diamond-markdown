import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const e2ePort = String(4300 + Math.floor(Math.random() * 2000));

function run(label, command, args, env = {}) {
	console.log(`\n==> ${label}`);
	console.log(`$ ${[command, ...args].join(' ')}`);
	const result = spawnSync(command, args, {
		stdio: 'inherit',
		env: { ...process.env, ...env }
	});
	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

function playwrightEnv() {
	if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) return {};
	if (process.platform === 'darwin' && fs.existsSync(macChrome)) {
		return { PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: macChrome };
	}
	return {};
}

function cleanProductionBuildOutput() {
	console.log('\n==> Clean production build output');
	for (const target of ['build', '.svelte-kit']) {
		fs.rmSync(target, { recursive: true, force: true });
		console.log(`removed ${target}`);
	}
}

function sleep(ms) {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function missingProductionBuildFiles() {
	const required = ['build/handler.js', 'build/server/manifest.js'];
	const missing = required.filter((file) => !fs.existsSync(file));
	if (missing.length > 0) return missing;

	const manifest = fs.readFileSync('build/server/manifest.js', 'utf-8');
	const chunkRefs = [...manifest.matchAll(/import\('(\.\/chunks\/[^']+)'\)/g)]
		.map((match) => path.join('build/server', match[1]));
	return chunkRefs.filter((file) => !fs.existsSync(file));
}

function waitForProductionBuildOutput() {
	console.log('\n==> Verify production build output');
	const deadline = Date.now() + 5000;
	let missing = missingProductionBuildFiles();
	while (missing.length > 0 && Date.now() < deadline) {
		sleep(100);
		missing = missingProductionBuildFiles();
	}
	if (missing.length > 0) {
		console.error(`Production build output is incomplete: ${missing.join(', ')}`);
		process.exit(1);
	}
	console.log('Production build output verified.');
}

run('Dependency audit', 'npm', ['audit', '--audit-level=moderate']);
run('Type and Svelte diagnostics', 'npm', ['run', 'check']);
cleanProductionBuildOutput();
run('Production build', 'npm', ['run', 'build', '--', '--logLevel', 'warn'], { CI: '1' });
waitForProductionBuildOutput();
run('Basic Auth production smoke', 'npm', ['run', 'verify:auth']);
run('Read-only production smoke', 'npm', ['run', 'verify:readonly']);
run('Full Playwright e2e suite', 'npm', ['run', 'test:e2e'], {
	CI: '1',
	DIAMOND_BASIC_AUTH: '',
	DIAMOND_READ_ONLY: '',
	PLAYWRIGHT_PORT: e2ePort,
	...playwrightEnv()
});

console.log('\nRelease verification passed.');
