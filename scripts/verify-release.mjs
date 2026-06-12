import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function commandFor(command) {
	if (process.platform === 'win32' && command === 'npm') return 'npm.cmd';
	return command;
}

function runCommand(label, command, args, env = {}, options = {}) {
	console.log(`\n==> ${label}`);
	console.log(`$ ${[command, ...args].join(' ')}`);
	return spawnSync(commandFor(command), args, {
		stdio: 'inherit',
		env: { ...process.env, ...env },
		timeout: options.timeoutMs,
		killSignal: 'SIGTERM'
	});
}

function failedStatus(result) {
	if (result.error) {
		if (result.error.code === 'ETIMEDOUT') return 'timed out';
		return result.error.message;
	}
	if (typeof result.status === 'number') return `exited ${result.status}`;
	if (result.signal) return `signaled ${result.signal}`;
	return 'failed';
}

function run(label, command, args, env = {}, options = {}) {
	const result = runCommand(label, command, args, env, options);
	if (result.status !== 0) {
		console.error(`${label} ${failedStatus(result)}.`);
		process.exit(result.status ?? 1);
	}
}

function runWithRetry(label, command, args, env = {}, options = {}) {
	const attempts = options.attempts ?? 2;
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		if (attempt > 1) console.log(`Retrying ${label} (${attempt}/${attempts})...`);
		options.beforeAttempt?.(attempt);
		const result = runCommand(label, command, args, env, options);
		if (result.status === 0) return;
		console.error(`${label} attempt ${attempt}/${attempts} ${failedStatus(result)}.`);
		if (attempt < attempts) sleep(1000);
	}
	process.exit(1);
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
runWithRetry('Production build', 'npm', ['run', 'build', '--', '--logLevel', 'warn'], { CI: '1' }, {
	attempts: 2,
	timeoutMs: 90_000,
	beforeAttempt: cleanProductionBuildOutput
});
waitForProductionBuildOutput();
run('Basic Auth production smoke', 'npm', ['run', 'verify:auth']);
run('Read-only production smoke', 'npm', ['run', 'verify:readonly']);
run('Full Playwright e2e suite', 'npm', ['run', 'test:e2e:batches']);

console.log('\nRelease verification passed.');
