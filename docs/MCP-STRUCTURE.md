Yes. Your correction is right:

> **The QA engine is one reusable codebase. Every application being tested keeps its own requirements, recorded sessions, generated tests, screenshots, baselines and reports.**

Do not dump every client's tests into the engine repository. That would become an unmanageable sewer.

The agent should normally open the **target application repository**. That repository tells the agent how to launch your external QA engine.

# Correct architecture

```text
agent-qa-engine/
├── packages/
│   ├── cli/
│   ├── mcp-server/
│   ├── recorder/
│   ├── test-compiler/
│   ├── validator/
│   ├── healer/
│   └── browser-extension/
│
├── templates/
│   ├── AGENTS.md
│   ├── PLANS.md
│   ├── playwright.config.ts
│   └── target-config.json
│
└── dist/
    ├── cli.mjs
    └── mcp-server.mjs
```

Each target application gets:

```text
customer-application/
├── .mcp.json
├── .codex/
│   └── config.toml
├── AGENTS.md
├── agent-qa.config.json
│
├── specs/
│   └── qa/
│       ├── requirements/
│       ├── scenarios/
│       └── defects/
│
├── tests/
│   └── e2e/
│       ├── generated/
│       ├── approved/
│       ├── fixtures/
│       ├── snapshots/
│       └── auth/
│
├── .qa/
│   └── sessions/
│       └── <session-id>/
│           ├── events.jsonl
│           ├── scenario.json
│           ├── screenshots/
│           ├── trace.zip
│           ├── network.har.zip
│           └── result.json
│
└── artifacts/
    ├── playwright-report/
    ├── test-results/
    └── videos/
```

The engine contains the machinery.

The target repository contains the truth about that product.

# 1. How the agent installs the engine and MCPs

There are two separate installation stages.

## Stage A: bootstrap the target repository

Your engine should expose two executable commands:

```json
{
  "name": "agent-qa-engine",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "agent-qa": "./dist/cli.mjs",
    "agent-qa-mcp": "./dist/mcp-server.mjs"
  }
}
```

During local engine development:

```bash
export AGENT_QA_ENGINE_ROOT=/absolute/path/to/agent-qa-engine

npm install --save-dev \
  "$AGENT_QA_ENGINE_ROOT" \
  @playwright/test@1.62.1

npx playwright install chromium

npx --no-install agent-qa init --target .
```

The `agent-qa init` command should create:

```text
.mcp.json
.codex/config.toml
agent-qa.config.json
AGENTS.md
specs/qa/
tests/e2e/
.qa/sessions/
artifacts/
```

Later, when you publish the engine to a private npm registry, replace the local path installation with your published package.

Do not use `latest` for your own engine in corporate projects. Pin a tested version.

## Stage B: the MCP client starts the configured servers

An MCP does not normally "install itself while the agent is thinking."

Instead:

1. The repository contains MCP configuration.
2. The coding client reads that configuration when the project opens.
3. The client launches the MCP process.
4. The human approves the project and MCP server when required.
5. The agent can then call its tools.

For npm-hosted MCP servers, `npx -y` downloads the requested package into npm's cache when it is not installed locally, adds it to the process path and launches it. The `-y` suppresses npm's installation prompt. ([npm Docs][1])

That is the closest thing to automatic MCP installation.

# 2. Claude Code project MCP configuration

Put this in the **target repository**, not the engine:

```json
{
  "mcpServers": {
    "agent-qa": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "--no-install",
        "agent-qa-mcp",
        "--target",
        "."
      ]
    },
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@playwright/mcp@0.0.78",
        "--isolated",
        "--caps=testing,storage,network,devtools,vision"
      ]
    },
    "chrome-devtools": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@1.6.0",
        "--isolated"
      ]
    }
  }
}
```

As of August 5, 2026, npm lists Playwright MCP `0.0.78` and Chrome DevTools MCP `1.6.0`. Pinning avoids waking up one morning to discover that an automatic update broke your entire QA harness. ([npm][2])

Claude Code supports project-scoped MCP configuration in `.mcp.json`, which is meant to be checked into the repository. It prompts the user before approving project-provided MCP servers. That approval is intentional security, not an inconvenience you should bypass. ([Claude Platform Docs][3])

After the configuration is created:

```bash
claude mcp list
claude
```

Inside Claude Code:

```text
/mcp
```

The user approves the project servers once.

A running Claude session may need to be restarted after `.mcp.json` changes.

# 3. Codex project MCP configuration

Put this in:

```text
.codex/config.toml
```

```toml
[mcp_servers.agent_qa]
command = "npx"
args = [
  "--no-install",
  "agent-qa-mcp",
  "--target",
  ".",
]
startup_timeout_sec = 30
tool_timeout_sec = 600
required = true

[mcp_servers.playwright]
command = "npx"
args = [
  "-y",
  "@playwright/mcp@0.0.78",
  "--isolated",
  "--caps=testing,storage,network,devtools,vision",
]
startup_timeout_sec = 60
tool_timeout_sec = 600
required = true

[mcp_servers.chrome_devtools]
command = "npx"
args = [
  "-y",
  "chrome-devtools-mcp@1.6.0",
  "--isolated",
]
startup_timeout_sec = 60
tool_timeout_sec = 600
```

Codex supports project-scoped `.codex/config.toml`, but project configuration is loaded only for trusted projects. Its desktop app, CLI and IDE extension share the same MCP configuration. ([OpenAI Developers][4])

Again, the agent can write this configuration, but the coding client must reload it. A tool that does not exist in the current session cannot suddenly appear halfway through one response.

# 4. What `agent-qa init` should do

The engine's initialization command should perform deterministic repository changes.

```text
agent-qa init
    ↓
Detect package manager
    ↓
Detect frontend framework
    ↓
Detect start/build/test commands
    ↓
Create target QA directories
    ↓
Create MCP client configurations
    ↓
Create Playwright configuration
    ↓
Create seed test
    ↓
Create AGENTS.md rules
    ↓
Create agent-qa.config.json
    ↓
Update .gitignore
    ↓
Validate browser installation
```

Example target configuration:

```json
{
  "version": 1,
  "application": {
    "baseURL": "http://127.0.0.1:3000",
    "startCommand": "npm run dev",
    "healthURL": "http://127.0.0.1:3000",
    "startupTimeoutMs": 120000
  },
  "testing": {
    "testDirectory": "tests/e2e",
    "generatedDirectory": "tests/e2e/generated",
    "approvedDirectory": "tests/e2e/approved",
    "requirementsDirectory": "specs/qa/requirements",
    "defectsDirectory": "specs/qa/defects"
  },
  "capture": {
    "sessionDirectory": ".qa/sessions",
    "screenshots": true,
    "trace": true,
    "video": false,
    "network": true,
    "console": true
  },
  "browser": {
    "default": "chromium",
    "isolated": true,
    "visionFallback": true
  },
  "validation": {
    "repeatEach": 3,
    "rejectFixedTimeouts": true,
    "rejectXPath": true,
    "rejectRawCssSelectors": true,
    "requireRequirementSource": true
  }
}
```

Obviously, the initializer must detect and write the actual start command and port. It should not blindly assume every application uses port 3000.

# 5. Browser extension usage

There are two browser modes.

## Isolated browser mode

This should be the default:

```json
{
  "command": "npx",
  "args": [
    "-y",
    "@playwright/mcp@0.0.78",
    "--isolated"
  ]
}
```

Use it for:

* Repeatable test exploration
* Clean cookies and local storage
* Test accounts
* CI-compatible behaviour
* Controlled permissions
* Safe separation from personal sessions

## Browser extension mode

Playwright has an official Chrome and Edge extension that connects the MCP server to existing browser tabs. It reuses the current browser's cookies, logged-in sessions and installed extensions. The official setup is to install the extension and start Playwright MCP with `--extension`. ([Playwright][5])

Configuration:

```json
{
  "mcpServers": {
    "playwright-session": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@playwright/mcp@0.0.78",
        "--extension",
        "--caps=testing,storage,network,devtools,vision"
      ]
    }
  }
}
```

Extension mode is appropriate for:

* SSO
* 2FA
* Existing authenticated tabs
* Applications depending on another browser extension
* Reproducing an issue already open in the browser

It is not the right default for permanent test execution.

Chrome extensions generally require a person or an enterprise browser policy to install them. Your repository should not silently install a powerful browser extension into someone's personal profile.

Use this workflow:

```text
Human installs Playwright Extension once
        ↓
Agent connects through --extension
        ↓
Agent reproduces and records the flow
        ↓
Agent converts it into isolated Playwright tests
        ↓
Future tests run without the extension
```

The extension is a **discovery and authenticated-session bridge**. It should not become a permanent dependency for ordinary regression tests.

# 6. How the agent captures what it did

The MCP browser refs are temporary.

For example:

```text
button "Place order" [ref=e42]
```

`e42` is useful only for the current page snapshot. After navigation or a DOM update, refs may change. Playwright explicitly describes refs as snapshot-scoped. ([Playwright][6])

Therefore, do not save this:

```json
{
  "action": "click",
  "ref": "e42"
}
```

Save this:

```json
{
  "sequence": 17,
  "type": "action",
  "action": "click",
  "target": {
    "strategy": "role",
    "role": "button",
    "name": "Place order",
    "exact": true
  },
  "observedRef": "e42",
  "before": {
    "url": "http://127.0.0.1:3000/checkout"
  },
  "after": {
    "url": "http://127.0.0.1:3000/checkout"
  },
  "evidence": {
    "screenshot": "screenshots/0017-before-place-order.png"
  }
}
```

The persistent locator is:

```ts
page.getByRole('button', {
  name: 'Place order',
  exact: true,
});
```

The session event log should record four kinds of information.

## Actions

```json
{
  "type": "action",
  "action": "fill",
  "target": {
    "strategy": "label",
    "label": "Postcode"
  },
  "value": "SW1A 1AA"
}
```

## Observations

```json
{
  "type": "observation",
  "kind": "visible-text",
  "value": "Accept the terms to continue"
}
```

## Side effects

```json
{
  "type": "network",
  "method": "POST",
  "url": "/api/orders",
  "occurred": false
}
```

## Candidate assertions

```json
{
  "type": "candidate-assertion",
  "assertion": {
    "kind": "visible",
    "target": {
      "strategy": "role",
      "role": "alert",
      "name": "Accept the terms to continue"
    }
  },
  "oracle": {
    "source": "specs/qa/requirements/guest-checkout.md",
    "section": "Submitting without accepting terms",
    "verified": true
  }
}
```

This is the actual learning mechanism.

It is not model training.

The agent is creating a structured, durable record of:

* What it did
* What element it targeted
* What happened
* What should have happened
* Where that expectation came from

# 7. How it turns the captured session into permanent tests

The pipeline should be:

```text
Exploration session
      ↓
events.jsonl
      ↓
Candidate scenario
      ↓
Requirement validation
      ↓
Playwright compiler
      ↓
Generated TypeScript test
      ↓
Clean rerun without MCP
      ↓
Static audit
      ↓
Repeated execution
      ↓
Approved test
```

Example generated test:

```ts
import {
  test,
  expect,
} from '@playwright/test';

test(
  'checkout is blocked until terms are accepted',
  async ({ page }) => {
    const orderRequests: string[] = [];

    page.on('request', request => {
      if (
        request.method() === 'POST' &&
        request.url().includes('/api/orders')
      ) {
        orderRequests.push(request.url());
      }
    });

    await page.goto('/checkout');

    await page
      .getByLabel('Postcode')
      .fill('SW1A 1AA');

    await page
      .getByRole('button', {
        name: 'Place order',
      })
      .click();

    await expect(
      page.getByRole('alert'),
    ).toContainText(
      'Accept the terms to continue',
    );

    expect(orderRequests).toHaveLength(0);
  },
);
```

After that file exists, the AI is no longer needed to execute it:

```bash
npx playwright test \
  tests/e2e/generated/checkout-terms.spec.ts \
  --project=chromium
```

That is the crucial distinction:

> The agent creates ordinary Playwright code. Future execution uses the Playwright test runner, not the LLM, MCP or browser extension.

Playwright's recorder already demonstrates the basic mechanism: interactions are recorded and converted into test code with role, text and test-ID locators. Your engine adds structured requirements, side-effect assertions, validation and promotion around it. ([Playwright][7])

# 8. What "offline tests" means

There are two meanings.

## Offline from the AI

This is straightforward.

Once the test is written, it runs without:

* Claude
* Codex
* MCP
* A vision model
* Your browser extension

Only the app, Playwright and the test fixtures are needed.

## Offline from external services

This requires network recording or mocks.

During exploration, record relevant API traffic into a HAR archive:

```text
tests/e2e/fixtures/checkout-api.har.zip
```

Then use it in the permanent test:

```ts
import {
  test,
  expect,
} from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.routeFromHAR(
    'tests/e2e/fixtures/checkout-api.har.zip',
    {
      url: '**/api/**',
      notFound: 'abort',
    },
  );
});

test(
  'checkout displays shipping options',
  async ({ page }) => {
    await page.goto('/checkout');

    await expect(
      page.getByRole('heading', {
        name: 'Shipping',
      }),
    ).toBeVisible();
  },
);
```

Playwright supports recording and replaying HAR files. The HAR can be committed alongside the test so API calls are replayed instead of reaching external services. ([Playwright][8])

Be selective. Recording every script, font, analytics call and third-party widget produces a massive brittle archive. Usually record your application's API routes only.

# 9. Authentication after discovery

Extension mode may help the agent discover an authenticated flow, but permanent tests should normally use dedicated test authentication state.

Playwright can save cookies and local storage into a storage-state file and load it into later browser contexts. It warns that these files may contain credentials capable of impersonating the account, so they should be gitignored. ([Playwright][9])

Recommended structure:

```text
playwright/.auth/
├── admin.json
├── standard-user.json
└── guest.json
```

`.gitignore`:

```gitignore
playwright/.auth/
.qa/sessions/*/raw-secrets.json
artifacts/
```

The auth setup should execute locally or in CI from test credentials:

```ts
import {
  test as setup,
  expect,
} from '@playwright/test';

import path from 'node:path';

const authFile = path.join(
  process.cwd(),
  'playwright/.auth/standard-user.json',
);

setup(
  'authenticate standard user',
  async ({ page }) => {
    await page.goto('/login');

    await page
      .getByLabel('Email')
      .fill(process.env.E2E_USER_EMAIL!);

    await page
      .getByLabel('Password')
      .fill(process.env.E2E_USER_PASSWORD!);

    await page
      .getByRole('button', {
        name: 'Sign in',
      })
      .click();

    await expect(page).toHaveURL('/dashboard');

    await page.context().storageState({
      path: authFile,
    });
  },
);
```

# 10. Does the agent have vision?

There are three different things people confuse.

## Accessibility understanding

By default, Playwright MCP returns a structured accessibility tree:

```text
- heading "Checkout" [level=1]
- textbox "Postcode" [ref=e14]
- checkbox "Accept terms" [ref=e18]
- button "Place order" [ref=e22]
```

The model reads this as text and interacts using refs.

No vision model is required. This is usually more accurate than guessing coordinates from pixels. ([Playwright][10])

## Screenshot understanding

Playwright MCP can capture page, element or full-page screenshots. The screenshot is returned to the MCP client as an image. A vision-capable model can inspect layout, colours, clipping, overlays, icons, charts and rendered images. ([Playwright][11])

Enable vision support:

```json
{
  "command": "npx",
  "args": [
    "-y",
    "@playwright/mcp@0.0.78",
    "--caps=vision,testing,network,devtools"
  ]
}
```

Vision mode adds coordinate actions such as:

```text
browser_mouse_move_xy
browser_mouse_click_xy
browser_mouse_drag_xy
browser_mouse_down
browser_mouse_up
browser_mouse_wheel
```

This is intended for canvas, WebGL, maps, charts, image editors and controls missing accessible names. ([Playwright][12])

The typical flow is:

```text
browser_snapshot
    ↓
No accessible target found
    ↓
browser_take_screenshot
    ↓
Vision model locates icon or canvas region
    ↓
browser_mouse_click_xy
    ↓
browser_snapshot
    ↓
Verify resulting accessible state
```

Do not use pixel coordinates for normal buttons. That is brittle and stupid when the button already has a role and name.

## Automated visual regression

Future test runs do not need an AI to "look" at the screenshot.

The test runner compares the current image against a stored baseline:

```ts
await expect(page).toHaveScreenshot(
  'checkout-page.png',
  {
    fullPage: true,
    animations: 'disabled',
  },
);
```

Playwright waits for consecutive stable screenshots and compares the result against the stored expected image. ([Playwright][13])

Baseline images live in the target repository:

```text
tests/e2e/visual/checkout.spec.ts
tests/e2e/visual/checkout.spec.ts-snapshots/
└── checkout-page-chromium-linux.png
```

Run these in a consistent Docker or CI environment. Screenshot comparisons generated on macOS and executed on Linux frequently differ because fonts, rendering and browser versions differ. Playwright recommends consistent environments for visual regression testing. ([Playwright][14])

# 11. How it records visual evidence

During exploration, the engine should request:

```text
browser_start_tracing
browser_take_screenshot
browser_stop_tracing
```

Playwright traces can contain:

* Actions
* DOM snapshots before and after actions
* Screenshots
* Network requests
* Console messages
* Timings

They can later be opened with:

```bash
npx playwright show-trace \
  .qa/sessions/<session-id>/trace.zip
```

([Playwright][15])

The trace is evidence and debugging material.

It should not be the only source used to generate a test. The structured event log is much easier to validate and compile.

# 12. The browser extension you might build

Your own extension is only justified when it adds product-specific information that Playwright cannot obtain cleanly.

Useful extension capabilities:

```text
Expose React/Vue component identity
Expose route IDs
Expose active feature flags
Expose current test-user ID
Expose application event-bus events
Mark sensitive fields for redaction
Let a human mark an assertion
Let a human hand the current tab to the agent
```

Example extension-to-page metadata:

```json
{
  "route": "checkout.payment",
  "component": "CheckoutPaymentPanel",
  "featureFlags": {
    "newCheckout": true
  },
  "testContext": {
    "userId": "e2e-user-18",
    "cartFixture": "single-in-stock-item"
  }
}
```

Do not make your extension responsible for:

* Running all clicks
* Generating Playwright code
* Storing tests
* Running CI
* Deciding whether behaviour is correct

Those jobs belong to the engine and target repository.

# 13. The exact end-to-end lifecycle

```text
1. Agent opens target repository
2. Agent reads AGENTS.md and agent-qa.config.json
3. Client starts target repository MCP configurations
4. Human approves project MCPs once
5. Agent starts local application
6. Agent starts isolated Playwright browser
7. Agent reads requirement document
8. Agent starts a QA capture session
9. Agent explores through accessibility snapshots
10. Agent uses screenshots only where visual context is needed
11. Agent records actions, locators, network and evidence
12. Agent creates a requirement-backed scenario
13. Engine compiles scenario into Playwright TypeScript
14. Engine closes the exploratory browser
15. Engine starts a clean browser context
16. Generated test runs without exploratory session state
17. Static auditor rejects weak or brittle code
18. Test runs three or more times
19. Visual tests compare stored screenshots
20. Valid tests move into tests/e2e/approved
21. CI runs approved tests with no LLM or MCP
```

The main conceptual correction is:

> **The agent does not "remember" the test inside the model. It externalises the test into files inside the target repository.**

That is what makes the result durable, auditable and runnable without the AI.

The AI is the explorer and author.

Playwright is the permanent executor.

[1]: https://docs.npmjs.com/cli/commands/npx/?utm_source=chatgpt.com "npx | npm Docs"
[2]: https://www.npmjs.com/package/%40playwright/mcp?utm_source=chatgpt.com "playwright/mcp"
[3]: https://docs.anthropic.com/en/docs/claude-code/mcp "Connect Claude Code to tools via MCP - Claude Code Docs"
[4]: https://developers.openai.com/codex/mcp "Model Context Protocol | ChatGPT Learn"
[5]: https://playwright.dev/mcp/configuration/browser-extension "Connecting to Browsers | Playwright"
[6]: https://playwright.dev/mcp/snapshots?utm_source=chatgpt.com "Snapshots | Playwright"
[7]: https://playwright.dev/docs/codegen "Test generator | Playwright"
[8]: https://playwright.dev/docs/mock?utm_source=chatgpt.com "Mock APIs | Playwright"
[9]: https://playwright.dev/docs/auth?utm_source=chatgpt.com "Authentication | Playwright"
[10]: https://playwright.dev/docs/getting-started-mcp "Playwright MCP | Playwright"
[11]: https://playwright.dev/mcp/tools/screenshots?utm_source=chatgpt.com "Screenshots | Playwright"
[12]: https://playwright.dev/mcp/vision-mode?utm_source=chatgpt.com "Vision Mode | Playwright"
[13]: https://playwright.dev/docs/api/class-pageassertions "PageAssertions | Playwright"
[14]: https://playwright.dev/docs/ci?utm_source=chatgpt.com "Continuous Integration | Playwright"
[15]: https://playwright.dev/mcp/tools/tracing?utm_source=chatgpt.com "Tracing | Playwright"
