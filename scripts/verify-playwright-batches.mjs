import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEFAULT_SPLIT_TESTS_PER_BATCH = 1;
const DEFAULT_TIMEOUT_MS = 120_000;
const e2eDir = 'e2e';
const splitSpecFiles = new Set([
	path.join(e2eDir, 'attachments.spec.ts'),
	path.join(e2eDir, 'canvas-view.spec.ts'),
	path.join(e2eDir, 'features.spec.ts')
]);
const requiredBuildOutput = ['build/handler.js', 'build/server/manifest.js'];
const batchFixtureRunRoot = path.resolve(e2eDir, '.fixture-root', 'batches', `${process.pid}-${Date.now()}`);

function commandFor(command) {
	if (process.platform === 'win32' && command === 'npm') return 'npm.cmd';
	return command;
}

function parsePositiveInt(value, fallback) {
	const parsed = Number.parseInt(value ?? '', 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function pickFreeLoopbackPort() {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			if (!address || typeof address === 'string') {
				server.close(() => reject(new Error('Could not reserve a loopback port for Playwright.')));
				return;
			}
			server.close(() => resolve(address.port));
		});
	});
}

async function playwrightEnv(batchIndex) {
	const env = {
		CI: '1',
		DIAMOND_BASIC_AUTH: '',
		DIAMOND_READ_ONLY: '',
		DIAMOND_E2E_FIXTURE_ROOT: path.join(batchFixtureRunRoot, `batch-${String(batchIndex).padStart(3, '0')}`),
		DIAMOND_REQUIRE_EXISTING_BUILD: '1',
		PLAYWRIGHT_PORT: String(await pickFreeLoopbackPort())
	};
	if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && process.platform === 'darwin' && fs.existsSync(macChrome)) {
		env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = macChrome;
	}
	return env;
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

function sleep(ms) {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function cleanProductionBuildOutput() {
	for (const target of ['build', '.svelte-kit']) {
		fs.rmSync(target, { recursive: true, force: true });
	}
}

function cleanBatchFixtureRunRoot() {
	if (!fs.existsSync(batchFixtureRunRoot)) return;
	try {
		fs.rmSync(batchFixtureRunRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
	} catch (error) {
		console.warn(`Could not remove batch fixture root ${batchFixtureRunRoot}: ${error.message}`);
	}
}

function missingProductionBuildFiles() {
	const missing = requiredBuildOutput.filter((file) => !fs.existsSync(file));
	if (missing.length > 0) return missing;

	const manifest = fs.readFileSync('build/server/manifest.js', 'utf-8');
	const chunkRefs = [...manifest.matchAll(/import\('(\.\/chunks\/[^']+)'\)/g)]
		.map((match) => path.join('build/server', match[1]));
	return chunkRefs.filter((file) => !fs.existsSync(file));
}

function runBuildAttempt(attempt) {
	if (attempt > 1) console.log(`Retrying production build (${attempt}/2)...`);
	cleanProductionBuildOutput();
	const result = spawnSync(commandFor('npm'), ['run', 'build', '--', '--logLevel', 'warn'], {
		stdio: 'inherit',
		env: { ...process.env, CI: '1' },
		timeout: 90_000,
		killSignal: 'SIGTERM'
	});
	if (result.status !== 0) {
		console.error(`Production build attempt ${attempt}/2 ${failedStatus(result)}.`);
		return false;
	}
	const missing = missingProductionBuildFiles();
	if (missing.length > 0) {
		console.error(`Production build output incomplete: ${missing.join(', ')}`);
		return false;
	}
	return true;
}

function ensureProductionBuildOutput() {
	const missing = missingProductionBuildFiles();
	if (missing.length === 0) return;
	console.log(`\n==> Prepare production build output`);
	console.log(`Existing production build output is incomplete: ${missing.join(', ')}`);
	for (let attempt = 1; attempt <= 2; attempt += 1) {
		if (runBuildAttempt(attempt)) return;
		if (attempt < 2) sleep(1000);
	}
	process.exit(1);
}

function listSpecFiles() {
	return fs
		.readdirSync(e2eDir)
		.filter((file) => file.endsWith('.spec.ts'))
		.map((file) => path.join(e2eDir, file))
		.sort();
}

function testRefsForSpec(spec) {
	const source = fs.readFileSync(spec, 'utf-8');
	const refs = [];
	const testPattern = /^\s*test\(/;
	for (const [index, line] of source.split(/\r?\n/).entries()) {
		if (testPattern.test(line)) refs.push(`${spec}:${index + 1}`);
	}
	return refs;
}

function chunk(items, size) {
	const chunks = [];
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}
	return chunks;
}

function plannedBatches() {
	const testsPerBatch = parsePositiveInt(
		process.env.DIAMOND_SPLIT_TESTS_PER_BATCH ?? process.env.DIAMOND_TESTS_PER_BATCH ?? process.env.DIAMOND_FEATURE_TESTS_PER_BATCH,
		DEFAULT_SPLIT_TESTS_PER_BATCH
	);
	return listSpecFiles().flatMap((spec) => {
		const refs = testRefsForSpec(spec);
		if (refs.length === 0 || !splitSpecFiles.has(spec)) {
			return [{ label: spec, targets: [spec], testCount: refs.length || 1 }];
		}
		return chunk(refs, testsPerBatch).map((targets, index, batches) => ({
			label: batches.length === 1 ? spec : `${spec} batch ${index + 1}`,
			targets,
			testCount: targets.length
		}));
	});
}

async function runBatch(batch, batchIndex, batchCount, timeoutMs) {
	const args = ['run', 'test:e2e', '--', ...batch.targets];
	console.log(`\n==> Playwright e2e batch ${batchIndex}/${batchCount}: ${batch.label}`);
	console.log(`$ npm ${args.join(' ')}`);
	const env = await playwrightEnv(batchIndex);
	const result = spawnSync(commandFor('npm'), args, {
		stdio: 'inherit',
		env: { ...process.env, ...env },
		timeout: timeoutMs,
		killSignal: 'SIGTERM'
	});
	if (result.status !== 0) {
		console.error(`Playwright e2e batch ${batchIndex}/${batchCount} ${failedStatus(result)}.`);
		process.exit(result.status ?? 1);
	}
}

const timeoutMs = parsePositiveInt(
	process.env.DIAMOND_PLAYWRIGHT_BATCH_TIMEOUT_MS ?? process.env.DIAMOND_PLAYWRIGHT_SHARD_TIMEOUT_MS,
	DEFAULT_TIMEOUT_MS
);
const batches = plannedBatches();
const discoveredTestCount = batches.reduce((sum, batch) => sum + batch.testCount, 0);

cleanBatchFixtureRunRoot();
ensureProductionBuildOutput();

for (let batchIndex = 1; batchIndex <= batches.length; batchIndex += 1) {
	await runBatch(batches[batchIndex - 1], batchIndex, batches.length, timeoutMs);
}

cleanBatchFixtureRunRoot();
console.log(`\nPlaywright e2e suite passed: ${discoveredTestCount} discovered tests across ${batches.length} batches.`);
