# Setup Guide

Every command here was executed during the first bring-up of this engine on
Windows with Node 24. Where something failed, the failure and its cause are
recorded rather than quietly corrected, because the failures are the parts worth
knowing.

Read this whole document before running anything. It is written to be followed
by a person or by an agent with a shell.

---

## Part 0 — Prerequisites

| Requirement | Why |
| --- | --- |
| Node.js 20 or newer | Playwright MCP requires it. Verified on 24.16.0. |
| npm | Verified on 11.13.0. |
| A running target application | The harness tests a live app; it cannot test source code. |

```bash
node --version
npm --version
```

---

## Part 1 — Set up the engine (this repository)

```bash
npm ci
npx playwright install --with-deps chromium
npm run typecheck
```

Expected: `typecheck` prints nothing and exits 0.

### Verify the pipeline before touching your own application

Prove the machinery works against the public TodoMVC demo first. If this fails,
the problem is the engine, not your app — and you want to know that now.

```bash
npm run compile -- specs/scenarios/todo-create.json
npm run audit
```

Expected: a path is printed, then `3 passed`, then
`{"status": "accepted", "repeatEach": 3, ...}`.

### Verify the auditor actually rejects bad tests

A guardrail that cannot fail is decoration. Prove it bites:

```bash
cat > tests/generated/__probe.spec.ts <<'EOF'
import { test, expect } from '../fixtures.js';

test('probe', async ({ page }) => {
  await page.goto('./');
  await page.waitForTimeout(1000);
  await page.locator('div:nth-child(3) > button').click();
  expect(true).toBe(true);
});
EOF

npx tsx src/cli-audit.ts tests/generated/__probe.spec.ts
rm tests/generated/__probe.spec.ts
```

Expected: exit code 1 and four issues —
`requires-requirement-source`, `no-fixed-sleep`, `no-raw-css-locator`,
`no-trivial-assertion`.

### Verify the MCP server starts

```bash
npm run mcp
```

It speaks JSON-RPC on stdin/stdout, so it will look like it is hanging. That is
correct. Press Ctrl+C. A real handshake returns three tools:
`qa_compile_scenario`, `qa_audit_generated_tests`, `qa_run_playwright_tests`.

---

## Part 2 — Bootstrap a target application

```bash
npx tsx src/cli-init.ts --target /absolute/path/to/your-app
```

This writes into the **target** repository:

```
agent-qa.config.json          detected config - review it, detection is a guess
.mcp.json                     pinned MCP servers for the coding client
playwright.qa.config.ts       separate from any existing playwright.config
tests/e2e/fixtures.ts         browser evidence capture
tests/e2e/seed.spec.ts        environment verification
specs/qa/requirements/        what the product must do
specs/qa/scenarios/           reviewable test definitions
specs/qa/defects/             conflicts between behaviour and requirement
tests/e2e/{generated,approved}/
.qa/sessions/                 exploration evidence
.gitignore                    updated with auth state, sessions, artifacts
```

`init` never overwrites an existing file. Re-running it is safe.

**Review `agent-qa.config.json` immediately.** Framework detection is
best-effort. It reads the dev script and dependencies to guess the port —
vite 5173, next 3000, angular 4200 — and honours an explicit `--port` flag. It
is right often enough to be useful and wrong often enough that you must check.

### Install Playwright in the target

The target runs its own tests with the plain Playwright runner, so it needs its
own dependency. Pin the version.

```bash
cd /path/to/your-app
npm install --save-dev @playwright/test@1.62.1
npx playwright install chromium
```

### Verify the environment before writing any test

```bash
npx playwright test --config=playwright.qa.config.ts tests/e2e/seed.spec.ts --project=chromium
```

**Stop here if this fails.** A failing seed means the application, fixtures or
configuration are wrong. Exploring past it produces scenarios built on a broken
environment.

Pass `SEED_HEADING="<an accessible heading name>"` to assert something specific
about the landing page.

---

## Part 3 — Connect the MCP servers

The agent cannot install MCP servers mid-thought. The sequence is:

1. `.mcp.json` exists in the target repository (written by `init`).
2. The coding client reads it when the project opens.
3. The client launches the server processes.
4. **A human approves the project's servers once.** This is deliberate
   security, not friction to route around.
5. The agent can then call the tools.

`npx -y` fetches a package into the npm cache on first launch, which is the
closest thing to automatic installation that exists.

In Claude Code:

```bash
claude mcp list
claude
```

then `/mcp` inside the session. A running session may need restarting after
`.mcp.json` changes — a tool that did not exist when the session started cannot
appear halfway through a response.

Versions are **pinned**, not `@latest`. An unattended upgrade of the
browser-control layer must not be able to break a product's QA overnight.
Verified current at the time of writing: `@playwright/mcp@0.0.78`,
`chrome-devtools-mcp@1.6.0`, `@playwright/test@1.62.1`.

### Isolated versus extension mode

Default is `--isolated`: a clean profile, no cookies, CI-compatible, safely
separated from personal sessions.

`--extension` connects to real browser tabs through the official Playwright
extension. Use it for SSO, 2FA and already-authenticated sessions. A human
installs the extension once; a repository must never silently install a powerful
extension into someone's personal profile.

Extension mode is a **discovery bridge**, not the permanent runner:

```
Human installs extension once
  -> agent connects with --extension
  -> agent reproduces and records the flow
  -> agent converts it into isolated Playwright tests
  -> future runs need no extension
```

---

## Part 4 — Produce a test

The full loop, in order. Do not skip step 1.

**1. Write the requirement.** In `specs/qa/requirements/<feature>.md`, state the
required behaviour and, critically, **where it comes from**. A route table, an
API schema and an approved acceptance criterion are all valid sources. The
current appearance of the screen is not.

Mark anything you cannot source as `UNVERIFIED - do not assert`.

**2. Explore.** Drive the app with Playwright MCP. Read the accessibility
snapshot, not pixels. Record actions, semantic locators, URLs, console errors,
page errors and network activity.

**3. Author a scenario** in `specs/qa/scenarios/<id>.json`, naming its
`requirementSource`.

**4. Compile** with `qa_compile_scenario`, or:

```bash
npx tsx /path/to/Auto-QA/src/cli-compile.ts specs/qa/scenarios/<id>.json
```

**5. Audit and run repeatedly** with `qa_audit_generated_tests`
(`repeatEach: 3`), or `npm run audit`.

**6. Mutation-check.** This is the step everyone skips and the one that decides
whether the suite is worth anything. Break the behaviour the test claims to
protect, confirm the test fails, restore it, confirm it passes:

```bash
# change the app - e.g. rename a nav label
npx playwright test --config=playwright.qa.config.ts <the test> --project=chromium   # expect FAIL
# revert the change
npx playwright test --config=playwright.qa.config.ts <the test> --project=chromium   # expect PASS
git status --short                                                                   # expect clean
```

A test that passes both before and after is testing nothing.

**7. Promote** to `tests/e2e/approved/` only after all of the above.

---

## Part 5 — Running without the AI

Once the file exists, no model, MCP server or extension is involved:

```bash
npx playwright test --config=playwright.qa.config.ts --project=chromium
```

The agent is the explorer and author. Playwright is the permanent executor.
That is what makes the result durable and auditable.

For runs that must not reach external services, record API traffic to a HAR
during exploration and replay it with `page.routeFromHAR`. Record your own API
routes only — capturing every font, analytics call and third-party widget
produces a huge brittle archive.

---

## Failures encountered during first bring-up

These are real, and each cost time.

**Seed test 404 against a base URL with a path.** `page.goto('/')` against
`https://demo.playwright.dev/todomvc` resolves to the origin root, dropping
`/todomvc`. Relative paths (`./`) resolve against the full base URL. The
generated config and seed use `./` for this reason, and the demo base URL
carries a trailing slash.

**`spawnSync npx.cmd EINVAL` on Windows.** Node refuses to spawn `.cmd` shims
without `shell: true`. Enabling a shell would pass a caller-supplied path
through command parsing — an injection route the MCP tool must not have. The
auditor spawns the Playwright CLI with `process.execPath` and
`require.resolve('@playwright/test/cli')` instead.

**`require` is not defined in ESM.** The package is `type: module`; the fix is
`createRequire(import.meta.url)`.

**Dev server unreachable on `127.0.0.1`.** Vite binds IPv6 loopback. `localhost`
resolves to both, so `init` emits `http://localhost:<port>/`.

**Strict-mode violation from duplicated link text.** `getByRole('link', {name:
'Models'})` matched a header and a footer link. The tempting fixes — `.first()`
or `.nth(0)` — reduce the assertion to "one of these exists somewhere". The
schema gained landmark scoping (`within`) instead, so the assertion says which
navigation it means.

**Target repo missing `@playwright/test`.** `npx` silently pulled a temporary
copy, which then could not resolve the config's imports. Install it as a real
dev dependency in the target.
