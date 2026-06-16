import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultBundleDir = path.join(repoRoot, 'src-tauri', 'target', 'release', 'bundle');
const bundleDir = path.resolve(process.env.DIAMOND_DESKTOP_BUNDLE_DIR || defaultBundleDir);
const manifestPath = path.resolve(
	process.env.DIAMOND_DESKTOP_MANIFEST_PATH ||
		path.join(bundleDir, 'diamond-desktop-artifacts.manifest.json')
);

function readJson(rel) {
	return JSON.parse(fs.readFileSync(path.join(repoRoot, rel), 'utf-8'));
}

function gitOutput(args) {
	try {
		return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf-8' }).trim();
	} catch {
		return null;
	}
}

function toPosix(rel) {
	return rel.split(path.sep).join('/');
}

function assertInside(child, parent, label) {
	const rel = path.relative(parent, child);
	if (rel.startsWith('..') || path.isAbsolute(rel)) {
		throw new Error(`${label} must stay inside ${parent}: ${child}`);
	}
}

function walk(dir) {
	const entries = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const abs = path.join(dir, entry.name);
		if (abs === manifestPath) continue;
		if (entry.isDirectory()) {
			entries.push(...walk(abs));
			continue;
		}
		if (entry.isFile()) entries.push(abs);
	}
	return entries;
}

function sha256(abs) {
	const hash = crypto.createHash('sha256');
	hash.update(fs.readFileSync(abs));
	return hash.digest('hex');
}

if (!fs.existsSync(bundleDir) || !fs.statSync(bundleDir).isDirectory()) {
	console.error(`Desktop bundle directory does not exist: ${bundleDir}`);
	process.exit(1);
}

assertInside(manifestPath, bundleDir, 'Desktop artifact manifest path');

const pkg = readJson('package.json');
const tauri = readJson('src-tauri/tauri.conf.json');
const files = walk(bundleDir)
	.map((abs) => {
		const stat = fs.statSync(abs);
		return {
			path: toPosix(path.relative(bundleDir, abs)),
			sizeBytes: stat.size,
			sha256: sha256(abs)
		};
	})
	.sort((a, b) => a.path.localeCompare(b.path));

if (files.length === 0) {
	console.error(`Desktop bundle directory contains no artifact files: ${bundleDir}`);
	process.exit(1);
}

const requestedBundles = process.env.DIAMOND_DESKTOP_BUNDLES
	? process.env.DIAMOND_DESKTOP_BUNDLES.split(',').map((value) => value.trim()).filter(Boolean)
	: [];

const manifest = {
	schemaVersion: 1,
	productName: tauri.productName || pkg.name,
	generatedAt: new Date().toISOString(),
	source: {
		commit: process.env.GITHUB_SHA || gitOutput(['rev-parse', 'HEAD']),
		ref: process.env.GITHUB_REF_NAME || gitOutput(['branch', '--show-current']),
		workflowRunId: process.env.GITHUB_RUN_ID || null
	},
	versions: {
		package: pkg.version || null,
		tauri: tauri.version || null
	},
	platform: {
		node: process.version,
		os: process.platform,
		arch: process.arch,
		runnerOs: process.env.RUNNER_OS || os.platform()
	},
	bundles: requestedBundles,
	bundleDirectory: toPosix(path.relative(repoRoot, bundleDir)),
	files
};

fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const totalBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0);
const relManifest = toPosix(path.relative(repoRoot, manifestPath));
console.log(`Wrote desktop artifact manifest: ${relManifest}`);
console.log(`- Files: ${files.length}`);
console.log(`- Total size: ${(totalBytes / 1024 / 1024).toFixed(1)} MiB`);
