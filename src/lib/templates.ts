import type { TargetConfig } from './target-config.js';

// Included in both generated entry points so new target repositories inherit
// the exploration method without depending on this checkout's documentation.
const journeyExplorationGuidance = `## Walk a real journey across every person

Use one disposable customer's end-to-end journey, in the order it happens,
acting as every person in turn: client, sales, operations, engineer, accounts,
or this product's equivalent roles. Use approved accounts and separate role
contexts. After each step, before the next action, read every affected person's
Today or home page, client page, stage, next step and who owes the next move.
Check that all views agree with the records and each other.

Verify the configured email sandbox (for example Mailpit) receives the mail.
Read every new message's subject, text, HTML and role-specific links. Count
messages per step and recipient, including zero when no email is expected.
Check intentional grouping through its queued or digest state and supported
job controls; a database row marked sent is not delivery evidence.

Leave an editor open and change its data from another tab, the API or MCP,
then save or trigger autosave and check conflict behavior and stored values.
Try supported money edges: foreign-client tax choices, no tax, unsent drafts,
partial payments, duplicate billing of a period (including concurrent retries),
and rounding across quote, plan, invoice, portal and email. Read requirements
for the expected tax and rounding rules. Switch to people who should and should
not have access; test direct URLs, API responses and email links, not only
hidden controls. Use only approved fixtures, never live money or recipients.

Keep a step ledger: actor, action, requirement source, each affected observer's
stage/next step/waiting on, expected and actual email counts, evidence and
findings. Every finding names where, what was seen, what was needed, and kind:
bug, no way out, improvement or feature. Missing accounts, capture services or
unknown expectations are coverage gaps or discoveries, never passing checks.

Turn requirement-confirmed journeys into focused structured scenarios with
deterministic fixtures. Preserve compilation, audit, type checks, repeated
clean runs and negative validation. Do not create one giant journey test or
invent scenario fields for cross-role actions the compiler cannot express;
record that gap and use the approved-test path or a reviewed enhancement.
`;

/**
 * Files written into a target repository by `agent-qa init`.
 *
 * They live here as strings rather than as copied files so the emitted content
 * can be derived from the target's own configuration - its directories, roles
 * and budgets - instead of being a generic sample the user has to edit twice.
 */

/**
 * The mission prompt. This is the thing a user actually types at an agent:
 * "Execute .agent/QA_MISSION.md". Everything else in the repository exists to
 * make the steps in here enforceable rather than aspirational.
 */
export function qaMissionTemplate(config: TargetConfig): string {
  return `# Autonomous Application QA Mission

You are the autonomous QA engineer for this repository.

Understand the application, determine its intended behaviour from repository
evidence, explore it through a real browser, identify functional and quality
defects, and convert requirement-backed behaviour into permanent Playwright
tests that run later with no AI agent and no MCP server.

**Do not treat current application behaviour as proof that the behaviour is
correct.** Do not invent requirements. Do not print, commit or copy secrets into
plans, logs, reports, screenshots, traces or generated tests.

## Primary outputs

- \`${config.testing.requirementsDirectory}/*.md\`
- \`specs/qa/application-map.json\`
- \`specs/qa/coverage-map.json\`
- \`${config.testing.scenariosDirectory}/*.json\`
- \`${config.testing.defectsDirectory}/*.md\`
- \`${config.testing.discoveriesDirectory}/*.md\`
- \`${config.testing.generatedDirectory}/*.spec.ts\`
- \`${config.evidence.sessionsDirectory}/<session-id>/\`
- \`${config.testing.reportsDirectory}/qa-report.{json,md}\`

## Phase 0 - Preflight

Call \`qa_preflight\`. It reports which capabilities are actually present.

**Do not continue silently when a required capability is missing.** If an MCP
server must be approved or the client restarted, say so and stop cleanly.

Read: \`AGENTS.md\`, \`agent-qa.config.json\`, \`.agent/PLANS.md\`, the active
ExecPlan, requirements, existing tests, package scripts, route definitions, API
contracts, auth code, design-system docs.

## Phase 1 - Understand the application

Call \`qa_discover_application\`. It reads the repository and reports framework,
scripts, routes, roles and existing tests.

Write \`specs/qa/application-map.json\`. For each feature record: id, route,
permitted roles, requirement source, expected visible behaviour, expected side
effects, known error states, required test data, risk level, current coverage.

**Do not infer expected business behaviour from rendered UI.** Behaviour with no
reliable source goes in \`${config.testing.discoveriesDirectory}/\` as
unverified.

## Phase 2 - Prepare the environment

Start the application with the configured command and wait for the health check.
No arbitrary sleeps.

Run the seed test. **Stop if it fails** - that is the environment, not a feature.

${
  config.application.resetTestDataCommand
    ? `Reset test data: \`${config.application.resetTestDataCommand}\``
    : 'No test-data reset command is configured. Record that limitation.'
}

Confirm you are pointed at a disposable environment. Production is
${config.scope.productionForbidden ? '**forbidden**' : 'permitted by configuration - verify this is intended'}.

## Phase 3 - Authentication

Roles configured: ${config.authentication.roles.map((r) => `\`${r}\``).join(', ')}.

For each role needed, call \`qa_prepare_auth_state\`. It returns an account id,
a role and a storage-state path - **never a password**.

Validate each state by navigating to a role-specific authenticated route.
Regenerate once if expired. Auth state lives in
\`${config.authentication.stateDirectory}\` and is gitignored.

If SSO or MFA blocks automation: use the approved isolated browser-extension
bootstrap, save only the resulting state, record that human bootstrap was
required, **do not attempt to bypass MFA**, and do not make a personal profile a
permanent dependency.

## Phase 4 - Plan coverage

Rank flows by business impact, security impact, usage frequency, change risk,
complexity, defect history and current coverage.

Priority: auth and authorization → data mutation → irreversible actions in safe
test mode → core workflows → validation and failure states → navigation →
responsive → accessibility → visual → performance.

Write \`specs/qa/coverage-map.json\`.

**"Test everything" is not permission to generate hundreds of shallow tests.**

## Phase 5 - Explore each flow

${journeyExplorationGuidance}

Call \`qa_begin_session\`, then for each meaningful step call
\`qa_record_event\`, then \`qa_complete_session\`.

Per flow: start a trace, capture the initial aria snapshot and screenshot,
perform the flow with semantic targets, snapshot after each state change, check
console errors, failed requests and 4xx/5xx responses, verify request methods
and side effects, repeat at ${config.discovery.viewports
    .map((v) => v.name)
    .join(' and ')} viewports, run accessibility checks, stop the trace.

Target preference: role and name → label → visible text → approved test id →
screenshot coordinates only for canvas, WebGL, maps, charts or genuinely
inaccessible controls.

**Never persist a snapshot ref such as \`e42\`.** It is meaningless after the
next DOM update. Record the semantic target.

## Phase 6 - Functional verification

Verify the visible result **and** the side effect:

- a successful save shows confirmation and sends exactly one expected request
- a rejected submission shows validation and sends no mutation request
- a deleted item disappears and is absent from a later API response
- an unauthorized role receives no protected data, not merely a hidden button
- a failed API response shows a useful error and no misleading success state

Test negative cases. Screenshots alone are not evidence of correctness.

## Phase 7 - Console and network review

Treat as defects unless allowlisted: uncaught page exceptions, new console
errors, failed first-party requests, 5xx responses, blocked critical resources,
duplicated mutation requests from one action, unauthorized responses mid-flow,
unexpected external requests, secrets in URLs or console output.

Record 4xx for review. **Do not store request or response bodies** -
\`evidence.captureBodies\` is ${config.evidence.captureBodies}. Redaction covers
${config.evidence.redactHeaders.join(', ')}.

## Phase 8 - Visual and design review

Use aria snapshots for structure; screenshots for clipping, overflow, overlap,
missing assets, broken icons, responsive breakage, spacing, contrast, fonts,
alignment, focus visibility, obstructive overlays, loading states, layout shift
and design-system drift.

Compare against approved baselines, design references and design-system rules.

AI visual judgment is **${config.visual.aiReviewMode}**. Do not fail a build
because a model finds a page unattractive. Do not approve a new baseline merely
because the current implementation produced it.

## Phase 9 - Accessibility review

Run axe with ${config.accessibility.axeTags.join(', ')}. Then manually exercise
keyboard navigation, visible focus, modal focus trapping, escape behaviour,
label associations, validation-message associations, heading hierarchy, control
names and disabled-state behaviour.

**Automated scanning is not accessibility certification.** Record inconclusive
findings separately.

## Phase 10 - Performance and footprint

${
  config.performance.enabled
    ? `Run Lighthouse (${config.performance.lighthouseRuns} runs) against critical routes. Evaluate budgets in \`${config.performance.configPath}\`. Capture a trace when a budget fails. Record request count, transferred size, layout shift and main-thread blocking.`
    : 'Performance auditing is disabled in configuration. Enable `performance.enabled` and add `criticalRoutes` to use it.'
}

**One noisy measurement on a development machine is not a regression.** Use
repeated runs and aggregation. Classify performance findings separately from
functional failures.

## Phase 11 - Defect classification

Classify every failure: application defect | requirement conflict | requirement
ambiguity | authentication failure | fixture failure | environment failure |
browser incompatibility | selector drift | synchronization defect |
accessibility defect | visual regression | performance regression | network
defect | console defect | generated-test defect.

**Do not repair application defects by weakening tests.**

Each report needs: title, severity, feature, role, environment, requirement
source, reproduction steps, expected, observed, screenshots, trace path, console
evidence, network evidence, suspected source location where evidence supports it.

## Phase 12 - Generate permanent tests

Write a scenario under \`${config.testing.scenariosDirectory}\` naming its
\`requirementSource\`, then call \`qa_compile_scenario\`.

Generated tests must not depend on an LLM, MCP, the exploratory session,
temporary refs, the browser extension or personal credentials.

Must not contain: \`waitForTimeout\`, sleeps, XPath, long CSS selectors,
generated class selectors, unexplained \`nth()\`, \`test.skip\`, \`test.fixme\`,
tautologies, bare truthiness, or assertions copied from unverified behaviour.

## Phase 13 - Validate

Close the exploratory browser. Reset test data. Run in a **new** context without
MCP browser actions.

Call \`qa_validate_generated_tests\`. Each test must pass static audit, type
checking, a clean-state run, ${config.validation.repeatEach} repeats, and
produce no unexpected browser errors or first-party request failures.

Then **negative validation**: deliberately break or mock one required behaviour
and confirm the test fails. **A test that still passes when its behaviour is
broken is not ready for promotion.** Always revert the mutation and verify with
\`git status\`.

## Phase 14 - Promote

Call \`qa_promote_tests\` only when all gates pass. Keep tests unapproved when
the requirement is ambiguous, a baseline is unapproved, the test is flaky, auth
depends on a personal session, the test needs production, assertions are not
requirement-backed, or evidence is incomplete.

## Phase 15 - Report

Write \`${config.testing.reportsDirectory}/qa-report.json\` and \`.md\`: areas
discovered, roles and routes tested, scenarios executed, tests generated and
promoted, defects, visual/accessibility/performance findings, console errors,
network failures, unverified behaviour, blocked flows, missing requirements,
coverage gaps, evidence paths, and the exact commands to rerun approved tests
without AI.

Finish by running the approved suite offline.

**Do not report completion when only exploratory browser actions succeeded.**
`;
}

export function evidenceFixtureTemplate(config: TargetConfig): string {
  return `import { test as base, expect, type TestInfo } from '@playwright/test';

/**
 * Browser evidence for permanent offline tests.
 *
 * Captures what a screenshot cannot show: uncaught exceptions, console errors,
 * failed requests and HTTP error responses. Request and response bodies are
 * deliberately NOT captured - that is how authorization tokens and personal
 * data end up in a committed test report.
 */

interface ConsoleFinding {
  type: string;
  text: string;
}

interface NetworkFinding {
  type: 'request-failed' | 'http-error';
  method: string;
  url: string;
  status?: number;
  resourceType?: string;
  failure?: string;
}

export interface QaEvidence {
  consoleErrors: ConsoleFinding[];
  pageErrors: string[];
  networkFindings: NetworkFinding[];
}

/** Console noise that predates the harness. Kept explicit, not silently ignored. */
const CONSOLE_ALLOWLIST: string[] = ${JSON.stringify(
    config.validation.consoleAllowlist,
  )};

const FAIL_ON_HTTP_STATUSES: number[] = ${JSON.stringify(
    config.validation.failOnHttpStatuses,
  )};

function isAllowlisted(text: string): boolean {
  return CONSOLE_ALLOWLIST.some((entry) => text.includes(entry));
}

/**
 * Third-party noise - analytics, ad blockers, browser extensions - is outside
 * the application's control, so only same-origin failures are treated as
 * defects.
 */
function isFirstParty(requestURL: string, baseURL: string | undefined): boolean {
  if (!baseURL) return false;
  try {
    return new URL(requestURL).origin === new URL(baseURL).origin;
  } catch {
    return false;
  }
}

async function attachJson(testInfo: TestInfo, name: string, value: unknown) {
  await testInfo.attach(name, {
    body: Buffer.from(JSON.stringify(value, null, 2), 'utf8'),
    contentType: 'application/json',
  });
}

export const test = base.extend<{ qaEvidence: QaEvidence }>({
  qaEvidence: [
    async ({ page, baseURL }, use, testInfo) => {
      const evidence: QaEvidence = {
        consoleErrors: [],
        pageErrors: [],
        networkFindings: [],
      };

      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        if (isAllowlisted(message.text())) return;
        evidence.consoleErrors.push({
          type: message.type(),
          text: message.text(),
        });
      });

      page.on('pageerror', (error) => {
        evidence.pageErrors.push(error.message);
      });

      page.on('requestfailed', (request) => {
        if (!isFirstParty(request.url(), baseURL)) return;
        evidence.networkFindings.push({
          type: 'request-failed',
          method: request.method(),
          url: request.url(),
          resourceType: request.resourceType(),
          failure: request.failure()?.errorText ?? 'Unknown request failure',
        });
      });

      page.on('response', (response) => {
        const status = response.status();
        if (status < 400) return;
        evidence.networkFindings.push({
          type: 'http-error',
          method: response.request().method(),
          url: response.url(),
          status,
          resourceType: response.request().resourceType(),
        });
      });

      await use(evidence);

      await attachJson(testInfo, 'qa-browser-evidence', evidence);

      // Soft assertions: report every problem in one run rather than stopping
      // at the first, so a single run gives the full picture.
      const firstPartyFailures = evidence.networkFindings.filter(
        (finding) => finding.type === 'request-failed',
      );

      const serverErrors = evidence.networkFindings.filter(
        (finding) =>
          typeof finding.status === 'number' &&
          FAIL_ON_HTTP_STATUSES.includes(finding.status),
      );

${
  config.validation.failOnPageErrors
    ? `      expect.soft(evidence.pageErrors, 'Unexpected uncaught page errors').toEqual([]);`
    : `      // failOnPageErrors is disabled in configuration.`
}
${
  config.validation.failOnUnexpectedConsoleErrors
    ? `      expect.soft(evidence.consoleErrors, 'Unexpected browser console errors').toEqual([]);`
    : `      // failOnUnexpectedConsoleErrors is disabled in configuration.`
}
${
  config.validation.failOnFirstPartyRequestFailures
    ? `      expect.soft(firstPartyFailures, 'Unexpected failed first-party requests').toEqual([]);`
    : `      // failOnFirstPartyRequestFailures is disabled in configuration.`
}
      expect.soft(serverErrors, 'Unexpected HTTP server errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
`;
}

export function seedTemplate(): string {
  return `import { test, expect } from './fixtures.js';

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
}

export function authTypesTemplate(): string {
  return `import type { Page } from '@playwright/test';

/**
 * Test identity contract.
 *
 * Playwright can save and restore an authenticated browser state, but it cannot
 * know how THIS application creates users. Implement the adapter in
 * qa/auth.adapter.ts. There is no honest universal implementation - databases,
 * identity providers, signup rules and authorization models all differ.
 */

export interface QaAccountLease {
  accountId: string;
  username: string;
  role: string;
  cleanupToken?: string;
}

export interface ProvisionedQaAccount extends QaAccountLease {
  /** Never log, serialise or return this to a language model. */
  secret: string;
}

export interface QaAuthAdapter {
  /** Create or lease a dedicated test identity for a role. */
  provision(role: string): Promise<ProvisionedQaAccount>;

  /** Drive the login UI (or an API) so the context becomes authenticated. */
  authenticate(page: Page, account: ProvisionedQaAccount): Promise<void>;

  /** Release the identity. Never leave test accounts in an unknown state. */
  cleanup(lease: QaAccountLease): Promise<void>;
}
`;
}

export function authAdapterTemplate(): string {
  return `import type { Page } from '@playwright/test';

import type {
  ProvisionedQaAccount,
  QaAccountLease,
  QaAuthAdapter,
} from './auth.types.js';

/**
 * TEMPLATE - implement this for your application.
 *
 * This assumes a test-support endpoint that creates disposable users. Replace
 * the provisioning call and the login selectors with the real ones. Keep the
 * shape: the secret must never leave this file.
 *
 * Prefer a dedicated user-factory endpoint that only exists in non-production
 * builds. Creating users by driving the signup UI is slow and couples every
 * authenticated test to the signup form.
 *
 * Playwright recommends a separate account per parallel worker for applications
 * that mutate shared server-side state, rather than one shared test account.
 */

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(\`Required environment variable is missing: \${name}\`);
  }
  return value;
}

const adapter: QaAuthAdapter = {
  async provision(role: string): Promise<ProvisionedQaAccount> {
    const factoryURL = requiredEnvironment('QA_USER_FACTORY_URL');
    const factoryToken = requiredEnvironment('QA_USER_FACTORY_TOKEN');

    const response = await fetch(factoryURL, {
      method: 'POST',
      headers: {
        authorization: \`Bearer \${factoryToken}\`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ role, purpose: 'automated-e2e-testing' }),
    });

    if (!response.ok) {
      throw new Error(\`User factory returned \${response.status}\`);
    }

    const provisioned = (await response.json()) as {
      id: string;
      email: string;
      password: string;
      cleanupToken?: string;
    };

    return {
      accountId: provisioned.id,
      username: provisioned.email,
      secret: provisioned.password,
      role,
      cleanupToken: provisioned.cleanupToken,
    };
  },

  async authenticate(page: Page, account: ProvisionedQaAccount): Promise<void> {
    const baseURL = requiredEnvironment('QA_BASE_URL');

    await page.goto(new URL('/sign-in', baseURL).toString());

    await page.getByLabel(/email|username/i).fill(account.username);
    await page.getByLabel(/password/i).fill(account.secret);
    await page.getByRole('button', { name: /sign in|log in/i }).click();

    // Wait for an observable state change, not a duration.
    await page.waitForURL((url) => !url.pathname.includes('sign-in'));
  },

  async cleanup(lease: QaAccountLease): Promise<void> {
    const factoryURL = requiredEnvironment('QA_USER_FACTORY_URL');
    const factoryToken = requiredEnvironment('QA_USER_FACTORY_TOKEN');

    const response = await fetch(
      \`\${factoryURL}/\${encodeURIComponent(lease.accountId)}\`,
      {
        method: 'DELETE',
        headers: {
          authorization: \`Bearer \${factoryToken}\`,
          ...(lease.cleanupToken
            ? { 'x-qa-cleanup-token': lease.cleanupToken }
            : {}),
        },
      },
    );

    // 404 is fine - the account is already gone, which is the desired end state.
    if (!response.ok && response.status !== 404) {
      throw new Error(\`Account cleanup returned \${response.status}\`);
    }
  },
};

export default adapter;
`;
}

export function prepareAuthStateTemplate(config: TargetConfig): string {
  return `import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from '@playwright/test';

import authAdapter from '../../qa/auth.adapter.js';

/**
 * Mint authenticated browser state for one role.
 *
 * Runs OUTSIDE the language model's context on purpose. The model receives an
 * account id, a role and a storage-state path; the password exists only in this
 * process and the environment.
 *
 * Usage:
 *   npx tsx scripts/qa/prepare-auth-state.ts \\
 *     --role=standard \\
 *     --output=${config.authentication.stateDirectory}/standard.json \\
 *     --lease-output=${config.authentication.leaseDirectory}/standard.json
 */

function argument(name: string): string {
  const prefix = \`--\${name}=\`;
  const entry = process.argv.find((value) => value.startsWith(prefix));
  if (!entry) {
    throw new Error(\`Missing argument: --\${name}=...\`);
  }
  return entry.slice(prefix.length);
}

const role = argument('role');
const statePath = path.resolve(argument('output'));
const leasePath = path.resolve(argument('lease-output'));

await mkdir(path.dirname(statePath), { recursive: true });
await mkdir(path.dirname(leasePath), { recursive: true });

const account = await authAdapter.provision(role);
const browser = await chromium.launch();

try {
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();

  await authAdapter.authenticate(page, account);

  await context.storageState({ path: statePath, indexedDB: true });

  const lease = {
    accountId: account.accountId,
    username: account.username,
    role: account.role,
    cleanupToken: account.cleanupToken,
  };

  // 0600: this file can impersonate the account it was captured from.
  await writeFile(leasePath, JSON.stringify(lease, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
  await chmod(statePath, 0o600);

  // Only non-secret fields are printed - this output reaches the agent.
  process.stdout.write(
    JSON.stringify({
      accountId: account.accountId,
      role: account.role,
      storageStatePath: statePath,
      leasePath,
    }),
  );
} catch (error) {
  // Never leave a provisioned account orphaned by a failed login.
  await authAdapter.cleanup({
    accountId: account.accountId,
    username: account.username,
    role: account.role,
    cleanupToken: account.cleanupToken,
  });
  throw error;
} finally {
  await browser.close();
  account.secret = '';
}
`;
}

export function lighthouseConfigTemplate(config: TargetConfig): string {
  const urls = config.performance.criticalRoutes.length
    ? config.performance.criticalRoutes
    : [config.application.baseURL];

  return `// Starter budgets, not universal truth. Establish a clean baseline on this
// application first, then tighten. Otherwise you either fail every build or
// accept whatever it currently does.
module.exports = {
  ci: {
    collect: {
      startServerCommand:
        process.env.QA_START_COMMAND ?? ${JSON.stringify(
          config.application.startCommand ?? 'npm run dev',
        )},
      startServerReadyPattern: 'ready|listening|started',
      startServerReadyTimeout: ${config.application.startupTimeoutMs},
      url: ${JSON.stringify(urls, null, 8).replace(/\n/g, '\n      ')},
      numberOfRuns: ${config.performance.lighthouseRuns},
      // Uncomment when auditing authenticated routes.
      // puppeteerScript: './qa/lhci-auth.cjs',
      settings: {
        preset: 'desktop',
        // Required when authentication is stored outside ordinary cookies.
        // disableStorageReset: true,
      },
    },

    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.85, aggregationMethod: 'median' }],
        'categories:accessibility': ['warn', { minScore: 0.95, aggregationMethod: 'median' }],
        'first-contentful-paint': ['error', { maxNumericValue: 2000, aggregationMethod: 'median' }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500, aggregationMethod: 'median' }],
        // Pessimistic: layout shift is a user-visible defect, so the worst run
        // is the honest number rather than the median.
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1, aggregationMethod: 'pessimistic' }],
        'total-blocking-time': ['error', { maxNumericValue: 300, aggregationMethod: 'median' }],
        'resource-summary:script:size': ['warn', { maxNumericValue: 400000, aggregationMethod: 'median' }],
        'resource-summary:image:size': ['warn', { maxNumericValue: 1200000, aggregationMethod: 'median' }],
        'resource-summary:third-party:count': ['warn', { maxNumericValue: 10, aggregationMethod: 'median' }],
      },
    },

    upload: {
      target: 'filesystem',
      outputDir: '${config.testing.reportsDirectory}/lighthouse',
    },
  },
};
`;
}

export function playwrightConfigTemplate(config: TargetConfig): string {
  return `import { defineConfig, devices } from '@playwright/test';

// Written by agent-qa init. Separate from any existing playwright.config so the
// QA suite can evolve without disturbing the project's own Playwright setup.
const baseURL = process.env.BASE_URL ?? ${JSON.stringify(config.application.baseURL)};
const webServerCommand = process.env.WEB_SERVER_COMMAND ?? ${JSON.stringify(
    config.application.startCommand ?? '',
  )};

export default defineConfig({
  testDir: ${JSON.stringify('./' + config.testing.testDirectory)},
  outputDir: ${JSON.stringify('./' + config.testing.reportsDirectory + '/test-results')},
  timeout: 30_000,
  expect: {
    timeout: 7_500,
    toHaveScreenshot: {
      maxDiffPixelRatio: ${config.visual.maxDiffPixelRatio},
      animations: ${JSON.stringify(config.visual.animations)},
      caret: ${JSON.stringify(config.visual.hideCaret ? 'hide' : 'initial')},
    },
  },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,

  // A dev server that compiles routes on demand is a shared bottleneck: several
  // workers hitting cold routes at once make the first navigation to each one
  // exceed the navigation timeout, which surfaces as flakiness rather than as
  // the resource contention it actually is. Serial locally, parallel in CI
  // where the application is normally built and served rather than compiled
  // per request. Raising timeouts instead would hide genuine slowness.
  workers: process.env.CI ? undefined : 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: ${JSON.stringify(
      config.testing.reportsDirectory + '/playwright-report',
    )}, open: 'never' }],
    ['json', { outputFile: ${JSON.stringify(
      config.testing.reportsDirectory + '/results.json',
    )} }],
  ],
  use: {
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: ${config.evidence.traces ? "'retain-on-failure'" : "'off'"},
    screenshot: ${config.evidence.screenshots ? "'only-on-failure'" : "'off'"},
    video: ${JSON.stringify(
      config.evidence.videos === 'on-failure'
        ? 'on-first-retry'
        : config.evidence.videos,
    )},
  },
  projects: [
${config.discovery.viewports
  .map(
    (viewport) => `    {
      name: ${JSON.stringify(viewport.name)},
      use: {
        ...devices[${JSON.stringify(
          viewport.name === 'mobile' ? 'Pixel 7' : 'Desktop Chrome',
        )}],
        viewport: { width: ${viewport.width}, height: ${viewport.height} },
      },
      // A scenario naming a viewport compiles to <id>.<viewport>.spec.ts and
      // runs only there. Responsive designs express the same requirement
      // differently - inline navigation on desktop, a disclosure menu on
      // mobile - so a single test asserting both is either wrong on one
      // viewport or too vague to assert anything. Unsuffixed files are
      // viewport-agnostic and run everywhere.
      testIgnore: ${JSON.stringify(
        config.discovery.viewports
          .filter((other) => other.name !== viewport.name)
          .map((other) => `**/*.${other.name}.spec.ts`),
      )},
    },`,
  )
  .join('\n')}
  ],
  webServer: webServerCommand
    ? {
        command: webServerCommand,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: ${config.application.startupTimeoutMs},
        stdout: 'pipe',
        stderr: 'pipe',
      }
    : undefined,
});
`;
}

export function targetAgentsTemplate(config: TargetConfig): string {
  return `# QA Rules for This Repository

The QA engine lives elsewhere. This file is the product-specific policy it obeys.

## Mission

Run \`.agent/QA_MISSION.md\` for a full pass, or ask for a single flow.

${journeyExplorationGuidance}

## Sources of truth

Expected behaviour comes from, in order:

1. \`${config.testing.requirementsDirectory}/\`
2. API contracts and schemas in this repository
3. Route definitions
4. Approved tests in \`${config.testing.approvedDirectory}/\`
5. Human-confirmed behaviour recorded in a specification

Observed behaviour is **not** an oracle. \`requirements.allowObservedBehaviorAsOracle\`
is ${config.requirements.allowObservedBehaviorAsOracle}.

When no reliable source exists, record it in
\`${config.testing.discoveriesDirectory}/\` and stop generating that assertion.

## Scope

Allowed origins: ${(config.scope.allowedOrigins.length
    ? config.scope.allowedOrigins
    : [config.application.baseURL]
  )
    .map((o) => `\`${o}\``)
    .join(', ')}

Production forbidden: ${config.scope.productionForbidden}
Destructive actions require approval: ${config.scope.destructiveActionsRequireApproval}

## Roles

${config.authentication.roles.map((r) => `- \`${r}\``).join('\n')}

Auth state lives in \`${config.authentication.stateDirectory}\` and is gitignored.
It can impersonate the account it was captured from. Never commit it, never
print it, never paste it into an issue.

## Commands

    npx playwright test --config=playwright.qa.config.ts tests/e2e/seed.spec.ts
    npx playwright test --config=playwright.qa.config.ts --project=${config.discovery.viewports[0]?.name ?? 'desktop'}
    npx playwright test --config=playwright.qa.config.ts ${config.testing.approvedDirectory}

## Gates

A generated test is promoted only when it passes static audit, type checking, a
clean-state run, ${config.validation.repeatEach} repeats, and a negative
validation proving it fails when the behaviour it protects is broken.
`;
}
