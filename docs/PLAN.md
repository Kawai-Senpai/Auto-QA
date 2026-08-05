## The big picture

What you are describing is real and buildable:

> **An agent explores a frontend like a human, records what it does, converts the exploration into automated tests, validates those tests, and commits them to the codebase.**

The proper loop is:

```text
Understand requirement
      ↓
Start application in a controlled environment
      ↓
Explore the UI with a real browser
      ↓
Record actions, browser state, network calls and expected results
      ↓
Generate Playwright tests
      ↓
Run generated tests from a clean state
      ↓
Repair brittle selectors or timing problems
      ↓
Open a pull request containing tests and evidence
```

But here is the slightly annoying truth: **a large chunk of this already exists.**

Playwright now officially includes three test agents:

* A planner that explores the application and writes a test plan
* A generator that turns the plan into executable Playwright tests
* A healer that runs failing tests and attempts to repair them

It supports agent loops for Codex, Claude Code, VS Code and OpenCode. ([Playwright][1])

Chrome also now provides Chrome DevTools for agents, allowing coding agents to control Chrome, inspect console errors, inspect network activity, emulate devices, analyze performance and verify changes directly in a browser. ([Chrome for Developers][2])

So the valuable product is **not another tool that lets an AI click a button**. That part is becoming commodity plumbing.

The valuable product is the system that makes the resulting tests correct, stable, safe and useful.

---

# How humans automate frontend testing

Humans do not normally sit there writing code that moves a mouse to pixel coordinates.

They use a browser automation framework such as:

* Playwright
* Cypress
* Selenium
* WebdriverIO

These frameworks launch a real browser and issue commands such as:

```ts
await page.getByRole('button', { name: 'Add to cart' }).click();
await expect(page.getByText('Added to cart')).toBeVisible();
```

The browser framework handles the physical details of clicking, typing, navigation, frames, tabs, downloads and browser events.

Selenium WebDriver drives browsers through a standardized browser-control interface. Playwright drives Chromium, Firefox and WebKit and adds a test runner, automatic waiting, assertions, tracing and isolation. ([Selenium][3])

## A corporate test usually contains five things

### 1. Preconditions

The system must begin in a known state:

* A test user exists
* The user has a particular subscription
* The cart is empty
* The database contains known products
* Authentication is already prepared

Playwright can save authenticated browser state and reuse it in tests instead of logging in through the UI for every test. ([Playwright][4])

### 2. Actions

The test performs user actions:

```ts
await page.getByLabel('Email').fill('qa-user@example.test');
await page.getByLabel('Password').fill(process.env.TEST_PASSWORD!);
await page.getByRole('button', { name: 'Sign in' }).click();
```

### 3. Assertions

This is the part most people misunderstand.

Clicking around is not testing.

A test must say what should happen:

```ts
await expect(page).toHaveURL('/dashboard');
await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
await expect(page.getByText('Welcome back')).toBeVisible();
```

Playwright's web assertions retry until the expected condition appears, which avoids many crude sleeps and timing races. ([Playwright][5])

### 4. Evidence

When something fails, the test produces:

* Screenshots
* Browser trace
* DOM snapshots
* Console output
* Network requests
* Videos
* Test report

Playwright's trace viewer lets developers inspect actions, DOM snapshots, console messages and network activity after a run. ([Playwright][6])

### 5. Repeatable execution

The test is run:

* On every pull request
* Against multiple browsers
* Inside an isolated CI environment
* Sometimes against multiple screen sizes
* With controlled test data

Playwright supports CI execution, containers, browser projects, sharding and parallel execution. ([Playwright][7])

---

# Why coding agents often appear unable to test frontends

The problem is usually not that the model cannot understand buttons.

It is one of these:

## The agent has no browser tool

A terminal-only coding agent cannot magically interact with Chrome. It needs Playwright, Chrome DevTools MCP, WebDriver or another browser-control interface.

## The application is not running correctly

The agent needs to understand:

* Which command starts the frontend
* Whether the backend must also run
* Which port is used
* Which environment variables are required
* How the database is initialized
* How authentication works

This environmental garbage is where most automation systems quietly die.

## The agent only sees screenshots

Screenshots are useful, but a browser agent should also receive:

* Accessibility tree
* DOM structure
* Element roles and names
* Current URL
* Console errors
* Network activity
* Pending requests
* Focused element
* Dialog state

Playwright MCP exposes structured accessibility snapshots, while Chrome DevTools gives agents access to browser debugging information. ([Playwright][8])

## The agent has no source of truth

Suppose the agent clicks "Submit" and the application displays:

```text
Something went wrong
```

Should the generated test assert that the error appears?

Obviously not.

But unless the agent has a requirement, PRD, existing test case or acceptance criterion, it cannot know whether it discovered correct behavior or a bug.

This is the single biggest issue with your idea:

> **An agent can observe what happened. It cannot automatically know what should have happened.**

Without an external specification, your system may turn existing bugs into permanent regression tests.

That is worse than having no tests.

---

# The architecture I would build

Do not begin with twelve MCP servers, seventeen skills and a heroic browser extension. That is how you create a spectacular demo and a maintenance nightmare.

Start with this architecture.

```text
┌──────────────────────────────────────────────┐
│                Coding Agent                  │
│     Codex / Claude Code / another agent      │
└──────────────────────┬───────────────────────┘
                       │
┌──────────────────────▼───────────────────────┐
│             Test Orchestrator                │
│ plans, permissions, workflow, run history    │
└───────┬──────────────┬──────────────┬────────┘
        │              │              │
        ▼              ▼              ▼
 Repo Adapter     Browser Driver   Requirement Reader
 start app        Playwright       PRD / ticket / diff
 seed data        MCP or CLI       acceptance criteria
        │              │
        │              ▼
        │        Chrome DevTools
        │        console/network/perf
        │
        ▼
 Exploration Recorder
 actions + UI state + evidence
        │
        ▼
 Scenario Intermediate Representation
        │
        ▼
 Test Compiler
 Playwright TypeScript
        │
        ▼
 Validator and Healer
 clean reruns + negative checks + PR
```

## 1. Repository adapter

This examines the target codebase and creates a normalized execution contract.

For example:

```yaml
application:
  install: npm ci
  start: npm run dev
  healthcheck: http://localhost:3000/health
  baseUrl: http://localhost:3000

database:
  reset: npm run test:db:reset
  seed: npm run test:db:seed

authentication:
  setup: tests/setup/auth.setup.ts

testing:
  framework: playwright
  directory: tests/e2e
```

Do not let the agent rediscover these commands on every run. Once discovered and verified, store them.

This repository contract is more valuable than another generic prompt.

## 2. Browser execution layer

Use Playwright as the primary browser driver.

It already provides:

* Browser control
* Automatic waiting
* Semantic locators
* Assertions
* Traces
* Screenshots
* Browser isolation
* Multiple browsers
* Code generation
* Test execution

Playwright's generator can already record actions performed in a browser and generate test code and assertions. ([Playwright][9])

Use Chrome DevTools MCP as the diagnostic layer for:

* Console exceptions
* Failed network requests
* Performance traces
* Runtime inspection
* Responsive and network emulation

Do not have two systems fighting to control the same browser unless you have explicit ownership rules.

A clean approach is:

```text
Playwright = act
Chrome DevTools = inspect
```

## 3. Explorer agent

The explorer receives a specific mission:

```text
Test the guest checkout flow.

Requirements:
- A guest can add one in-stock product.
- Shipping cost should be shown before payment.
- An invalid postcode must display a validation error.
- The order must not be submitted without accepting the terms.
```

The explorer then:

1. Opens the application.
2. Maps the relevant page.
3. Identifies interactive elements.
4. Executes the happy path.
5. Tries meaningful negative cases.
6. Records unexpected behavior.
7. Produces candidate scenarios.

Do not ask it to "test everything". That instruction is vague nonsense. Give it a feature, persona, risk area or acceptance criterion.

## 4. Interaction recorder

Every action should be stored in a framework-neutral representation before generating code.

Something like:

```json
{
  "scenario": "Reject checkout without accepting terms",
  "preconditions": [
    {
      "type": "fixture",
      "name": "cart-with-one-in-stock-product"
    }
  ],
  "steps": [
    {
      "action": "goto",
      "url": "/checkout"
    },
    {
      "action": "fill",
      "target": {
        "role": "textbox",
        "name": "Postcode"
      },
      "value": "SW1A 1AA"
    },
    {
      "action": "click",
      "target": {
        "role": "button",
        "name": "Place order"
      }
    }
  ],
  "assertions": [
    {
      "type": "visible",
      "target": {
        "role": "alert"
      },
      "expectedText": "Accept the terms to continue"
    },
    {
      "type": "network_request_absent",
      "method": "POST",
      "urlPattern": "**/orders"
    }
  ]
}
```

This intermediate representation is important.

Do not generate Playwright code directly after every click. Raw generated code becomes messy, duplicated and difficult to reason about.

The representation allows you to:

* Change testing frameworks later
* Review scenarios before compilation
* Deduplicate flows
* Improve selectors
* Add missing assertions
* Track which requirement produced each test
* Regenerate code consistently

## 5. Oracle engine

In testing, an "oracle" is the source that determines whether the result is correct.

Your oracle engine should derive expectations from, in order:

1. Explicit acceptance criteria
2. Existing product requirements
3. API contracts
4. Existing unit or integration tests
5. Design-system contracts
6. Database state
7. Human-confirmed baseline
8. Current observed behavior, marked as unverified

That last category matters.

When the agent has merely observed something, generate:

```yaml
confidence: low
oracleSource: observed-behavior
requiresHumanReview: true
```

Never pretend observation equals correctness.

## 6. Test compiler

The compiler converts the scenario representation into maintainable Playwright tests:

```ts
import { test, expect } from '@playwright/test';

test('checkout is blocked until terms are accepted', async ({ page }) => {
  let orderSubmitted = false;

  page.on('request', request => {
    if (
      request.method() === 'POST' &&
      request.url().includes('/orders')
    ) {
      orderSubmitted = true;
    }
  });

  await page.goto('/checkout');

  await page
    .getByRole('textbox', { name: 'Postcode' })
    .fill('SW1A 1AA');

  await page
    .getByRole('button', { name: 'Place order' })
    .click();

  await expect(page.getByRole('alert')).toContainText(
    'Accept the terms to continue'
  );

  expect(orderSubmitted).toBe(false);
});
```

Notice that it checks both the visible result and the backend side effect.

That is a real test.

"Click button and screenshot page" is theatre.

---

# Selector strategy

Generated tests usually become garbage because they use selectors like:

```ts
page.locator('div:nth-child(3) > div > button')
```

That selector will collapse the moment someone moves a wrapper.

Prefer this order:

1. Accessible role and name
2. Associated label
3. Visible text
4. Explicit test ID
5. Stable application-specific identifier
6. CSS or XPath only as a last resort

Playwright recommends user-facing attributes and explicit contracts, and its locators include automatic waiting and retry behavior. ([Playwright][10])

The agent should also be allowed to improve the application:

```tsx
<button data-testid="checkout-submit">
  Place order
</button>
```

But it should only add test IDs where semantic roles are insufficient. Throwing `data-testid` onto every `<div>` is lazy pollution.

---

# The validation loop is where your product becomes valuable

After generating a test, do not immediately commit it.

Run this gauntlet:

```text
1. Run in a fresh browser context
2. Reset database and rerun
3. Repeat several times
4. Run headed and headless
5. Run Chromium and one other browser
6. Run at desktop and mobile viewport
7. Check console and network errors
8. Ensure no arbitrary sleep() calls exist
9. Ensure assertions came from an accepted oracle
10. Ensure the test actually detects a broken implementation
```

That last check is critical.

Suppose the generated test contains:

```ts
expect(true).toBe(true);
```

It passes perfectly. It is also worthless.

For critical tests, your system can temporarily mutate or intercept behavior:

* Change the API response
* Hide the expected success message
* Return a validation error
* Prevent the POST request
* Alter the displayed value

Then confirm that the test fails.

This is essentially a lightweight test of the test.

Playwright supports network interception and HAR-based replay, so controlled failure scenarios can be created without rewriting the application. ([Playwright][11])

---

# The healer needs strict handcuffs

Playwright's official healer can replay failing steps, inspect the current UI and propose fixes to selectors, waits or data setup. ([Playwright][1])

Your healer should be allowed to:

* Replace a brittle selector
* Use a better role-based locator
* Repair test setup
* Correct a genuine timing race
* Update a route when the specification confirms a route change
* Mark the test as blocked by an application defect

It should **not** be allowed to silently:

* Delete an assertion
* Weaken an exact assertion into a vague one
* Increase every timeout
* Add arbitrary sleeps
* Replace expected values with whatever the application currently returns
* Skip a failing test and call the job complete

Otherwise your "self-healing" system becomes a machine that quietly erases quality checks whenever they become inconvenient.

A good healing report should say:

```text
Failure classification: locator drift
Old locator: text=Continue
New locator: role=button, name=Continue to payment

Application behavior changed: no
Assertions changed: no
Confidence: 0.94
Evidence: trace.zip, before.png, after.png
```

---

# Different kinds of frontend testing

Your agent should not turn every check into a massive end-to-end browser journey.

Use several layers.

## Component tests

Render one component in a real browser and interact with it independently.

Cypress component testing mounts components in a real browser, and Playwright also supports browser-based component testing. ([Cypress Documentation][12])

Good for:

* Dropdowns
* Forms
* Date pickers
* Validation
* Loading states
* Error states
* Keyboard interactions

## End-to-end tests

Run complete business flows:

* Registration
* Checkout
* Subscription upgrade
* Password reset
* Invoice download

Keep these focused. Do not create 900 end-to-end tests because the agent can. You will create a slow, flaky landfill.

## Visual regression tests

Compare screenshots against approved baselines.

Playwright supports screenshot comparisons through `toHaveScreenshot()`. ([Playwright][13])

Useful for:

* Layout changes
* Missing icons
* Broken spacing
* Responsive regressions
* Theme problems

But visual tests must mask dynamic content such as clocks, ads, random data and animation.

## Accessibility tests

Run deterministic accessibility checks and inspect keyboard and screen-reader behavior.

`axe-core` is an accessibility testing engine designed for automated web UI testing. ([GitHub][14])

The agent should combine automated scans with interaction checks such as:

* Can the page be used with the keyboard?
* Is focus visible?
* Does a dialog trap focus?
* Are form errors associated with inputs?
* Do controls have usable names?

## API and network checks

A frontend may display a happy success toast even when the wrong request was sent.

The agent should inspect:

* Method
* URL
* Request body
* Response status
* Duplicate requests
* Unauthorized requests
* Unexpected third-party calls

Playwright can monitor, modify and mock HTTP, HTTPS and WebSocket traffic. ([Playwright][11])

---

# Do you need a browser extension?

Probably not for the first version.

A browser extension is useful for three specific jobs:

### Human-to-agent handoff

A tester finds a bug manually and clicks:

```text
Hand this browser session to the agent
```

The agent receives the current page, selected element, console state and recent network history.

### Human action recording

A human performs a complicated flow and the extension records:

* Clicks
* Inputs
* Navigation
* Assertions added by the tester
* Relevant network calls

### Application-provided metadata

The extension can expose internal debugging information such as:

* Component names
* Route IDs
* Feature flags
* Test-data identifiers
* Current user permissions

But do not use an extension as the fundamental browser driver. Playwright and Chrome DevTools already solve that more cleanly.

There is also a serious security problem. Chrome's official documentation warns that an agent attached to an authenticated browser can read, inspect and modify browser data and effectively act on the user's behalf. ([Chrome for Developers][15])

Therefore:

* Use an isolated browser profile by default
* Never attach to someone's everyday Chrome profile
* Keep production domains blocked
* Require approval for payments, deletion, publishing or account changes
* Store secrets outside prompts and traces
* Redact cookies, authorization headers and personal data
* Give every run a domain allowlist

---

# A sensible repository layout

```text
agent-testing/
├── agent/
│   ├── planner/
│   ├── explorer/
│   ├── oracle/
│   ├── generator/
│   ├── validator/
│   └── healer/
│
├── adapters/
│   ├── repository/
│   ├── database/
│   ├── authentication/
│   └── requirements/
│
├── browser/
│   ├── playwright/
│   ├── devtools/
│   ├── recorder/
│   └── session-manager/
│
├── contracts/
│   ├── app.contract.schema.json
│   ├── scenario.schema.json
│   └── evidence.schema.json
│
├── skills/
│   ├── explore-feature.md
│   ├── generate-tests.md
│   ├── diagnose-failure.md
│   └── review-test-quality.md
│
├── harness/
│   ├── start-application.ts
│   ├── reset-test-data.ts
│   ├── create-test-user.ts
│   └── validate-environment.ts
│
├── tests/
│   ├── generated/
│   ├── approved/
│   ├── fixtures/
│   └── setup/
│
└── reports/
    ├── traces/
    ├── screenshots/
    ├── videos/
    └── results/
```

---

# What I would build first

## Version 1

Use:

* Playwright Test
* Playwright Test Agents
* Playwright MCP or CLI
* A small repository contract
* A scenario intermediate format
* A strict generated-test validator
* Git integration that opens a pull request

The input:

```text
Test the password-reset feature against these acceptance criteria.
```

The output:

```text
specs/password-reset.md
tests/generated/password-reset.spec.ts
reports/password-reset/trace.zip
reports/password-reset/result.json
```

## Version 2

Add:

* Chrome DevTools diagnostics
* Network assertions
* Accessibility scanning
* Visual comparisons
* Automatic test-data creation
* Requirement-to-test coverage mapping
* Failure classification

## Version 3

Add:

* Diff-aware testing
* The agent reads a pull request and identifies affected flows
* It explores only the relevant application areas
* It generates or updates tests
* It explains why each test is needed
* It proposes healing patches without silently applying dangerous changes

---

# Your actual competitive advantage

Here is the blunt assessment.

Building "an MCP that allows Claude to click buttons" is no longer a serious moat. Microsoft and Google are already providing the browser-control layer. Playwright even has the planner, generator and healer workflow you described. ([Playwright][1])

Your defensible product would need to own the difficult layer:

* Understanding arbitrary repositories
* Starting messy applications reliably
* Producing deterministic test data
* Converting requirements into trustworthy assertions
* Verifying that generated tests catch defects
* Preventing the healer from weakening tests
* Showing evidence a human can audit
* Mapping product requirements to test coverage
* Operating safely inside enterprise systems

That is the magic.

Not the clicking.

**The strongest one-line product definition would be:**

> An agentic QA harness that explores live web applications, converts verified behavior and product requirements into durable Playwright tests, proves those tests detect regressions, and maintains them through auditable pull requests.

That is a legitimate product. A generic browser extension stuffed with MCP commands is not.

[1]: https://playwright.dev/docs/test-agents?utm_source=chatgpt.com "Agents | Playwright"
[2]: https://developer.chrome.com/docs/devtools/agents?utm_source=chatgpt.com "Chrome DevTools for agents"
[3]: https://www.selenium.dev/documentation/webdriver/?utm_source=chatgpt.com "WebDriver"
[4]: https://playwright.dev/docs/auth?utm_source=chatgpt.com "Authentication | Playwright"
[5]: https://playwright.dev/docs/writing-tests?utm_source=chatgpt.com "Writing tests"
[6]: https://playwright.dev/docs/next/trace-viewer?utm_source=chatgpt.com "Trace viewer | Playwright"
[7]: https://playwright.dev/docs/ci?utm_source=chatgpt.com "Continuous Integration | Playwright"
[8]: https://playwright.dev/?utm_source=chatgpt.com "Fast and reliable end-to-end testing for modern web apps | Playwright"
[9]: https://playwright.dev/docs/codegen?utm_source=chatgpt.com "Test generator | Playwright"
[10]: https://playwright.dev/docs/best-practices?utm_source=chatgpt.com "Best Practices"
[11]: https://playwright.dev/docs/network?utm_source=chatgpt.com "Network | Playwright"
[12]: https://docs.cypress.io/app/component-testing/get-started?utm_source=chatgpt.com "Get started with component testing"
[13]: https://playwright.dev/docs/test-snapshots?utm_source=chatgpt.com "Visual comparisons | Playwright"
[14]: https://github.com/dequelabs/axe-core?utm_source=chatgpt.com "GitHub - dequelabs/axe-core: Accessibility engine for automated Web UI testing · GitHub"
[15]: https://developer.chrome.com/docs/devtools/agents/get-started?utm_source=chatgpt.com "Get started with Chrome DevTools for agents"

You want a **working agentic frontend QA harness**, not another architecture diagram full of boxes and arrows.

The design below gives the coding agent three capabilities:

1. **Playwright MCP** - opens the browser, clicks controls, fills forms, inspects accessibility snapshots, network requests and console output.
2. **Chrome DevTools MCP** - investigates difficult runtime, rendering and performance problems.
3. **Your own QA MCP** - turns structured scenarios into permanent Playwright tests, audits generated tests and repeatedly executes them.

Playwright MCP currently requires Node.js 20 or newer and supports isolated browser sessions, testing assertions, storage, network mocking, tracing and video. Playwright also supplies planner, generator and healer agents for Codex and Claude Code. ([Playwright][1])

This is a runnable MVP. It is not yet a magical system that knows product requirements by telepathy. Requirements must still supply the expected behaviour.

---

# 1. Create the project

These commands are for macOS, Linux or WSL:

```bash
mkdir agent-qa-harness
cd agent-qa-harness

npm init -y

npm pkg set name="agent-qa-harness"
npm pkg set type="module"
npm pkg set private=true --json

npm pkg set scripts.typecheck="tsc --noEmit"
npm pkg set scripts.test="playwright test"
npm pkg set scripts.test:headed="playwright test --headed"
npm pkg set scripts.test:ui="playwright test --ui"
npm pkg set scripts.compile="tsx src/cli-compile.ts"
npm pkg set scripts.audit="tsx src/cli-audit.ts"
npm pkg set scripts.mcp="tsx src/mcp-server.ts"

npm install -D \
  @playwright/test@latest \
  @axe-core/playwright@latest \
  typescript@latest \
  tsx@latest \
  @types/node@latest

npm install \
  @modelcontextprotocol/server@latest \
  zod@latest

npx playwright install --with-deps chromium

mkdir -p \
  src/lib \
  specs/scenarios \
  tests/generated \
  artifacts \
  .codex \
  .github/workflows
```

Commit `package-lock.json`. That is what pins the actual dependency versions. Manually stuffing arbitrary version numbers into `package.json` and pretending they will remain current would be stupid.

The current MCP TypeScript SDK v2 uses `McpServer`, `serveStdio()` and Zod v4 schemas. ([Model Context Protocol][2])

---

# 2. TypeScript configuration

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": [
    "src/**/*.ts",
    "tests/**/*.ts",
    "playwright.config.ts"
  ]
}
```

---

# 3. Playwright configuration

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

const baseURL =
  process.env.BASE_URL ??
  'https://demo.playwright.dev/todomvc';

const webServerCommand = process.env.WEB_SERVER_COMMAND;
const webServerURL = process.env.WEB_SERVER_URL ?? baseURL;

export default defineConfig({
  testDir: './tests',

  outputDir: './artifacts/test-results',

  timeout: 30_000,

  expect: {
    timeout: 7_500,
  },

  fullyParallel: true,

  forbidOnly: Boolean(process.env.CI),

  retries: process.env.CI ? 2 : 0,

  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ['list'],
    [
      'html',
      {
        outputFolder: 'artifacts/html-report',
        open: 'never',
      },
    ],
    [
      'json',
      {
        outputFile: 'artifacts/results.json',
      },
    ],
  ],

  use: {
    baseURL,

    actionTimeout: 10_000,
    navigationTimeout: 30_000,

    trace: 'retain-on-failure-and-retries',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',

    serviceWorkers:
      process.env.BLOCK_SERVICE_WORKERS === '1'
        ? 'block'
        : 'allow',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 7'],
      },
    },
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
```

Playwright can start the application through `webServer`, use `baseURL`, retain traces and capture screenshots and video around failures. It also supports Chromium, Firefox, WebKit and mobile-device emulation. ([Playwright][3])

---

# 4. Browser evidence fixture

Create `tests/fixtures.ts`:

```ts
import {
  test as base,
  expect,
  type TestInfo,
} from '@playwright/test';

export interface BrowserSignals {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: Array<{
    method: string;
    url: string;
    failure: string;
  }>;
}

async function attachSignals(
  testInfo: TestInfo,
  signals: BrowserSignals,
): Promise<void> {
  await testInfo.attach('browser-signals', {
    body: Buffer.from(
      JSON.stringify(signals, null, 2),
      'utf8',
    ),
    contentType: 'application/json',
  });
}

export const test = base.extend<{
  browserSignals: BrowserSignals;
}>({
  browserSignals: [
    async ({ page }, use, testInfo) => {
      const signals: BrowserSignals = {
        consoleErrors: [],
        pageErrors: [],
        failedRequests: [],
      };

      page.on('console', message => {
        if (message.type() === 'error') {
          signals.consoleErrors.push(message.text());
        }
      });

      page.on('pageerror', error => {
        signals.pageErrors.push(error.message);
      });

      page.on('requestfailed', request => {
        signals.failedRequests.push({
          method: request.method(),
          url: request.url(),
          failure:
            request.failure()?.errorText ??
            'Unknown network failure',
        });
      });

      await use(signals);

      await attachSignals(testInfo, signals);

      if (process.env.FAIL_ON_BROWSER_ERRORS === '1') {
        expect.soft(
          signals.pageErrors,
          'Unexpected uncaught browser errors',
        ).toEqual([]);

        expect.soft(
          signals.consoleErrors,
          'Unexpected browser console errors',
        ).toEqual([]);
      }
    },
    {
      auto: true,
    },
  ],
});

export { expect };
```

This records evidence without automatically failing every test because some existing applications already dump harmless garbage into the console. Set `FAIL_ON_BROWSER_ERRORS=1` once your application is clean enough to enforce it.

---

# 5. Seed test

Create `tests/seed.spec.ts`:

```ts
import { test, expect } from './fixtures.js';

test('seed application state', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', {
      name: 'todos',
    }),
  ).toBeVisible();
});
```

For your own application, this seed should do things such as:

* Reset or seed test data.
* Authenticate the test user.
* Navigate to the application.
* Verify the application is healthy.

Playwright's planner explicitly uses a seed test to initialise fixtures, dependencies, hooks and authentication before exploring the application. ([Playwright][4])

---

# 6. Structured scenario format

This is the intermediate representation between "the agent clicked around" and "permanent Playwright test code."

Create `src/lib/scenario.ts`:

```ts
import * as z from 'zod/v4';

const RoleSchema = z.enum([
  'alert',
  'button',
  'checkbox',
  'combobox',
  'dialog',
  'heading',
  'img',
  'link',
  'list',
  'listitem',
  'option',
  'radio',
  'searchbox',
  'status',
  'switch',
  'tab',
  'textbox',
]);

export const TargetSchema = z.discriminatedUnion('by', [
  z.object({
    by: z.literal('role'),
    role: RoleSchema,
    name: z.string().min(1),
    exact: z.boolean().optional(),
  }),

  z.object({
    by: z.literal('label'),
    label: z.string().min(1),
    exact: z.boolean().optional(),
  }),

  z.object({
    by: z.literal('text'),
    text: z.string().min(1),
    exact: z.boolean().optional(),
  }),

  z.object({
    by: z.literal('testId'),
    testId: z.string().min(1),
  }),
]);

export const StepSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('goto'),
    path: z.string().min(1),
  }),

  z.object({
    action: z.literal('click'),
    target: TargetSchema,
  }),

  z.object({
    action: z.literal('fill'),
    target: TargetSchema,
    value: z.string(),
  }),

  z.object({
    action: z.literal('press'),
    target: TargetSchema,
    key: z.string().min(1),
  }),

  z.object({
    action: z.literal('check'),
    target: TargetSchema,
  }),

  z.object({
    action: z.literal('uncheck'),
    target: TargetSchema,
  }),

  z.object({
    action: z.literal('hover'),
    target: TargetSchema,
  }),

  z.object({
    action: z.literal('select'),
    target: TargetSchema,
    value: z.string(),
  }),
]);

export const AssertionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('visible'),
    target: TargetSchema,
  }),

  z.object({
    type: z.literal('hidden'),
    target: TargetSchema,
  }),

  z.object({
    type: z.literal('containsText'),
    target: TargetSchema,
    text: z.string(),
  }),

  z.object({
    type: z.literal('value'),
    target: TargetSchema,
    value: z.string(),
  }),

  z.object({
    type: z.literal('checked'),
    target: TargetSchema,
  }),

  z.object({
    type: z.literal('unchecked'),
    target: TargetSchema,
  }),

  z.object({
    type: z.literal('count'),
    target: TargetSchema,
    count: z.number().int().min(0),
  }),

  z.object({
    type: z.literal('urlPath'),
    path: z.string().min(1),
  }),

  z.object({
    type: z.literal('requestSeen'),
    method: z.string().min(1).transform(value =>
      value.toUpperCase(),
    ),
    urlIncludes: z.string().min(1),
  }),

  z.object({
    type: z.literal('requestAbsent'),
    method: z.string().min(1).transform(value =>
      value.toUpperCase(),
    ),
    urlIncludes: z.string().min(1),
  }),

  z.object({
    type: z.literal('axe'),
    tags: z.array(z.string()).optional(),
  }),
]);

export const ScenarioSchema = z.object({
  id: z
    .string()
    .regex(
      /^[a-z0-9][a-z0-9-]*$/,
      'Use lowercase letters, numbers and hyphens',
    ),

  name: z.string().min(3),

  requirementSource: z.string().min(1),

  startPath: z.string().min(1).default('/'),

  steps: z.array(StepSchema),

  assertions: z
    .array(AssertionSchema)
    .min(1, 'A test without assertions is not a test'),
});

export type Target = z.infer<typeof TargetSchema>;
export type Step = z.infer<typeof StepSchema>;
export type Assertion = z.infer<typeof AssertionSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;
```

Notice `requirementSource`. The agent must identify where an expected result came from. Otherwise it may record broken behaviour and immortalise the bug as a passing test.

---

# 7. Scenario-to-Playwright compiler

Create `src/lib/compiler.ts`:

```ts
import type {
  Assertion,
  Scenario,
  Step,
  Target,
} from './scenario.js';

function quote(value: string): string {
  return JSON.stringify(value);
}

function locator(target: Target): string {
  switch (target.by) {
    case 'role': {
      const options = [
        `name: ${quote(target.name)}`,
        target.exact ? 'exact: true' : undefined,
      ]
        .filter(Boolean)
        .join(', ');

      return `page.getByRole(${quote(target.role)}, { ${options} })`;
    }

    case 'label': {
      const options = target.exact
        ? ', { exact: true }'
        : '';

      return `page.getByLabel(${quote(target.label)}${options})`;
    }

    case 'text': {
      const options = target.exact
        ? ', { exact: true }'
        : '';

      return `page.getByText(${quote(target.text)}${options})`;
    }

    case 'testId':
      return `page.getByTestId(${quote(target.testId)})`;
  }
}

function compileStep(step: Step): string[] {
  switch (step.action) {
    case 'goto':
      return [
        `  await page.goto(${quote(step.path)});`,
      ];

    case 'click':
      return [
        `  await ${locator(step.target)}.click();`,
      ];

    case 'fill':
      return [
        `  await ${locator(step.target)}.fill(${quote(step.value)});`,
      ];

    case 'press':
      return [
        `  await ${locator(step.target)}.press(${quote(step.key)});`,
      ];

    case 'check':
      return [
        `  await ${locator(step.target)}.check();`,
      ];

    case 'uncheck':
      return [
        `  await ${locator(step.target)}.uncheck();`,
      ];

    case 'hover':
      return [
        `  await ${locator(step.target)}.hover();`,
      ];

    case 'select':
      return [
        `  await ${locator(step.target)}.selectOption(${quote(step.value)});`,
      ];
  }
}

function compileAssertion(
  assertion: Assertion,
  index: number,
): string[] {
  switch (assertion.type) {
    case 'visible':
      return [
        `  await expect(${locator(assertion.target)}).toBeVisible();`,
      ];

    case 'hidden':
      return [
        `  await expect(${locator(assertion.target)}).toBeHidden();`,
      ];

    case 'containsText':
      return [
        `  await expect(${locator(assertion.target)}).toContainText(${quote(assertion.text)});`,
      ];

    case 'value':
      return [
        `  await expect(${locator(assertion.target)}).toHaveValue(${quote(assertion.value)});`,
      ];

    case 'checked':
      return [
        `  await expect(${locator(assertion.target)}).toBeChecked();`,
      ];

    case 'unchecked':
      return [
        `  await expect(${locator(assertion.target)}).not.toBeChecked();`,
      ];

    case 'count':
      return [
        `  await expect(${locator(assertion.target)}).toHaveCount(${assertion.count});`,
      ];

    case 'urlPath':
      return [
        '  await expect',
        '    .poll(() => new URL(page.url()).pathname)',
        `    .toBe(${quote(assertion.path)});`,
      ];

    case 'requestSeen':
      return [
        '  await expect',
        '    .poll(() =>',
        '      observedRequests.filter(request =>',
        `        request.method === ${quote(assertion.method)} &&`,
        `        request.url.includes(${quote(assertion.urlIncludes)}),`,
        '      ).length,',
        '    )',
        '    .toBeGreaterThan(0);',
      ];

    case 'requestAbsent':
      return [
        '  expect(',
        '    observedRequests.filter(request =>',
        `      request.method === ${quote(assertion.method)} &&`,
        `      request.url.includes(${quote(assertion.urlIncludes)}),`,
        '    ),',
        '  ).toHaveLength(0);',
      ];

    case 'axe': {
      const variableName =
        `accessibilityScanResults${index}`;

      const builder = assertion.tags?.length
        ? `new AxeBuilder({ page }).withTags(${JSON.stringify(assertion.tags)})`
        : 'new AxeBuilder({ page })';

      return [
        `  const ${variableName} = await ${builder}.analyze();`,
        '',
        `  expect(${variableName}.violations).toEqual([]);`,
      ];
    }
  }
}

export function compileScenario(
  scenario: Scenario,
): string {
  const needsAxe = scenario.assertions.some(
    assertion => assertion.type === 'axe',
  );

  const needsNetwork = scenario.assertions.some(
    assertion =>
      assertion.type === 'requestSeen' ||
      assertion.type === 'requestAbsent',
  );

  const lines: string[] = [
    `// Generated from requirement: ${scenario.requirementSource}`,
    '// Do not weaken assertions merely to make this test pass.',
    '',
    "import { test, expect } from '../fixtures.js';",
  ];

  if (needsAxe) {
    lines.push(
      "import AxeBuilder from '@axe-core/playwright';",
    );
  }

  lines.push(
    '',
    `test(${quote(scenario.name)}, async ({ page }) => {`,
  );

  if (needsNetwork) {
    lines.push(
      '  const observedRequests: Array<{',
      '    method: string;',
      '    url: string;',
      '  }> = [];',
      '',
      "  page.on('request', request => {",
      '    observedRequests.push({',
      '      method: request.method(),',
      '      url: request.url(),',
      '    });',
      '  });',
      '',
    );
  }

  lines.push(
    `  await page.goto(${quote(scenario.startPath)});`,
    '',
  );

  for (const step of scenario.steps) {
    lines.push(...compileStep(step), '');
  }

  scenario.assertions.forEach((assertion, index) => {
    lines.push(
      ...compileAssertion(assertion, index),
      '',
    );
  });

  lines.push('});', '');

  return lines.join('\n');
}
```

Playwright recommends role, label, text and explicit test-ID locators rather than brittle DOM paths. Its locators also supply automatic waiting and retry behaviour. ([Playwright][5])

---

# 8. Compiler CLI

Create `src/cli-compile.ts`:

```ts
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';

import {
  basename,
  dirname,
  resolve,
} from 'node:path';

import { compileScenario } from './lib/compiler.js';
import { ScenarioSchema } from './lib/scenario.js';

const inputPath = process.argv[2];

if (!inputPath) {
  console.error(
    'Usage: npm run compile -- specs/scenarios/example.json',
  );
  process.exit(1);
}

const absoluteInputPath = resolve(inputPath);

let rawInput: unknown;

try {
  rawInput = JSON.parse(
    readFileSync(absoluteInputPath, 'utf8'),
  );
} catch (error) {
  console.error(
    `Could not read scenario ${basename(inputPath)}:`,
    error,
  );
  process.exit(1);
}

const parsed = ScenarioSchema.safeParse(rawInput);

if (!parsed.success) {
  console.error(
    JSON.stringify(
      parsed.error.format(),
      null,
      2,
    ),
  );

  process.exit(1);
}

const outputPath = resolve(
  'tests',
  'generated',
  `${parsed.data.id}.spec.ts`,
);

mkdirSync(dirname(outputPath), {
  recursive: true,
});

writeFileSync(
  outputPath,
  compileScenario(parsed.data),
  'utf8',
);

console.log(outputPath);
```

---

# 9. Generated-test auditor

This is not a complete formal verifier. It is a basic guardrail against the dumbest generated-test failures.

Create `src/lib/audit.ts`:

```ts
import {
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';

import { extname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export interface AuditIssue {
  file: string;
  rule: string;
  message: string;
}

export interface TestRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const prohibitedPatterns: Array<{
  rule: string;
  pattern: RegExp;
  message: string;
}> = [
  {
    rule: 'no-fixed-sleep',
    pattern: /\.waitForTimeout\s*\(/,
    message:
      'Do not use waitForTimeout(). Wait for observable application state.',
  },
  {
    rule: 'no-skipped-tests',
    pattern: /\btest\.(skip|fixme)\s*\(/,
    message:
      'Generated tests may not silently skip failures.',
  },
  {
    rule: 'no-only-tests',
    pattern: /\btest\.only\s*\(/,
    message:
      'Generated tests may not commit test.only().',
  },
  {
    rule: 'no-nth-selector',
    pattern: /\.nth\s*\(/,
    message:
      'nth() is usually coupled to DOM ordering. Use a semantic locator.',
  },
  {
    rule: 'no-xpath-selector',
    pattern: /xpath\s*=/i,
    message:
      'XPath selectors are prohibited in generated tests.',
  },
  {
    rule: 'no-raw-css-locator',
    pattern: /page\.locator\s*\(/,
    message:
      'Generated tests must use role, label, text or test-ID locators.',
  },
  {
    rule: 'no-trivial-assertion',
    pattern: /expect\s*\(\s*true\s*\)\s*\.toBe\s*\(\s*true\s*\)/,
    message:
      'A tautology does not test application behaviour.',
  },
  {
    rule: 'no-weak-truthiness',
    pattern: /\.toBeTruthy\s*\(/,
    message:
      'Assert the exact required state instead of generic truthiness.',
  },
];

function collectFiles(path: string): string[] {
  const absolutePath = resolve(path);
  const stats = statSync(absolutePath);

  if (stats.isFile()) {
    return extname(absolutePath) === '.ts'
      ? [absolutePath]
      : [];
  }

  return readdirSync(absolutePath).flatMap(entry =>
    collectFiles(resolve(absolutePath, entry)),
  );
}

export function auditGeneratedTests(
  root = 'tests/generated',
): AuditIssue[] {
  const files = collectFiles(root);
  const issues: AuditIssue[] = [];

  for (const file of files) {
    const source = readFileSync(file, 'utf8');

    if (!/\bexpect\s*(?:\.poll)?\s*\(/.test(source)) {
      issues.push({
        file,
        rule: 'requires-assertion',
        message:
          'Generated test file contains no assertion.',
      });
    }

    for (const prohibited of prohibitedPatterns) {
      if (prohibited.pattern.test(source)) {
        issues.push({
          file,
          rule: prohibited.rule,
          message: prohibited.message,
        });
      }
    }
  }

  return issues;
}

export function runPlaywrightTests(options: {
  target?: string;
  repeatEach?: number;
  project?: string;
}): TestRunResult {
  const target =
    options.target ?? 'tests/generated';

  const repeatEach =
    options.repeatEach ?? 3;

  const project =
    options.project ?? 'chromium';

  const executable =
    process.platform === 'win32'
      ? 'npx.cmd'
      : 'npx';

  const result = spawnSync(
    executable,
    [
      'playwright',
      'test',
      target,
      `--project=${project}`,
      `--repeat-each=${repeatEach}`,
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      encoding: 'utf8',
      stdio: 'pipe',
      maxBuffer: 20 * 1024 * 1024,
    },
  );

  return {
    exitCode:
      typeof result.status === 'number'
        ? result.status
        : 1,

    stdout: result.stdout ?? '',
    stderr:
      result.stderr ??
      result.error?.message ??
      '',
  };
}
```

Create `src/cli-audit.ts`:

```ts
import {
  auditGeneratedTests,
  runPlaywrightTests,
} from './lib/audit.js';

const target =
  process.argv[2] ??
  'tests/generated';

const repeatEach = Number.parseInt(
  process.env.REPEAT_EACH ?? '3',
  10,
);

const issues = auditGeneratedTests(target);

if (issues.length > 0) {
  console.error(
    JSON.stringify(
      {
        status: 'rejected',
        issues,
      },
      null,
      2,
    ),
  );

  process.exit(1);
}

const result = runPlaywrightTests({
  target,
  repeatEach,
  project:
    process.env.PLAYWRIGHT_PROJECT ??
    'chromium',
});

process.stdout.write(result.stdout);
process.stderr.write(result.stderr);

if (result.exitCode !== 0) {
  process.exit(result.exitCode);
}

console.log(
  JSON.stringify(
    {
      status: 'accepted',
      repeatEach,
      target,
    },
    null,
    2,
  ),
);
```

Running tests repeatedly does not prove they are non-flaky, but it catches embarrassing timing and state-leak problems before the generated code is committed.

---

# 10. Your custom QA MCP server

Create `src/mcp-server.ts`:

```ts
import {
  mkdirSync,
  writeFileSync,
} from 'node:fs';

import {
  dirname,
  resolve,
} from 'node:path';

import {
  McpServer,
} from '@modelcontextprotocol/server';

import {
  serveStdio,
} from '@modelcontextprotocol/server/stdio';

import * as z from 'zod/v4';

import {
  auditGeneratedTests,
  runPlaywrightTests,
} from './lib/audit.js';

import {
  compileScenario,
} from './lib/compiler.js';

import {
  ScenarioSchema,
} from './lib/scenario.js';

function textResult(
  value: unknown,
  isError = false,
) {
  return {
    isError,
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function generatedTestPath(
  scenarioId: string,
): string {
  return resolve(
    'tests',
    'generated',
    `${scenarioId}.spec.ts`,
  );
}

function truncate(
  value: string,
  limit = 30_000,
): string {
  if (value.length <= limit) {
    return value;
  }

  return [
    value.slice(0, limit),
    '',
    `[Output truncated after ${limit} characters]`,
  ].join('\n');
}

serveStdio(() => {
  const server = new McpServer({
    name: 'agent-qa-harness',
    version: '0.1.0',
  });

  server.registerTool(
    'qa_compile_scenario',
    {
      description:
        'Validate a structured frontend scenario and compile it into a permanent Playwright test under tests/generated.',

      inputSchema: z.object({
        scenario: ScenarioSchema,
      }),
    },

    async ({ scenario }) => {
      const outputPath =
        generatedTestPath(scenario.id);

      mkdirSync(dirname(outputPath), {
        recursive: true,
      });

      writeFileSync(
        outputPath,
        compileScenario(scenario),
        'utf8',
      );

      return textResult({
        status: 'compiled',
        outputPath,
        requirementSource:
          scenario.requirementSource,
      });
    },
  );

  server.registerTool(
    'qa_audit_generated_tests',
    {
      description:
        'Reject brittle or weakened generated tests and optionally run accepted tests repeatedly.',

      inputSchema: z.object({
        target: z
          .string()
          .default('tests/generated'),

        repeatEach: z
          .number()
          .int()
          .min(1)
          .max(10)
          .default(3),

        project: z
          .enum([
            'chromium',
            'mobile-chrome',
          ])
          .default('chromium'),

        execute: z
          .boolean()
          .default(true),
      }),
    },

    async ({
      target,
      repeatEach,
      project,
      execute,
    }) => {
      const issues =
        auditGeneratedTests(target);

      if (issues.length > 0) {
        return textResult(
          {
            status: 'rejected',
            issues,
          },
          true,
        );
      }

      if (!execute) {
        return textResult({
          status: 'static-audit-passed',
          target,
        });
      }

      const run = runPlaywrightTests({
        target,
        repeatEach,
        project,
      });

      return textResult(
        {
          status:
            run.exitCode === 0
              ? 'passed'
              : 'failed',

          exitCode: run.exitCode,
          repeatEach,
          project,
          stdout: truncate(run.stdout),
          stderr: truncate(run.stderr),
        },
        run.exitCode !== 0,
      );
    },
  );

  server.registerTool(
    'qa_run_playwright_tests',
    {
      description:
        'Run an existing Playwright test file or directory without accepting arbitrary shell commands.',

      inputSchema: z.object({
        target: z
          .string()
          .default('tests'),

        repeatEach: z
          .number()
          .int()
          .min(1)
          .max(10)
          .default(1),

        project: z
          .enum([
            'chromium',
            'mobile-chrome',
          ])
          .default('chromium'),
      }),
    },

    async ({
      target,
      repeatEach,
      project,
    }) => {
      const run = runPlaywrightTests({
        target,
        repeatEach,
        project,
      });

      return textResult(
        {
          status:
            run.exitCode === 0
              ? 'passed'
              : 'failed',

          exitCode: run.exitCode,
          stdout: truncate(run.stdout),
          stderr: truncate(run.stderr),
        },
        run.exitCode !== 0,
      );
    },
  );

  return server;
});
```

The MCP tool intentionally does **not** expose a generic `run_shell_command` function. Giving browser-controlled content a route to arbitrary shell execution is reckless. Playwright itself warns that its unrestricted browser code execution capability is RCE-equivalent and should only be enabled for trusted clients. ([Playwright][1])

---

# 11. Add the three MCP servers

Create `.mcp.json` for Claude Code and other clients that support the standard format:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": [
        "-y",
        "@playwright/mcp@latest",
        "--isolated",
        "--caps=testing,storage,network,devtools"
      ]
    },
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@latest",
        "--isolated"
      ]
    },
    "qa-harness": {
      "command": "npm",
      "args": [
        "run",
        "-s",
        "mcp"
      ]
    }
  }
}
```

Playwright MCP's `--isolated` mode starts each session cleanly. Its capability flags expose testing assertions, authentication storage, network controls, tracing and video. Chrome DevTools MCP also supports temporary isolated profiles. ([Playwright][1])

Do not use Chrome DevTools MCP against your normal logged-in Chrome profile. Google explicitly warns that the agent can inspect and modify everything available in that browser session. ([Chrome for Developers][6])

## Native Windows Claude Code

Use `cmd /c` for local npm MCP servers:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "cmd",
      "args": [
        "/c",
        "npx",
        "-y",
        "@playwright/mcp@latest",
        "--isolated",
        "--caps=testing,storage,network,devtools"
      ]
    },
    "chrome-devtools": {
      "command": "cmd",
      "args": [
        "/c",
        "npx",
        "-y",
        "chrome-devtools-mcp@latest",
        "--isolated"
      ]
    },
    "qa-harness": {
      "command": "cmd",
      "args": [
        "/c",
        "npm",
        "run",
        "-s",
        "mcp"
      ]
    }
  }
}
```

Anthropic documents the `cmd /c` requirement for native Windows MCP processes using `npx`. ([Claude Platform Docs][7])

---

# 12. Codex configuration

Create `.codex/config.toml`:

```toml
[mcp_servers.playwright]
command = "npx"
args = [
  "-y",
  "@playwright/mcp@latest",
  "--isolated",
  "--caps=testing,storage,network,devtools",
]
startup_timeout_sec = 30
tool_timeout_sec = 180
required = true
default_tools_approval_mode = "prompt"

[mcp_servers.chrome-devtools]
command = "npx"
args = [
  "-y",
  "chrome-devtools-mcp@latest",
  "--isolated",
]
startup_timeout_sec = 30
tool_timeout_sec = 180
default_tools_approval_mode = "prompt"

[mcp_servers.qa-harness]
command = "npm"
args = [
  "run",
  "-s",
  "mcp",
]
startup_timeout_sec = 30
tool_timeout_sec = 300
required = true
default_tools_approval_mode = "writes"
```

Codex supports project-scoped `.codex/config.toml` files and lets each MCP server specify command, arguments, environment, working directory, timeouts and approval behaviour. ([OpenAI Developers][8])

You can also install the servers through commands:

```bash
codex mcp add playwright -- \
  npx -y @playwright/mcp@latest \
  --isolated \
  --caps=testing,storage,network,devtools

codex mcp add chrome-devtools -- \
  npx -y chrome-devtools-mcp@latest \
  --isolated

codex mcp add qa-harness -- \
  npm run -s mcp

codex mcp list
```

---

# 13. Agent rules

Create `AGENTS.md`:

```md
# Frontend QA Agent Rules

## Purpose

Explore frontend behaviour, identify defects, and convert verified requirements into maintainable Playwright tests.

## Required workflow

1. Read the requirement, ticket, PRD or acceptance criteria.
2. Read `tests/seed.spec.ts`.
3. Start or connect to the application.
4. Use Playwright MCP for normal browser interaction.
5. Use Chrome DevTools MCP only for deeper console, runtime, rendering or performance diagnosis.
6. Record each proposed test as a structured scenario.
7. Every scenario must identify its `requirementSource`.
8. Compile scenarios with `qa_compile_scenario`.
9. Audit and execute generated tests with `qa_audit_generated_tests`.
10. Report application defects separately from test defects.

## Oracle rules

Observed behaviour is not automatically correct behaviour.

Expected results may come from:

1. Explicit acceptance criteria.
2. Product requirements.
3. API or schema contracts.
4. Existing approved tests.
5. Human-approved behaviour.

When no reliable expected result exists, stop test generation and report that human confirmation is required.

## Selector rules

Use this order:

1. `getByRole`
2. `getByLabel`
3. `getByText`
4. `getByTestId`

Do not use XPath, DOM-order selectors, `nth()`, or long CSS selectors.

## Timing rules

Do not use `waitForTimeout()`.

Wait for visible UI state, URL changes, network responses, field values, enabled controls or other observable behaviour.

## Healing rules

The healer may:

- Repair a locator.
- Repair test setup.
- Correct a genuine timing race.
- Update an expected route only when the requirement confirms it changed.

The healer may not:

- Delete an assertion.
- Weaken an assertion.
- add `test.skip()` or `test.fixme()`.
- Increase timeouts without proving the operation legitimately needs more time.
- Replace expected data with whatever the application currently returns.

## Completion criteria

A generated test is complete only when:

- It has a named requirement source.
- It contains meaningful assertions.
- Static audit passes.
- It passes repeated execution.
- Browser evidence is available for failures.
- No assertion was weakened during healing.
```

This file matters more than adding five more random MCP servers. Tools provide ability. Rules determine whether the agent uses that ability intelligently or produces a landfill of passing nonsense.

---

# 14. Add a working scenario

Create `specs/scenarios/todo-create.json`:

```json
{
  "id": "todo-create",
  "name": "User can create a todo item",
  "requirementSource": "TodoMVC core behaviour: entering a non-empty todo and pressing Enter creates an active item",
  "startPath": "/",
  "steps": [
    {
      "action": "fill",
      "target": {
        "by": "role",
        "role": "textbox",
        "name": "What needs to be done?"
      },
      "value": "Buy groceries"
    },
    {
      "action": "press",
      "target": {
        "by": "role",
        "role": "textbox",
        "name": "What needs to be done?"
      },
      "key": "Enter"
    }
  ],
  "assertions": [
    {
      "type": "visible",
      "target": {
        "by": "text",
        "text": "Buy groceries",
        "exact": true
      }
    },
    {
      "type": "unchecked",
      "target": {
        "by": "role",
        "role": "checkbox",
        "name": "Toggle Todo"
      }
    },
    {
      "type": "visible",
      "target": {
        "by": "text",
        "text": "1 item left",
        "exact": true
      }
    },
    {
      "type": "value",
      "target": {
        "by": "role",
        "role": "textbox",
        "name": "What needs to be done?"
      },
      "value": ""
    }
  ]
}
```

Compile it:

```bash
npm run compile -- specs/scenarios/todo-create.json
```

That produces:

```text
tests/generated/todo-create.spec.ts
```

Audit and execute it three times:

```bash
npm run audit
```

Run visually:

```bash
npm run test:headed
```

Open Playwright's test interface:

```bash
npm run test:ui
```

Playwright's UI mode provides an interactive trace of each test, while trace files expose actions, DOM snapshots, console output and network activity. ([Playwright][9])

---

# 15. Point it at a local application

For an application running on port `3000`:

```bash
BASE_URL=http://127.0.0.1:3000 \
WEB_SERVER_COMMAND="npm run dev" \
WEB_SERVER_URL=http://127.0.0.1:3000 \
npm run audit
```

For a production-style build:

```bash
npm run build

BASE_URL=http://127.0.0.1:3000 \
WEB_SERVER_COMMAND="npm run start" \
WEB_SERVER_URL=http://127.0.0.1:3000 \
npm run test
```

I cannot give you the exact start, reset, authentication or database commands for your actual application because you have not supplied that codebase. Anyone pretending otherwise would be inventing details.

---

# 16. Initialise Playwright's built-in agents

For Codex:

```bash
npx playwright init-agents --loop=codex
```

For Claude Code:

```bash
npx playwright init-agents --loop=claude
```

Run the command matching the agent you are using.

Playwright's official workflow already contains:

* Planner - explores the application and creates a Markdown test plan.
* Generator - verifies selectors and assertions while creating tests.
* Healer - replays failures, inspects the current UI and proposes repairs until the guardrails stop it. ([Playwright][4])

Your custom MCP sits underneath this and adds stricter compilation, audit and repeatability rules.

---

# 17. Exact prompt for the coding agent

Use this:

```text
Read AGENTS.md and tests/seed.spec.ts before doing anything.

Test the todo creation flow.

Use Playwright MCP to explore the application in an isolated browser.

Your source of truth is:
TodoMVC core behaviour: entering a non-empty todo and pressing Enter creates an active item.

Perform the flow manually first.

While exploring:
- Inspect the accessibility snapshot.
- Record console errors.
- Record failed requests.
- Verify the created todo is visible.
- Verify it is unchecked.
- Verify the active-item counter changes.
- Verify the input is cleared.

Then create a structured scenario compatible with src/lib/scenario.ts.

Call qa_compile_scenario to generate the permanent Playwright test.

Call qa_audit_generated_tests with:
- target: tests/generated/todo-create.spec.ts
- repeatEach: 3
- project: chromium
- execute: true

Do not use waitForTimeout, CSS selectors, XPath, nth(), test.skip or weakened assertions.

If observed behaviour contradicts the requirement, report an application defect. Do not change the expected result to match the defect.
```

For a real feature, replace the TodoMVC requirement with the actual ticket or acceptance criteria.

---

# 18. CI workflow

Create `.github/workflows/frontend-qa.yml`:

```yaml
name: Frontend QA

on:
  push:
    branches:
      - main
      - master

  pull_request:
    branches:
      - main
      - master

jobs:
  frontend-qa:
    timeout-minutes: 60

    runs-on: ubuntu-latest

    steps:
      - name: Check out repository
        uses: actions/checkout@v6

      - name: Configure Node.js
        uses: actions/setup-node@v6
        with:
          node-version: lts/*
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Install Chromium
        run: npx playwright install --with-deps chromium

      - name: Type-check harness
        run: npm run typecheck

      - name: Audit generated tests
        run: npm run audit

      - name: Run complete frontend suite
        run: npm test

      - name: Upload browser evidence
        if: ${{ !cancelled() }}
        uses: actions/upload-artifact@v5
        with:
          name: frontend-qa-artifacts
          path: artifacts/
          retention-days: 30
```

This follows Playwright's current GitHub Actions structure using `checkout@v6`, `setup-node@v6`, browser installation, test execution and uploaded reports. ([Playwright][10])

---

# What this MVP now does

The agent can:

```text
Read requirement
    ↓
Explore browser semantically
    ↓
Click, fill, press and navigate
    ↓
Inspect console and network
    ↓
Create structured scenario
    ↓
Compile permanent Playwright test
    ↓
Reject brittle selectors and sleeps
    ↓
Run the test repeatedly
    ↓
Produce trace, screenshot, video and JSON evidence
```

## What it still does not solve

It does not yet provide:

* Database reset adapters.
* Automatic test-user creation.
* Authentication-state management.
* Pull-request creation.
* Mutation testing that proves every test detects a defect.
* Requirement-to-test coverage storage.
* Multi-agent browser-session coordination.
* Test deduplication.
* Approval workflows for destructive actions.
* Visual-baseline approval.
* Intelligent defect-versus-test-failure classification.

Those are the next serious pieces. Do not start by building a browser extension. Playwright MCP already supports connecting through an extension, but the hard problem is reliable test data and trustworthy expected results, not physically clicking the button. ([Playwright][1])

[1]: https://playwright.dev/docs/getting-started-mcp "Playwright MCP | Playwright"
[2]: https://ts.sdk.modelcontextprotocol.io/v2/ "MCP TypeScript SDK"
[3]: https://playwright.dev/docs/test-webserver?utm_source=chatgpt.com "Web server | Playwright"
[4]: https://playwright.dev/docs/test-agents "Agents | Playwright"
[5]: https://playwright.dev/docs/best-practices?utm_source=chatgpt.com "Best Practices | Playwright"
[6]: https://developer.chrome.com/docs/devtools/agents/get-started?utm_source=chatgpt.com "Get started with Chrome DevTools for agents  |  Chrome for Developers"
[7]: https://docs.anthropic.com/id/docs/claude-code/mcp?utm_source=chatgpt.com "Hubungkan Claude Code ke alat melalui MCP - Anthropic"
[8]: https://developers.openai.com/codex/mcp?utm_source=chatgpt.com "Model Context Protocol | ChatGPT Learn"
[9]: https://playwright.dev/docs/running-tests?utm_source=chatgpt.com "Running and debugging tests | Playwright"
[10]: https://playwright.dev/docs/ci?utm_source=chatgpt.com "Continuous Integration | Playwright"


Your repo needs an **instruction hierarchy**, not one bloated `AGENTS.md` that tries to teach the model everything every time.

Codex loads `AGENTS.md` files from the repository root down toward the working directory, with closer files overriding broader ones. Its default combined project-instruction limit is 32 KiB. Claude recommends keeping each `CLAUDE.md` under roughly 200 lines because oversized instruction files consume context and reduce adherence. Both OpenAI and Anthropic recommend moving repeatable procedures into skills, which load only when relevant. ([OpenAI Developers][1])

For long work, use two different things:

* `.agent/PLANS.md` defines what a valid plan must contain.
* `.agent/plans/active/*.md` contains the living plan for one actual task.

Do not keep overwriting one vague `PLAN.md`. OpenAI's ExecPlan guidance specifically treats plans as self-contained living documents containing progress, discoveries, decisions, exact commands, observable acceptance criteria and recovery instructions. ([OpenAI Developers][2])

# Recommended repository structure

```text
agent-qa-harness/
├── AGENTS.md
├── CLAUDE.md
│
├── .agent/
│   ├── PLANS.md
│   └── plans/
│       ├── active/
│       └── completed/
│
├── .agents/
│   └── skills/
│       └── frontend-qa/
│           ├── SKILL.md
│           ├── references/
│           │   ├── scenario-format.md
│           │   └── test-quality-rules.md
│           └── scripts/
│               └── validate-generated-test.sh
│
├── .claude/
│   └── skills/
│       └── frontend-qa/
│           ├── SKILL.md
│           ├── references/
│           │   ├── scenario-format.md
│           │   └── test-quality-rules.md
│           └── scripts/
│               └── validate-generated-test.sh
│
├── specs/
│   ├── product/
│   ├── scenarios/
│   └── discoveries/
│
├── tests/
│   ├── seed.spec.ts
│   ├── generated/
│   ├── approved/
│   └── fixtures.ts
│
├── artifacts/
│   ├── traces/
│   ├── screenshots/
│   ├── videos/
│   └── reports/
│
└── src/
    ├── mcp-server.ts
    └── lib/
        ├── scenario.ts
        ├── compiler.ts
        └── audit.ts
```

Use identical contents in the Codex and Claude skill directories initially. Later, generate both copies from one source file so they cannot drift.

GitHub Copilot also supports repository-wide and path-specific instructions, including `AGENTS.md`, with the nearest applicable `AGENTS.md` taking precedence. That means a well-written `AGENTS.md` can be your cross-agent foundation instead of maintaining three contradictory manuals. ([GitHub Docs][3])

# 1. Root `AGENTS.md`

This file contains rules that should apply during nearly every task. It should not contain a twenty-step tutorial for every possible operation.

```md
# Agent QA Harness

## Mission

This repository builds and maintains browser-based frontend tests.

The agent must explore the application, compare observed behavior with an explicit requirement, generate durable Playwright tests, validate those tests from a clean state, and preserve evidence for failures.

A browser action without a meaningful assertion is not a test.

## Sources of Truth

Use expected behavior from this order:

1. Explicit acceptance criteria in `specs/product/`.
2. Approved API contracts or schemas.
3. Existing approved tests in `tests/approved/`.
4. Human-confirmed behavior recorded in a specification.
5. Observed application behavior only when clearly marked unverified.

Never convert observed behavior into an approved assertion when it conflicts with a requirement.

When no reliable expected result exists, record the uncertainty in `specs/discoveries/` and stop test generation for that assertion.

## Required Workflow

For frontend testing work:

1. Read this file.
2. Read the applicable product specification.
3. Read `tests/seed.spec.ts`.
4. Read the active ExecPlan when one exists.
5. Start the application using the documented repository command.
6. Run the seed test before exploration.
7. Explore with Playwright MCP.
8. Use Chrome DevTools MCP only for deeper runtime, network, rendering or performance diagnosis.
9. Record proposed tests as structured scenarios.
10. Compile scenarios into Playwright tests.
11. Audit generated tests.
12. Run accepted tests repeatedly from clean browser contexts.
13. Update the active ExecPlan after every meaningful milestone.
14. Store failure evidence under `artifacts/`.

## Planning Rule

Use an ExecPlan for work that:

- changes more than one subsystem;
- introduces or changes an MCP tool;
- changes the scenario schema;
- changes generated-test behavior;
- changes test-healing behavior;
- requires a migration;
- is expected to require more than one implementation session;
- contains material uncertainty requiring a prototype.

ExecPlans must follow `.agent/PLANS.md`.

Store active plans in `.agent/plans/active/`.

Move completed plans to `.agent/plans/completed/`.

## Tool Responsibilities

Use Playwright MCP for:

- navigation;
- clicking;
- typing;
- selecting;
- accessibility snapshots;
- visible UI assertions;
- browser-level network observation.

Use Chrome DevTools MCP for:

- uncaught runtime errors;
- detailed network diagnosis;
- performance traces;
- rendering investigation;
- browser internals not exposed by the normal Playwright workflow.

Use the QA harness MCP for:

- validating scenario objects;
- compiling permanent tests;
- auditing generated test code;
- repeated execution;
- producing machine-readable results.

Do not use two tools to control the same browser page concurrently.

## Selector Rules

Use selectors in this order:

1. `getByRole`
2. `getByLabel`
3. `getByText`
4. `getByTestId`

Do not generate:

- XPath selectors;
- selectors based on DOM position;
- `nth()` selectors;
- long CSS selectors;
- selectors based on generated class names.

Add a test ID only when semantic locators cannot uniquely identify the control.

## Assertion Rules

Every test must contain at least one requirement-backed assertion.

Prefer checking both:

- the user-visible result; and
- the relevant system side effect.

For example, a blocked order submission should verify both the visible validation error and the absence of the order-creation request.

Do not generate:

- tautological assertions;
- generic truthiness assertions;
- screenshot-only tests presented as behavioral tests;
- assertions copied from unexplained observed behavior;
- assertions weakened merely to make a failing test pass.

## Timing Rules

Do not use `waitForTimeout()` or arbitrary sleeps.

Wait for an observable condition such as:

- an element becoming visible;
- an element becoming enabled;
- a URL change;
- a response;
- a field value;
- a request completing;
- a loading indicator disappearing.

## Healing Rules

The healer may:

- replace a brittle locator with a semantic locator;
- repair valid test setup;
- correct a real synchronization problem;
- update an expected route when an approved requirement confirms the route changed.

The healer may not:

- delete assertions;
- weaken assertions;
- add `test.skip()` or `test.fixme()`;
- replace expected data with current broken output;
- increase timeouts without evidence;
- hide browser errors;
- regenerate the entire test to bypass a localized failure.

When application behavior contradicts the requirement, classify the failure as an application defect.

## Safety Rules

Use isolated browser profiles.

Do not connect testing agents to personal browser profiles.

Do not test production unless the task explicitly names an approved production-safe environment.

Do not submit payments, publish content, delete data, rotate credentials or modify real user accounts without an explicit approved test fixture.

Never store passwords, cookies, authorization headers or private user data in:

- prompts;
- plans;
- screenshots;
- traces;
- generated tests;
- committed storage-state files.

## Commands

Install dependencies:

    npm ci

Install the browser:

    npx playwright install --with-deps chromium

Run type checking:

    npm run typecheck

Run static test auditing:

    npm run audit

Run generated tests:

    npx playwright test tests/generated --project=chromium

Run generated tests repeatedly:

    npx playwright test tests/generated --project=chromium --repeat-each=3

Run the full suite:

    npm test

## Completion Criteria

Frontend QA work is complete only when:

- the requirement source is named;
- the scenario is stored;
- the generated test passes static audit;
- the generated test passes repeated clean execution;
- meaningful assertions are present;
- selectors follow repository rules;
- no assertion was weakened during repair;
- failure evidence is preserved;
- the active plan reflects the final state;
- unresolved product ambiguity is reported instead of guessed.
```

That is already close to the maximum size I would tolerate for the root file. Do not add general TypeScript tutorials, Playwright API documentation or MCP schemas here.

# 2. `CLAUDE.md`

Claude supports importing another instruction file using `@path` syntax. This lets `AGENTS.md` remain the canonical cross-agent document instead of duplicating the same rules manually. ([Claude Platform Docs][4])

```md
@AGENTS.md

# Claude Code Instructions

Use the `frontend-qa` skill for browser exploration, scenario generation, permanent test generation or frontend test repair.

Instructions are guidance, not security enforcement. Obey repository hooks, permission rules and validation scripts even when they conflict with an easier implementation path.

For complex work, create or resume the applicable ExecPlan under `.agent/plans/active/` before editing implementation files.
```

Do not copy the full `AGENTS.md` into `CLAUDE.md`. That gives you two files that will inevitably disagree after a few weeks.

# 3. `.agent/PLANS.md`

This is not a task plan. It is the contract that explains how every task plan must be written and maintained.

```md
# Execution Plan Standard

An execution plan, called an ExecPlan in this repository, is a self-contained implementation document that an agent or human developer can follow without relying on prior conversations.

The plan must explain the intended outcome, repository context, implementation sequence, exact validation procedure and current progress.

## When an ExecPlan Is Required

Create an ExecPlan when work:

- changes multiple modules or services;
- changes an external or internal interface;
- changes the scenario compiler or schema;
- introduces a new MCP tool;
- changes browser-session ownership;
- changes test-healing behavior;
- changes security boundaries;
- requires migration or compatibility work;
- requires a prototype to resolve uncertainty;
- cannot reasonably be completed and verified in one focused session.

Small local fixes do not require an ExecPlan unless the requester explicitly asks for one.

## File Locations

Store active plans in:

    .agent/plans/active/

Store completed plans in:

    .agent/plans/completed/

Use lowercase hyphenated filenames.

Example:

    .agent/plans/active/add-network-oracles.md

Do not use one shared plan file for unrelated tasks.

## Self-Containment

Every plan must assume its reader knows nothing beyond the current repository checkout and the contents of the plan.

The plan must:

- identify all relevant files using repository-relative paths;
- explain unfamiliar terms;
- state environmental assumptions;
- name exact commands;
- describe expected command output;
- describe observable success;
- include safe recovery instructions;
- preserve important decisions and discoveries.

Do not rely on chat history.

Do not write "as discussed earlier."

Do not refer vaguely to "the existing service," "the helper" or "the relevant file." Name it.

## Living Document Rules

Update the plan while implementation proceeds.

The following sections must always represent the current state:

- Progress
- Surprises and Discoveries
- Decision Log
- Outcomes and Retrospective

After any material change in direction, update all affected sections rather than adding a contradictory note at the bottom.

At each stopping point, the plan must make it possible for another stateless agent to continue the work.

## Required Structure

Every ExecPlan must use these headings in this order:

1. Purpose and User-Visible Outcome
2. Progress
3. Surprises and Discoveries
4. Decision Log
5. Outcomes and Retrospective
6. Context and Repository Orientation
7. Requirements and Non-Goals
8. Plan of Work
9. Concrete Steps
10. Validation and Acceptance
11. Idempotence and Recovery
12. Security and Data Handling
13. Artifacts and Evidence
14. Interfaces and Dependencies
15. Revision Notes

## Purpose and User-Visible Outcome

Explain what becomes possible after the change.

Describe how a human can see the completed behavior working.

Do not define success only as files being changed or code compiling.

## Progress

Use checkboxes only in this section.

Every completed item must include a UTC timestamp.

Use this format:

    - [x] (2026-08-05 10:00Z) Completed repository investigation.
    - [ ] Implement scenario validation.
    - [ ] Partially completed browser evidence collection. Completed: console capture. Remaining: failed request capture.

Do not mark an item complete until its validation has passed.

## Surprises and Discoveries

Record unexpected repository behavior, defects, constraints and useful implementation findings.

Each entry must include evidence.

Use this format:

    - Observation: The application registers its service worker during Playwright runs.
      Evidence: `artifacts/traces/checkout-run-03.zip` shows requests being served from the worker.

## Decision Log

Record material decisions.

Use this format:

    - Decision: Use Playwright as the only browser-control owner and Chrome DevTools as an inspection-only tool.
      Rationale: Two simultaneous browser controllers can create races and make action attribution unclear.
      Date: 2026-08-05
      Author: QA agent

## Outcomes and Retrospective

At completion, compare the implementation against the original purpose.

Include:

- completed behavior;
- uncompleted behavior;
- limitations;
- follow-up work;
- evidence demonstrating success;
- lessons that should become permanent repository guidance.

Do not write generic statements such as "implementation completed successfully."

## Context and Repository Orientation

Describe:

- the current architecture;
- relevant entry points;
- relevant data flow;
- important types;
- existing tests;
- commands required to start the system;
- known constraints.

Name exact paths and symbols.

## Requirements and Non-Goals

Separate required outcomes from intentionally excluded work.

Requirements must be observable or machine-verifiable.

Non-goals prevent the implementation from quietly expanding into unrelated cleanup.

## Plan of Work

Explain the implementation sequence in prose.

For every change, identify:

- the file;
- the symbol or section;
- the intended behavior;
- why the change is necessary;
- how it will be verified.

Prefer small milestones that leave the repository testable.

Use a prototype milestone when a technical assumption is uncertain.

## Concrete Steps

State exact commands and their working directories.

Example:

    Working directory: repository root

    Run:

        npm ci
        npm run typecheck
        npm run audit
        npx playwright test tests/generated --project=chromium --repeat-each=3

    Expected result:

        TypeScript exits with status 0.
        Static audit reports no prohibited patterns.
        Every generated test passes three consecutive runs.

Update this section when commands or expected outputs change.

## Validation and Acceptance

Acceptance must describe behavior, not implementation details.

Each acceptance item must include:

- setup;
- action;
- expected visible result;
- expected system side effect;
- evidence location.

For generated tests, demonstrate when practical that the test fails when the required behavior is deliberately broken and passes when it is restored.

Compilation alone is not acceptance.

## Idempotence and Recovery

Explain whether each important operation is safe to repeat.

For risky operations, describe:

- backup or snapshot requirements;
- partial-failure behavior;
- retry procedure;
- rollback procedure;
- cleanup procedure.

Never leave test accounts, browser sessions or seeded records in an unknown state.

## Security and Data Handling

Describe:

- domains the agent may access;
- approved test accounts;
- prohibited actions;
- secret handling;
- trace and screenshot redaction;
- whether production access is prohibited;
- approval requirements for destructive actions.

## Artifacts and Evidence

List important artifacts such as:

- Playwright traces;
- screenshots;
- videos;
- JSON reports;
- test plans;
- generated scenarios;
- benchmark results;
- relevant short command transcripts.

Do not paste enormous logs into the plan. Store them under `artifacts/` and reference their paths.

## Interfaces and Dependencies

Name any interface that must exist after implementation.

Include exact:

- exported types;
- function signatures;
- MCP tool names;
- MCP input and output schemas;
- environment variables;
- expected file locations;
- dependency additions.

Explain why each new dependency is required.

## Revision Notes

After every meaningful plan revision, append:

    - 2026-08-05: Changed network assertions from post-run log inspection to request listeners because the test must prove the request occurred during the exact scenario.

A revision note does not replace updating the affected sections above.
```

# 4. Concrete active plan

This is what an actual plan should look like. Notice that it does not merely say "implement frontend testing." It names files, behavior, validation and evidence.

Create:

```text
.agent/plans/active/add-requirement-backed-exploration.md
```

```md
# Add Requirement-Backed Browser Exploration Sessions

This ExecPlan follows `.agent/PLANS.md`.

## Purpose and User-Visible Outcome

After this change, a coding agent can explore a frontend requirement using an isolated browser session, record its actions and observations, produce a structured scenario, compile that scenario into a permanent Playwright test and validate the generated test repeatedly.

The generated test will identify the source of every expected result. When observed behavior contradicts the requirement, the system will report an application defect instead of rewriting the assertion to match the defect.

A developer can see the feature working by running the QA MCP server, exploring a configured application, compiling a scenario and then running the resulting test three consecutive times.

## Progress

- [x] (2026-08-05 10:00Z) Defined the initial scenario schema in `src/lib/scenario.ts`.
- [x] (2026-08-05 10:20Z) Added scenario compilation in `src/lib/compiler.ts`.
- [x] (2026-08-05 10:45Z) Added static generated-test auditing in `src/lib/audit.ts`.
- [ ] Add an exploration-session schema.
- [ ] Add requirement-source validation.
- [ ] Add browser observation recording.
- [ ] Add defect classification.
- [ ] Add MCP tools for starting and completing exploration sessions.
- [ ] Add unit tests for schema validation.
- [ ] Add an end-to-end test demonstrating scenario generation and repeated execution.
- [ ] Record final evidence and move this plan to `.agent/plans/completed/`.

## Surprises and Discoveries

- Observation: A compiled scenario currently records the requirement source as a comment but does not validate whether the referenced requirement file exists.
  Evidence: `src/lib/compiler.ts` accepts `requirementSource` as unrestricted text.

- Observation: Static test auditing can reject obvious weak patterns but cannot prove that an assertion came from a valid product requirement.
  Evidence: `src/lib/audit.ts` inspects generated TypeScript source but does not read product specifications.

## Decision Log

- Decision: Store exploration records separately from permanent test scenarios.
  Rationale: Exploration contains failed attempts, transient observations and diagnostics that should not automatically become approved test behavior.
  Date: 2026-08-05
  Author: QA agent

- Decision: Require requirement sources to reference repository files under `specs/product/`.
  Rationale: Free-form requirement strings cannot be audited reliably and may contain invented expectations.
  Date: 2026-08-05
  Author: QA agent

- Decision: Keep Playwright as the action owner and Chrome DevTools as an inspection tool.
  Rationale: Concurrent browser-control owners introduce race conditions and make recorded action sequences unreliable.
  Date: 2026-08-05
  Author: QA agent

## Outcomes and Retrospective

The work is not complete.

The current compiler and auditor can generate and repeatedly execute tests, but they do not yet preserve the distinction between requirement-backed expectations and unverified observations.

At completion, this section must document the final MCP tools, test evidence, remaining limitations and any rules that should move into `AGENTS.md`.

## Context and Repository Orientation

`src/lib/scenario.ts` defines the structured scenario accepted by the compiler.

`src/lib/compiler.ts` converts a valid scenario into a Playwright TypeScript test under `tests/generated/`.

`src/lib/audit.ts` rejects prohibited generated-test patterns and invokes Playwright repeatedly.

`src/mcp-server.ts` exposes compilation, auditing and test execution through MCP.

`tests/seed.spec.ts` establishes the application state that browser exploration should inherit.

`specs/product/` will contain approved product requirements.

`specs/discoveries/` will contain observed ambiguities and requirement conflicts that require review.

The new exploration-session layer will sit before scenario compilation. It will preserve raw observations without treating them as approved expectations.

## Requirements and Non-Goals

The implementation must:

- create a typed exploration-session schema;
- identify the application URL and seed test;
- identify a repository-relative product requirement file;
- record browser actions;
- record console errors;
- record page errors;
- record failed requests;
- record candidate assertions;
- classify candidate assertions as requirement-backed or unverified;
- prevent unverified assertions from being compiled into approved tests;
- create a defect report when behavior contradicts a requirement;
- expose session creation and completion through MCP;
- store exploration evidence under `artifacts/explorations/`;
- preserve deterministic machine-readable output.

The implementation will not:

- implement visual image understanding;
- interact with production systems;
- automatically approve visual baselines;
- create pull requests;
- repair arbitrary application defects;
- permit generic shell execution through MCP.

## Plan of Work

First, extend `src/lib/scenario.ts` with an `ExplorationSessionSchema`. The schema will contain a session ID, requirement file path, seed test path, base URL, recorded actions, observations, candidate assertions and evidence paths.

Second, add `src/lib/requirements.ts`. This module will resolve requirement paths, reject paths outside `specs/product/`, verify that the file exists and return a stable content hash. The hash will be stored with the exploration so later changes to the requirement are detectable.

Third, add `src/lib/exploration.ts`. This module will create sessions, append observations, classify candidate assertions and produce either a compilable scenario or a defect report.

Fourth, extend `src/mcp-server.ts` with:

- `qa_start_exploration`
- `qa_record_exploration_event`
- `qa_complete_exploration`

`qa_complete_exploration` will reject completion when candidate assertions are unverified.

Fifth, add unit tests under `tests/unit/` for path validation, schema validation, assertion classification and defect-report creation.

Sixth, add a fixture application scenario that intentionally contradicts one requirement. Verify that the system creates a defect report and refuses to generate an approved assertion.

Finally, run type checking, static audit, unit tests and repeated Playwright execution. Preserve the final reports under `artifacts/`.

## Concrete Steps

Working directory: repository root.

Install dependencies:

    npm ci

Run the current baseline:

    npm run typecheck
    npm run audit
    npm test

Expected result:

    All existing checks exit with status 0.

After implementing the exploration schema, run:

    npx playwright test tests/unit/exploration.spec.ts

Expected result:

    Tests covering valid sessions, invalid requirement paths, unverified assertions and requirement conflicts pass.

Run the complete validation:

    npm run typecheck
    npm run audit
    npx playwright test --project=chromium
    npx playwright test tests/generated --project=chromium --repeat-each=3

Expected result:

    Type checking exits with status 0.
    Static audit reports no prohibited generated-test patterns.
    The complete Chromium suite passes.
    Every generated test passes three consecutive executions.

## Validation and Acceptance

Acceptance scenario one:

Given a product requirement stored under `specs/product/`, starting an exploration session records the requirement path and content hash.

Acceptance scenario two:

Given a browser observation that agrees with an explicit requirement, completing the exploration produces a valid scenario accepted by `ScenarioSchema`.

Acceptance scenario three:

Given a browser observation that contradicts the requirement, completing the exploration produces a defect report and does not generate an approved Playwright test.

Acceptance scenario four:

Given a candidate assertion with no requirement evidence, scenario compilation fails with a message identifying the unverified assertion.

Acceptance scenario five:

Given a valid generated test, static audit passes and the test succeeds three consecutive times from isolated browser contexts.

Evidence will be stored under:

    artifacts/explorations/
    artifacts/test-results/
    artifacts/html-report/
    artifacts/results.json

## Idempotence and Recovery

Creating an exploration session must not modify application data beyond the configured test fixtures.

Session IDs must prevent accidental overwriting of previous evidence.

Re-running compilation for the same approved scenario may replace the corresponding generated test deterministically.

If browser exploration fails halfway, the partial session must remain readable and may be resumed or explicitly abandoned.

If generated-test validation fails, preserve the trace and report. Do not move the generated test into `tests/approved/`.

## Security and Data Handling

Exploration may access only the configured base URL and approved local test services.

Requirement paths must resolve inside `specs/product/`.

Evidence writers must redact cookies, authorization headers and password fields.

The MCP server must not expose arbitrary shell execution.

The browser must use an isolated profile.

Production domains are prohibited.

## Artifacts and Evidence

The final implementation must preserve:

- one successful exploration-session JSON file;
- one requirement-conflict defect report;
- one generated Playwright test;
- one repeated-execution report;
- one Playwright trace from an intentionally failing validation;
- the exact commands used for final validation.

## Interfaces and Dependencies

In `src/lib/scenario.ts`, define an exploration-session schema and exported TypeScript type.

In `src/lib/requirements.ts`, export:

    resolveRequirement(
      repositoryRoot: string,
      requirementPath: string
    ): Promise<ResolvedRequirement>

In `src/lib/exploration.ts`, export:

    createExplorationSession(
      input: CreateExplorationInput
    ): Promise<ExplorationSession>

    completeExplorationSession(
      session: ExplorationSession
    ): ExplorationCompletionResult

In `src/mcp-server.ts`, register:

    qa_start_exploration
    qa_record_exploration_event
    qa_complete_exploration

Do not add a production dependency unless the standard Node.js library and existing Zod dependency are insufficient.

## Revision Notes

- 2026-08-05: Created the initial ExecPlan to separate unverified browser observations from requirement-backed permanent tests.
```

# 5. Frontend QA skill

OpenAI and Claude skills both use a `SKILL.md` entry point with YAML frontmatter. The description is particularly important because it determines when an agent loads the skill automatically. Skills can also include scripts, references and examples without forcing all of that material into every conversation. ([OpenAI Developers][5])

Create the same file at:

```text
.agents/skills/frontend-qa/SKILL.md
.claude/skills/frontend-qa/SKILL.md
```

```md
---
name: frontend-qa
description: Explore a web frontend, diagnose browser behavior, convert approved requirements into Playwright tests, validate generated tests, or repair frontend tests. Use for browser interaction, frontend regression testing, Playwright generation, UI defect reproduction, accessibility checks and test healing. Do not use for backend-only unit tests or unapproved production interaction.
---

# Frontend QA Workflow

Read the repository root `AGENTS.md` before using this skill.

## Required Inputs

Before browser exploration, identify:

- the product requirement file under `specs/product/`;
- the application base URL;
- the seed test;
- the allowed test account or fixture;
- the requested flow;
- prohibited or destructive actions.

Do not infer expected behavior solely from the current UI.

## Plan Selection

Read `.agent/PLANS.md`.

Create an ExecPlan when the task meets the planning criteria in `AGENTS.md`.

When an active plan already covers the task, resume and update it rather than creating a second plan.

## Preparation

Run:

    npm ci
    npm run typecheck
    npx playwright test tests/seed.spec.ts --project=chromium

Stop when the seed test fails.

Classify the failure as an environment or fixture problem before exploring feature behavior.

## Exploration

Use Playwright MCP as the browser-control owner.

During exploration, record:

- every meaningful action;
- the semantic locator used;
- visible state before and after the action;
- current URL;
- console errors;
- page errors;
- failed requests;
- relevant successful requests;
- dialogs, downloads and popups;
- candidate assertions;
- the requirement passage supporting each assertion.

Use Chrome DevTools MCP only when Playwright evidence is insufficient.

Do not allow both tools to issue actions against the same page concurrently.

## Scenario Design

Each generated scenario must contain:

- a stable lowercase ID;
- a descriptive test name;
- a repository-relative requirement source;
- explicit preconditions;
- deterministic actions;
- semantic targets;
- at least one requirement-backed assertion;
- required network assertions;
- required accessibility assertions;
- evidence references.

Separate unrelated behavior into separate tests.

Do not produce one enormous end-to-end test covering an entire application.

## Assertion Review

For every candidate assertion, answer:

1. What requirement supports this expectation?
2. Can a user observe it?
3. Is there a system side effect that should also be checked?
4. Could this assertion pass while the feature is broken?
5. Does the assertion depend on unstable text, timing or data?
6. Does the current application contradict the requirement?

When the application contradicts the requirement, create a defect report.

Do not alter the requirement-backed expectation to make the test pass.

## Test Generation

Compile the approved scenario with:

    qa_compile_scenario

Generated tests must use:

- `getByRole`;
- `getByLabel`;
- `getByText`;
- `getByTestId` only when necessary;
- retrying Playwright assertions;
- isolated browser state.

Generated tests must not use:

- `waitForTimeout()`;
- XPath;
- raw CSS selectors;
- `nth()`;
- `test.skip()`;
- `test.fixme()`;
- tautologies;
- generic truthiness;
- unexplained snapshots.

## Validation

Run:

    qa_audit_generated_tests

Use:

    target: the generated test path
    repeatEach: 3
    project: chromium
    execute: true

When the flow is responsive or mobile-sensitive, also run:

    project: mobile-chrome

Preserve traces and failure reports.

## Repair

Classify a failure before editing the test:

- application defect;
- requirement ambiguity;
- fixture failure;
- environment failure;
- locator drift;
- synchronization failure;
- invalid generated assertion;
- genuine requirement change.

Repair only test-owned defects.

Never delete or weaken an assertion to achieve a passing result.

After a repair, rerun static audit and repeated execution.

## Completion

Before reporting completion:

- update the active ExecPlan;
- ensure the scenario is stored;
- ensure generated test audit passes;
- ensure repeated execution passes;
- preserve evidence paths;
- report requirement conflicts separately;
- list any unverified behavior;
- state which assertions were changed during healing;
- move a completed ExecPlan into `.agent/plans/completed/`.
```

# 6. Requirement documents

Playwright's planner works best when it receives a clear request, a seed test and optionally a PRD. It then produces a human-readable Markdown plan precise enough for test generation. ([Playwright][6])

Your product requirement documents should contain behavior, not implementation guesses.

Use this structure:

```md
# Guest Checkout Requirements

## User

An unauthenticated customer purchasing an in-stock physical product.

## Preconditions

The product is in stock.

The shopping cart contains one product with quantity one.

No user is signed in.

The test address is accepted by the configured test shipping provider.

## Required Behavior

The customer can proceed from the cart to checkout without creating an account.

The checkout displays the product name, quantity, unit price, subtotal, shipping charge and final total before payment submission.

Submitting without accepting the terms displays an inline validation message.

When terms are not accepted, no order-creation request is sent.

An invalid postcode displays a validation message associated with the postcode input.

A valid completed checkout sends exactly one order-creation request.

A successful order displays a confirmation identifier returned by the order API.

## Prohibited Behavior

The application must not create an account automatically.

The application must not submit payment before the customer activates the final confirmation control.

The application must not create more than one order from one final confirmation action.

The application must not expose authorization headers, payment data or session cookies in browser-visible errors.

## Acceptance Evidence

The generated Playwright tests must check the visible validation states.

The generated Playwright tests must check whether the order-creation request was present or absent as required.

The successful-flow test must verify that the displayed confirmation identifier matches the API response.

The tests must pass three consecutive isolated Chromium executions.
```

That is far better than:

```md
Test checkout and make sure everything works.
```

The second prompt is lazy garbage. The agent has no usable oracle and will either test trivial things or encode the current bugs as expected behavior.

# The final division of responsibility

Keep this boundary rigid:

| Artifact                   | Responsibility                            |
| -------------------------- | ----------------------------------------- |
| `AGENTS.md`                | Permanent repository rules                |
| `CLAUDE.md`                | Thin Claude-specific adapter              |
| `.agent/PLANS.md`          | Definition of a valid long-running plan   |
| `.agent/plans/active/*.md` | Current state of one complex task         |
| `specs/product/*.md`       | What the product must do                  |
| `SKILL.md`                 | Repeatable procedure for a class of tasks |
| MCP tools                  | Capabilities and structured operations    |
| Scripts and CI             | Enforcement                               |
| `artifacts/`               | Evidence                                  |
| Generated tests            | Executable regression protection          |

The most important distinction is this:

> **Markdown guides tell the agent what good work looks like. Scripts, schemas, permissions and CI prevent bad work.**

Claude's own documentation explicitly warns that `CLAUDE.md` is context, not enforced configuration. Instructions cannot safely block destructive operations by themselves. Put hard restrictions into MCP schemas, browser isolation, command allowlists, hooks and CI. ([Claude Platform Docs][4])

[1]: https://developers.openai.com/codex/agent-configuration/agents-md "Custom instructions with AGENTS.md | ChatGPT Learn"
[2]: https://developers.openai.com/cookbook/articles/codex_exec_plans "Using PLANS.md for multi-hour problem solving"
[3]: https://docs.github.com/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot "Adding repository custom instructions for GitHub Copilot - GitHub Docs"
[4]: https://docs.anthropic.com/en/docs/claude-code/memory "How Claude remembers your project - Claude Code Docs"
[5]: https://developers.openai.com/codex/build-skills "Build skills | ChatGPT Learn"
[6]: https://playwright.dev/docs/test-agents "Agents | Playwright"
