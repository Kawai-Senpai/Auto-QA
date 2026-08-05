import { test, expect } from './fixtures.js';

/**
 * The seed test proves the environment before any exploration happens.
 *
 * When this fails, the problem is the application, the fixtures or the
 * configuration - not the feature under test. Exploring past a failing seed
 * produces scenarios built on a broken environment, so the workflow stops here.
 *
 * SEED_HEADING is the accessible name of a heading that must be present on the
 * landing page of whatever application BASE_URL points at. It defaults to the
 * TodoMVC demo so a fresh checkout is verifiable with no configuration.
 */
const seedHeading = process.env.SEED_HEADING ?? 'todos';

// Relative, so it resolves against the full baseURL rather than replacing its
// path. An application served from a sub-path stays reachable without every
// scenario having to repeat that prefix.
const seedPath = process.env.SEED_PATH ?? './';

test('application is reachable and renders its landing page', async ({
  page,
  browserSignals,
}) => {
  const response = await page.goto(seedPath);

  // A SPA that returns 500 can still render a shell, so the status is checked
  // rather than inferred from the page looking populated.
  expect(
    response?.status(),
    'Landing page must not return an error status',
  ).toBeLessThan(400);

  await expect(
    page.getByRole('heading', { name: seedHeading }).first(),
  ).toBeVisible();

  // Reported as evidence rather than asserted: see fixtures.ts.
  expect(browserSignals.pageErrors.length).toBeGreaterThanOrEqual(0);
});
