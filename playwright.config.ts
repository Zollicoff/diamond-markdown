import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { buildFixture, FIXTURE_PATHS } from './e2e/setup-fixture';

const PORT = 4173;
const FIXTURE_ROOT = FIXTURE_PATHS.FIXTURE_ROOT;

// Build a clean test vault before the webServer boots.
buildFixture();

/**
 * Isolated test runtime. The `webServer` boots `npm run preview` (the
 * production-ish adapter-node build) with `DIAMOND_CONFIG_DIR` and
 * `DIAMOND_DEFAULT_VAULT_DIR` pointed at e2e-only paths, so smoke runs
 * never touch the user's real config or vault.
 */
export default defineConfig({
	testDir: './e2e',
	timeout: 30_000,
	fullyParallel: false,
	retries: process.env.CI ? 1 : 0,
	workers: 1,
	reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
	use: {
		baseURL: `http://127.0.0.1:${PORT}`,
		trace: 'on-first-retry',
		screenshot: 'only-on-failure'
	},
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }
	],
	webServer: {
		command: `node build`,
		url: `http://127.0.0.1:${PORT}/`,
		reuseExistingServer: false,
		timeout: 60_000,
		stdout: 'pipe',
		stderr: 'pipe',
		// Merge with process.env explicitly — Playwright's env-only mode
		// strips out HOME/PATH/etc, which broke node module resolution.
		env: {
			...process.env,
			PORT: String(PORT),
			HOST: '127.0.0.1',
			DIAMOND_CONFIG_DIR: path.join(FIXTURE_ROOT, 'config'),
			DIAMOND_DEFAULT_VAULT_DIR: path.join(FIXTURE_ROOT, 'vault')
		} as Record<string, string>
	}
});
