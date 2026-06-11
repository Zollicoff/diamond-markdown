import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const binariesDir = path.join(repoRoot, 'src-tauri', 'binaries');
const cacheDir = path.join(binariesDir, '.cache');
const extension = process.platform === 'win32' ? '.exe' : '';

function rustHostTriple() {
	try {
		return execSync('rustc --print host-tuple', { encoding: 'utf8' }).trim();
	} catch {
		const info = execSync('rustc -vV', { encoding: 'utf8' });
		const match = /^host: (.+)$/m.exec(info);
		if (!match) throw new Error('Could not determine Rust host target triple');
		return match[1].trim();
	}
}

function whichNode() {
	const command = process.platform === 'win32' ? 'where' : 'which';
	const output = execFileSync(command, ['node'], { encoding: 'utf8' }).trim();
	const first = output.split(/\r?\n/).find(Boolean);
	if (!first) throw new Error('Could not locate node on PATH');
	return fs.realpathSync(first);
}

function nodeDistPlatform() {
	if (process.platform === 'darwin') return 'darwin';
	if (process.platform === 'linux') return 'linux';
	return null;
}

function nodeDistArch() {
	if (process.arch === 'arm64') return 'arm64';
	if (process.arch === 'x64') return 'x64';
	return null;
}

function officialNodeRuntime() {
	const platform = nodeDistPlatform();
	const arch = nodeDistArch();
	if (!platform || !arch) return null;

	const version = process.env.DIAMOND_NODE_VERSION ?? process.versions.node;
	const packageName = `node-v${version}-${platform}-${arch}`;
	const executable = path.join(cacheDir, packageName, 'bin', `node${extension}`);
	if (fs.existsSync(executable)) return fs.realpathSync(executable);

	fs.mkdirSync(cacheDir, { recursive: true });
	const archive = path.join(cacheDir, `${packageName}.tar.gz`);
	const url = `https://nodejs.org/dist/v${version}/${packageName}.tar.gz`;

	execFileSync('curl', ['-fsSL', url, '-o', archive], { stdio: 'inherit' });
	execFileSync('tar', ['-xzf', archive, '-C', cacheDir], { stdio: 'inherit' });

	if (!fs.existsSync(executable)) {
		throw new Error(`Downloaded Node runtime did not contain ${executable}`);
	}

	return fs.realpathSync(executable);
}

function sourceRuntime() {
	if (process.env.DIAMOND_NODE_SOURCE) {
		return {
			source: fs.realpathSync(process.env.DIAMOND_NODE_SOURCE),
			description: 'DIAMOND_NODE_SOURCE'
		};
	}

	const officialRuntime = officialNodeRuntime();
	if (officialRuntime) {
		return {
			source: officialRuntime,
			description: `Node.js official runtime v${process.env.DIAMOND_NODE_VERSION ?? process.versions.node}`
		};
	}

	return {
		source: whichNode(),
		description: 'PATH node'
	};
}

const targetTriple = rustHostTriple();
const { source, description } = sourceRuntime();
const target = path.join(binariesDir, `node-${targetTriple}${extension}`);

fs.mkdirSync(binariesDir, { recursive: true });
fs.copyFileSync(source, target);
fs.chmodSync(target, 0o755);

const version = execFileSync(target, ['--version'], { encoding: 'utf8' }).trim();
const sizeMiB = (fs.statSync(target).size / 1024 / 1024).toFixed(1);

console.log(`Prepared Node sidecar: ${path.relative(repoRoot, target)}`);
console.log(`Source: ${source}`);
console.log(`Source kind: ${description}`);
console.log(`Version: ${version}`);
console.log(`Size: ${sizeMiB} MiB`);
console.log(`Host: ${os.platform()} ${os.arch()} / ${targetTriple}`);
