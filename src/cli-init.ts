import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { CONFIG_FILENAME, TargetConfigSchema } from './lib/target-config.js';

/**
 * Bootstrap a target application repository for agent-driven QA.
 *
 * Everything written here belongs to the product, not the engine: its
 * requirements, its scenarios, its generated tests, its evidence. The engine
 * stays reusable precisely because none of that lives inside it.
 *
 * Detection is best-effort and always visible in the emitted config, so a wrong
 * guess is a one-line edit rather than a mystery. Existing files are never
 * overwritten - re-running init on a configured repository must be safe.
 */

interface Detected {
  startCommand: string | undefined;
  baseURL: string;
  framework: string;
}

function detect(root: string): Detected {
  const packageJsonPath = resolve(root, 'package.json');

  if (!existsSync(packageJsonPath)) {
    return {
      startCommand: undefined,
      baseURL: 'http://localhost:3000/',
      framework: 'unknown',
    };
  }

  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const scripts = pkg.scripts ?? {};

  const startCommand = scripts.dev
    ? 'npm run dev'
    : scripts.start
      ? 'npm run start'
      : undefined;

  // Default ports differ per framework, and guessing 3000 for everything is the
  // single most common reason a harness cannot reach the application.
  let port = 3000;
  let framework = 'unknown';

  if (deps.vite || scripts.dev?.includes('vite')) {
    framework = 'vite';
    port = 5173;
  } else if (deps.next) {
    framework = 'next';
    port = 3000;
  } else if (deps['@angular/core']) {
    framework = 'angular';
    port = 4200;
  } else if (deps.nuxt) {
    framework = 'nuxt';
    port = 3000;
  }

  // Read an explicit port out of the dev script when one is pinned there.
  const explicitPort = scripts.dev?.match(/--port[= ](\d+)/)?.[1];
  if (explicitPort) {
    port = Number.parseInt(explicitPort, 10);
  }

  return {
    startCommand,
    // localhost rather than 127.0.0.1: dev servers commonly bind IPv6 loopback
    // only, and a hardcoded IPv4 host then fails to connect.
    baseURL: `http://localhost:${port}/`,
    framework,
  };
}

function writeIfAbsent(path: string, contents: string): 'created' | 'kept' {
  if (existsSync(path)) {
    return 'kept';
  }

  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, contents, 'utf8');
  return 'created';
}

function appendGitignore(root: string, entries: string[]): void {
  const path = resolve(root, '.gitignore');
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const missing = entries.filter((entry) => !existing.includes(entry));

  if (missing.length === 0) {
    return;
  }

  const block = [
    '',
    '# Agent QA evidence and credentials',
    '# Storage state can impersonate the account it was captured from.',
    ...missing,
    '',
  ].join('\n');

  writeFileSync(path, existing.replace(/\s*$/, '\n') + block, 'utf8');
}

const FIXTURES_TEMPLATE = `import { test as base, expect, type TestInfo } from '@playwright/test';

export interface BrowserSignals {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: Array<{ method: string; url: string; failure: string }>;
}

/**
 * Collects the browser evidence a screenshot cannot show.
 *
 * Recording is unconditional; failing on it is not. Most applications already
 * log harmless noise, and a harness that fails every test on the first console
 * warning gets switched off within a day. Set FAIL_ON_BROWSER_ERRORS=1 once the
 * application is clean enough to hold the line.
 */
export const test = base.extend<{ browserSignals: BrowserSignals }>({
  browserSignals: [
    async ({ page }, use, testInfo: TestInfo) => {
      const signals: BrowserSignals = {
        consoleErrors: [],
        pageErrors: [],
        failedRequests: [],
      };

      page.on('console', (message) => {
        if (message.type() === 'error') signals.consoleErrors.push(message.text());
      });
      page.on('pageerror', (error) => signals.pageErrors.push(error.message));
      page.on('requestfailed', (request) => {
        signals.failedRequests.push({
          method: request.method(),
          url: request.url(),
          failure: request.failure()?.errorText ?? 'Unknown network failure',
        });
      });

      await use(signals);

      await testInfo.attach('browser-signals', {
        body: Buffer.from(JSON.stringify(signals, null, 2), 'utf8'),
        contentType: 'application/json',
      });

      if (process.env.FAIL_ON_BROWSER_ERRORS === '1') {
        expect.soft(signals.pageErrors, 'Unexpected uncaught browser errors').toEqual([]);
        expect.soft(signals.consoleErrors, 'Unexpected browser console errors').toEqual([]);
      }
    },
    { auto: true },
  ],
});

export { expect };
`;

const SEED_TEMPLATE = `import { test, expect } from './fixtures.js';

/**
 * Proves the environment before any exploration happens.
 *
 * When this fails the problem is the application, the fixtures or the
 * configuration - not the feature under test. Exploring past a failing seed
 * produces scenarios built on a broken environment.
 */
const seedPath = process.env.SEED_PATH ?? './';
const seedHeading = process.env.SEED_HEADING;

test('application is reachable and renders its landing page', async ({ page }) => {
  const response = await page.goto(seedPath);

  // A SPA returning 500 can still render a shell, so the status is checked
  // rather than inferred from the page looking populated.
  expect(response?.status(), 'Landing page must not return an error status').toBeLessThan(400);

  if (seedHeading) {
    await expect(page.getByRole('heading', { name: seedHeading }).first()).toBeVisible();
  } else {
    await expect(page.locator('body')).not.toBeEmpty();
  }
});
`;

function playwrightConfigTemplate(cfg: {
  application: { baseURL: string; startCommand?: string; startupTimeoutMs: number };
  testing: { testDirectory: string };
  validation: { repeatEach: number };
}): string {
  return `import { defineConfig, devices } from '@playwright/test';

// Written by agent-qa init. Separate from any existing playwright.config so the
// QA suite can evolve without disturbing the project's own Playwright setup.
const baseURL = process.env.BASE_URL ?? ${JSON.stringify(cfg.application.baseURL)};
const webServerCommand = process.env.WEB_SERVER_COMMAND ?? ${JSON.stringify(cfg.application.startCommand ?? '')};

export default defineConfig({
  testDir: ${JSON.stringify('./' + cfg.testing.testDirectory)},
  outputDir: './artifacts/test-results',
  timeout: 30_000,
  expect: { timeout: 7_500 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'artifacts/playwright-report', open: 'never' }],
    ['json', { outputFile: 'artifacts/results.json' }],
  ],
  use: {
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],
  webServer: webServerCommand
    ? {
        command: webServerCommand,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: ${cfg.application.startupTimeoutMs},
        stdout: 'pipe',
        stderr: 'pipe',
      }
    : undefined,
});
`;
}

const targetIndex = process.argv.indexOf('--target');
const targetRoot = resolve(
  targetIndex !== -1 ? (process.argv[targetIndex + 1] ?? '.') : '.',
);

if (!existsSync(targetRoot)) {
  console.error(`Target does not exist: ${targetRoot}`);
  process.exit(1);
}

const detected = detect(targetRoot);

const config = TargetConfigSchema.parse({
  version: 1,
  application: {
    baseURL: detected.baseURL,
    startCommand: detected.startCommand,
    healthURL: detected.baseURL,
    startupTimeoutMs: 120_000,
    seedPath: './',
  },
  testing: {},
  capture: {},
  browser: {},
  validation: {},
});

const results: Array<[string, string]> = [];

results.push([
  CONFIG_FILENAME,
  writeIfAbsent(
    join(targetRoot, CONFIG_FILENAME),
    JSON.stringify(config, null, 2) + '\n',
  ),
]);

// Pinned versions, not @latest: an unattended upgrade of the browser-control
// layer should not be able to break a product's QA overnight.
results.push([
  '.mcp.json',
  writeIfAbsent(
    join(targetRoot, '.mcp.json'),
    JSON.stringify(
      {
        mcpServers: {
          playwright: {
            type: 'stdio',
            command: 'npx',
            args: [
              '-y',
              '@playwright/mcp@0.0.78',
              '--isolated',
              '--caps=testing,storage,network,devtools,vision',
            ],
          },
          'chrome-devtools': {
            type: 'stdio',
            command: 'npx',
            args: ['-y', 'chrome-devtools-mcp@1.6.0', '--isolated'],
          },
          'agent-qa': {
            type: 'stdio',
            command: 'npx',
            args: ['--no-install', 'agent-qa-mcp', '--target', '.'],
          },
        },
      },
      null,
      2,
    ) + '\n',
  ),
]);

for (const directory of [
  config.testing.requirementsDirectory,
  config.testing.scenariosDirectory,
  config.testing.defectsDirectory,
  config.testing.generatedDirectory,
  config.testing.approvedDirectory,
  config.capture.sessionDirectory,
  'artifacts',
]) {
  const absolute = join(targetRoot, directory);
  mkdirSync(absolute, { recursive: true });
  writeIfAbsent(
    join(absolute, '.gitkeep'),
    '',
  );
  results.push([directory + '/', 'ensured']);
}

// The runnable pieces. These live in the target so its tests execute with the
// plain Playwright runner - no engine, no MCP, no model - which is the whole
// point of externalising the tests into files.
results.push([
  `${config.testing.testDirectory}/fixtures.ts`,
  writeIfAbsent(
    join(targetRoot, config.testing.testDirectory, 'fixtures.ts'),
    FIXTURES_TEMPLATE,
  ),
]);

results.push([
  `${config.testing.testDirectory}/seed.spec.ts`,
  writeIfAbsent(
    join(targetRoot, config.testing.testDirectory, 'seed.spec.ts'),
    SEED_TEMPLATE,
  ),
]);

results.push([
  'playwright.qa.config.ts',
  writeIfAbsent(
    join(targetRoot, 'playwright.qa.config.ts'),
    playwrightConfigTemplate(config),
  ),
]);

appendGitignore(targetRoot, [
  'playwright/.auth/',
  '.qa/sessions/',
  'artifacts/',
]);
results.push(['.gitignore', 'updated']);

console.log(
  JSON.stringify(
    {
      status: 'initialised',
      target: targetRoot,
      detectedFramework: detected.framework,
      baseURL: detected.baseURL,
      startCommand: detected.startCommand ?? null,
      results: Object.fromEntries(results),
      nextSteps: [
        `Review ${CONFIG_FILENAME} - detection is a guess, not a contract.`,
        'Approve the project MCP servers in your coding client (/mcp in Claude Code).',
        `Write a requirement under ${config.testing.requirementsDirectory}/ before generating any test.`,
      ],
    },
    null,
    2,
  ),
);
