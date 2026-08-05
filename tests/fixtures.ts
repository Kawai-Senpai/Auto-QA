import { test as base, expect, type TestInfo } from '@playwright/test';

export interface BrowserSignals {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: Array<{ method: string; url: string; failure: string }>;
}

async function attachSignals(
  testInfo: TestInfo,
  signals: BrowserSignals,
): Promise<void> {
  await testInfo.attach('browser-signals', {
    body: Buffer.from(JSON.stringify(signals, null, 2), 'utf8'),
    contentType: 'application/json',
  });
}

/**
 * Collects the browser evidence a screenshot cannot show.
 *
 * Recording is unconditional; failing on it is not. Most real applications
 * already log harmless noise, so a harness that fails every test on the first
 * console warning gets disabled within a day. Set FAIL_ON_BROWSER_ERRORS=1
 * once an application is clean enough to hold the line.
 */
export const test = base.extend<{ browserSignals: BrowserSignals }>({
  browserSignals: [
    async ({ page }, use, testInfo) => {
      const signals: BrowserSignals = {
        consoleErrors: [],
        pageErrors: [],
        failedRequests: [],
      };

      page.on('console', (message) => {
        if (message.type() === 'error') {
          signals.consoleErrors.push(message.text());
        }
      });

      page.on('pageerror', (error) => {
        signals.pageErrors.push(error.message);
      });

      page.on('requestfailed', (request) => {
        signals.failedRequests.push({
          method: request.method(),
          url: request.url(),
          failure: request.failure()?.errorText ?? 'Unknown network failure',
        });
      });

      await use(signals);

      await attachSignals(testInfo, signals);

      if (process.env.FAIL_ON_BROWSER_ERRORS === '1') {
        expect
          .soft(signals.pageErrors, 'Unexpected uncaught browser errors')
          .toEqual([]);

        expect
          .soft(signals.consoleErrors, 'Unexpected browser console errors')
          .toEqual([]);
      }
    },
    { auto: true },
  ],
});

export { expect };
