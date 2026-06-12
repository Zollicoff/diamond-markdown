import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command, args) {
	const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
	if (result.error) throw result.error;
	if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, ['e2e/setup-fixture.mjs']);

if (!fs.existsSync('build/handler.js')) {
	run(npmCommand, ['run', 'build', '--', '--logLevel', 'warn']);
}

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
