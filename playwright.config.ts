import { defineConfig, devices } from '@playwright/test';

// Default to the public TodoMVC demo so a fresh checkout can prove the harness
// works before anyone wires up a real application.
// The trailing slash matters: a relative goto() resolves against the last path
// segment, so 'https://demo.playwright.dev/todomvc' + './' would drop 'todomvc'
// and land on the origin root.
const baseURL = process.env.BASE_URL ?? 'https://demo.playwright.dev/todomvc/';

const webServerCommand = process.env.WEB_SERVER_COMMAND;
const webServerURL = process.env.WEB_SERVER_URL ?? baseURL;

export default defineConfig({
  testDir: './tests',
  outputDir: './artifacts/test-results',

  timeout: 30_000,
  expect: { timeout: 7_500 },

  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'artifacts/html-report', open: 'never' }],
    ['json', { outputFile: 'artifacts/results.json' }],
  ],

  use: {
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,

    // Evidence is the point of the harness: a failure that cannot be inspected
    // afterwards forces the next run to reproduce it from scratch.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',

    serviceWorkers:
      process.env.BLOCK_SERVICE_WORKERS === '1' ? 'block' : 'allow',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],

  webServer: webServerCommand
    ? {
        command: webServerCommand,
        url: webServerURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
      }
    : undefined,
});
