import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { commandSpec } from './command-runner.mjs';

const REQUIRED_BUILD_OUTPUT = ['build/handler.js', 'build/server/manifest.js'];
const REQUIRE_EXISTING_BUILD = process.env.DIAMOND_REQUIRE_EXISTING_BUILD === '1';
const BUILD_INPUT_PATHS = [
	'package.json',
	'package-lock.json',
	'svelte.config.js',
	'tsconfig.json',
	'vite.config.ts',
	'src'
];

function run(command, args, options = {}) {
	const spec = commandSpec(command, args);
	const result = spawnSync(spec.command, spec.args, {
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

function newestMtimeMs(target) {
	let stat;
	try {
		stat = fs.statSync(target);
	} catch {
		return 0;
	}
	if (!stat.isDirectory()) return stat.mtimeMs;

	let newest = stat.mtimeMs;
	for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
		if (entry.name === 'node_modules' || entry.name === '.svelte-kit' || entry.name === 'build') continue;
		newest = Math.max(newest, newestMtimeMs(path.join(target, entry.name)));
	}
	return newest;
}

function buildOutputStale() {
	const manifest = 'build/server/manifest.js';
	if (!fs.existsSync(manifest)) return true;
	const builtAt = fs.statSync(manifest).mtimeMs;
	const newestInput = Math.max(...BUILD_INPUT_PATHS.map(newestMtimeMs));
	return newestInput > builtAt;
}

function cleanBuildOutput() {
	for (const target of ['build', '.svelte-kit']) {
		fs.rmSync(target, { recursive: true, force: true });
	}
}

function ensureBuildOutput() {
	let missing = missingBuildOutput();
	let stale = missing.length === 0 && buildOutputStale();
	if (missing.length === 0 && !stale) return;
	if (REQUIRE_EXISTING_BUILD) {
		const reason = missing.length > 0
			? `incomplete: ${missing.join(', ')}`
			: 'older than source inputs';
		console.error(`Existing production build output is ${reason}`);
		process.exit(1);
	}
	for (let attempt = 1; attempt <= 2 && (missing.length > 0 || stale); attempt += 1) {
		if (attempt > 1) {
			const reason = missing.length > 0
				? `incomplete (${missing.join(', ')})`
				: 'older than source inputs';
			console.error(`Production build output ${reason}; retrying build.`);
		}
		cleanBuildOutput();
		run('npm', ['run', 'build', '--', '--logLevel', 'warn'], { timeoutMs: 90_000 });
		missing = missingBuildOutput();
		stale = missing.length === 0 && buildOutputStale();
	}
	if (missing.length > 0 || stale) {
		const reason = missing.length > 0
			? `incomplete: ${missing.join(', ')}`
			: 'older than source inputs';
		console.error(`Production build output ${reason}`);
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
