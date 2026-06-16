import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const notes = [];

function readJson(rel) {
	const abs = path.join(repoRoot, rel);
	try {
		return JSON.parse(fs.readFileSync(abs, 'utf-8'));
	} catch (err) {
		errors.push(`${rel} is not readable JSON: ${err instanceof Error ? err.message : String(err)}`);
		return {};
	}
}

function requireFile(rel, label = rel) {
	if (!fs.existsSync(path.join(repoRoot, rel))) errors.push(`Missing ${label}: ${rel}`);
}

function requireExecutable(rel, label = rel) {
	const abs = path.join(repoRoot, rel);
	if (!fs.existsSync(abs)) {
		errors.push(`Missing ${label}: ${rel}`);
		return;
	}
	try {
		fs.accessSync(abs, fs.constants.X_OK);
	} catch {
		errors.push(`${label} is not executable: ${rel}`);
	}
}

function requireScript(pkg, name) {
	if (!pkg.scripts?.[name]) errors.push(`Missing package script: ${name}`);
}

function readText(rel) {
	const abs = path.join(repoRoot, rel);
	try {
		return fs.readFileSync(abs, 'utf-8');
	} catch (err) {
		errors.push(`${rel} is not readable: ${err instanceof Error ? err.message : String(err)}`);
		return '';
	}
}

function requireText(text, needle, label) {
	if (!text.includes(needle)) errors.push(`Desktop workflow is missing ${label}.`);
}

function hostTriple() {
	try {
		return execFileSync('rustc', ['--print', 'host-tuple'], { cwd: repoRoot, encoding: 'utf-8' }).trim();
	} catch {
		try {
			const info = execFileSync('rustc', ['-vV'], { cwd: repoRoot, encoding: 'utf-8' });
			const match = /^host: (.+)$/m.exec(info);
			if (match) return match[1].trim();
		} catch {
			// handled below
		}
	}
	errors.push('Could not determine Rust host target triple; install Rust before desktop release verification.');
	return 'unknown-host';
}

function runSidecar(rel) {
	const abs = path.join(repoRoot, rel);
	const result = spawnSync(abs, ['--version'], { encoding: 'utf-8' });
	if (result.status !== 0) {
		errors.push(`Sidecar did not run \`--version\`: ${rel}`);
		return;
	}
	const version = (result.stdout || result.stderr).trim();
	if (!/^v\d+\.\d+\.\d+/.test(version)) {
		errors.push(`Sidecar version output did not look like Node.js: ${version || '(empty)'}`);
		return;
	}
	notes.push(`Sidecar ${rel} reports ${version}`);
}

function checkGitIgnored(rel) {
	const result = spawnSync('git', ['check-ignore', rel], {
		cwd: repoRoot,
		encoding: 'utf-8'
	});
	if (result.status !== 0) {
		errors.push(`Generated sidecar should be git-ignored but is not ignored: ${rel}`);
	}
}

const pkg = readJson('package.json');
const tauri = readJson('src-tauri/tauri.conf.json');
const sidecar = readJson('src-tauri/tauri.sidecar.conf.json');
const desktopWorkflow = readText('.github/workflows/desktop-release.yml');

for (const script of [
	'build',
	'desktop:prepare-node-sidecar',
	'desktop:build:self-contained',
	'desktop:build:self-contained:all',
	'desktop:build:self-contained:debug'
]) {
	requireScript(pkg, script);
}

if (pkg.version && tauri.version && pkg.version !== tauri.version) {
	errors.push(`package.json version (${pkg.version}) does not match src-tauri/tauri.conf.json version (${tauri.version})`);
}
if (tauri.productName !== 'Diamond Markdown') errors.push('Tauri productName must remain "Diamond Markdown".');
if (!tauri.identifier) errors.push('Tauri identifier is required for signed desktop releases.');
if (tauri.bundle?.active !== true) errors.push('Tauri bundle.active must be true for release builds.');
if (tauri.bundle?.targets !== 'all') errors.push('Tauri bundle.targets should remain "all" for release builds.');
if (pkg.scripts?.['desktop:build:self-contained'] !== 'node scripts/build-desktop-artifacts.mjs') {
	errors.push('desktop:build:self-contained must use scripts/build-desktop-artifacts.mjs for CI-safe bundle target selection.');
}

requireText(desktopWorkflow, "tags:\n      - 'v*'", 'the v* tag release trigger');
requireText(desktopWorkflow, 'publish-draft-release:', 'the draft release publishing job');
requireText(desktopWorkflow, "if: startsWith(github.ref, 'refs/tags/v')", 'the tag-only draft release guard');
requireText(desktopWorkflow, 'actions/download-artifact@v4', 'desktop artifact download before release publishing');
requireText(desktopWorkflow, 'contents: write', 'release job contents write permission');
requireText(desktopWorkflow, 'gh release create', 'GitHub Release creation');
requireText(desktopWorkflow, 'gh release upload', 'GitHub Release upload/update path');

if (tauri.bundle?.resources?.['../build/'] !== 'backend/build') {
	errors.push('Tauri bundle resources must map ../build/ to backend/build.');
}
if (tauri.bundle?.resources?.['../sample-vault/'] !== 'sample-vault') {
	errors.push('Tauri bundle resources must include ../sample-vault/ as sample-vault.');
}

for (const rel of [
	'build/index.js',
	'build/handler.js',
	'build/server/manifest.js',
	'sample-vault/README.md',
	'scripts/build-desktop-artifacts.mjs',
	'src-tauri/icons/icon.icns',
	'src-tauri/icons/icon.ico',
	'src-tauri/icons/icon.png'
]) {
	requireFile(rel);
}

const externalBin = sidecar.bundle?.externalBin;
if (!Array.isArray(externalBin) || !externalBin.includes('binaries/node')) {
	errors.push('src-tauri/tauri.sidecar.conf.json must include bundle.externalBin ["binaries/node"].');
}

const triple = hostTriple();
const sidecarRel = `src-tauri/binaries/node-${triple}${process.platform === 'win32' ? '.exe' : ''}`;
requireExecutable(sidecarRel, 'prepared Node sidecar');
if (fs.existsSync(path.join(repoRoot, sidecarRel))) {
	runSidecar(sidecarRel);
	checkGitIgnored(sidecarRel);
	const sizeMiB = (fs.statSync(path.join(repoRoot, sidecarRel)).size / 1024 / 1024).toFixed(1);
	notes.push(`Prepared sidecar size: ${sizeMiB} MiB`);
}

const signingVars = [
	'TAURI_SIGNING_PRIVATE_KEY',
	'TAURI_SIGNING_PRIVATE_KEY_PASSWORD',
	'APPLE_CERTIFICATE',
	'APPLE_CERTIFICATE_PASSWORD',
	'APPLE_SIGNING_IDENTITY',
	'APPLE_ID',
	'APPLE_PASSWORD',
	'APPLE_TEAM_ID'
];
const presentSigningVars = signingVars.filter((name) => Boolean(process.env[name]));
notes.push(`Signing/notarization env present: ${presentSigningVars.length}/${signingVars.length}`);

if (errors.length > 0) {
	console.error('\nDesktop release preflight failed:');
	for (const err of errors) console.error(`- ${err}`);
	process.exit(1);
}

console.log('Desktop release preflight passed.');
console.log(`Host: ${os.platform()} ${os.arch()} / ${triple}`);
for (const note of notes) console.log(`- ${note}`);
