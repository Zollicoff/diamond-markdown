import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { commandSpec } from './command-runner.mjs';

const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const env = { ...process.env };

if (!env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(macChrome)) {
	env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = macChrome;
}

const groups = [
	{
		label: 'App shell and Obsidian export smoke',
		args: [
			'playwright',
			'test',
			'e2e/smoke.spec.ts',
			'e2e/obsidian-export.spec.ts',
			'--project=chromium'
		]
	},
	{
		label: 'Canvas v1 smoke',
		args: [
			'playwright',
			'test',
			'e2e/canvas-view.spec.ts',
			'--project=chromium',
			'--grep',
			[
				'canvas API and file tree open an editable Obsidian Canvas preview',
				'canvas view renders and creates Obsidian Canvas groups',
				'canvas API adds, edits, moves, and deletes cards with clean git commits and stale guards',
				'canvas view adds, edits, and removes labeled edges between nodes',
				'canvas API renames, moves, and deletes Canvas files with clean git commits'
			].join('|')
		]
	},
	{
		label: 'Focused v1 feature smoke',
		args: [
			'playwright',
			'test',
			'e2e/features.spec.ts',
			'--project=chromium',
			'--grep',
			[
				'Obsidian import check reports vault readiness without changing files',
				'home add vault form previews Obsidian import checklist',
				'search rail icon opens a search tab; results fire on input',
				'search tab saves, restores, and deletes vault-local saved searches',
				'settings exposes GitHub sync status and controls',
				'settings shows local git changes recovery guidance before sync actions',
				'sync now pushes local commits and pulls fast-forward remote commits',
				'Obsidian local trash keeps deleted notes, Canvas files, and folders inside vault trash'
			].join('|')
		]
	}
];

function failedStatus(result) {
	if (result.error) return result.error.message;
	if (typeof result.status === 'number') return `exited ${result.status}`;
	if (result.signal) return `signaled ${result.signal}`;
	return 'failed';
}

for (const group of groups) {
	const spec = commandSpec('npx', group.args);
	console.log(`\n==> ${group.label}`);
	console.log(`$ ${spec.display}`);
	const result = spawnSync(spec.command, spec.args, {
		stdio: 'inherit',
		env
	});
	if (result.status !== 0) {
		console.error(`${group.label} ${failedStatus(result)}.`);
		process.exit(result.status ?? 1);
	}
}

console.log('\nV1 smoke verification passed.');
