import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const REQUIRED_BUILD_OUTPUT = ['build/handler.js', 'build/server/manifest.js'];
const REQUIRE_EXISTING_BUILD = process.env.DIAMOND_REQUIRE_EXISTING_BUILD === '1';

function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		stdio: 'inherit',
		env: process.env,
		timeout: options.timeoutMs,
		killSignal: 'SIGTERM'
	});
	if (result.error) throw result.error;
	if (result.status !== 0) process.exit(result.status ?? 1);
}

function missingBuildOutput() {
	const missing = REQUIRED_BUILD_OUTPUT.filter((file) => !fs.existsSync(file));
	if (missing.length > 0) return missing;

	const manifest = fs.readFileSync('build/server/manifest.js', 'utf-8');
	const chunkRefs = [...manifest.matchAll(/import\('(\.\/chunks\/[^']+)'\)/g)].map((match) =>
		path.join('build/server', match[1])
	);
	return chunkRefs.filter((file) => !fs.existsSync(file));
}

function cleanBuildOutput() {
	for (const target of ['build', '.svelte-kit']) {
		fs.rmSync(target, { recursive: true, force: true });
	}
}

function ensureBuildOutput() {
	let missing = missingBuildOutput();
	if (missing.length === 0) return;
	if (REQUIRE_EXISTING_BUILD) {
		console.error(`Existing production build output is incomplete: ${missing.join(', ')}`);
		process.exit(1);
	}
	for (let attempt = 1; attempt <= 2 && missing.length > 0; attempt += 1) {
		if (attempt > 1) {
			console.error(`Production build output incomplete (${missing.join(', ')}); retrying build.`);
		}
		cleanBuildOutput();
		run(npmCommand, ['run', 'build', '--', '--logLevel', 'warn'], { timeoutMs: 90_000 });
		missing = missingBuildOutput();
	}
	if (missing.length > 0) {
		console.error(`Production build output incomplete: ${missing.join(', ')}`);
		process.exit(1);
	}
}

run(process.execPath, ['e2e/setup-fixture.mjs']);
ensureBuildOutput();

const preview = spawn(process.execPath, ['scripts/e2e-preview-server.mjs'], {
	stdio: 'inherit',
	env: process.env
});

function stop(signal) {
	if (!preview.killed) preview.kill(signal);
	setTimeout(() => process.exit(0), 500).unref();
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

preview.on('error', (err) => {
	console.error(err);
	process.exit(1);
});

preview.on('exit', (code, signal) => {
	if (signal) process.exit(1);
	process.exit(code ?? 0);
});
