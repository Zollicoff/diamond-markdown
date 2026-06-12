import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

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

run('Dependency audit', 'npm', ['audit', '--audit-level=moderate']);
run('Type and Svelte diagnostics', 'npm', ['run', 'check']);
cleanProductionBuildOutput();
run('Production build', 'npm', ['run', 'build', '--', '--logLevel', 'warn'], { CI: '1' });
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
