# Troubleshooting

Failures actually encountered, with causes. Symptom first, because that is what
you have when you arrive here.

---

## The application

### Seed test fails with a 404 on a base URL that has a path

`page.goto('/')` resolves against the **origin**, not the base URL's path.
`'/'` + `https://example.com/app` gives `https://example.com/`, silently
dropping `/app`.

Use a relative path. `'./'` resolves against the full base URL. The generated
seed test and config both use `./`, and any base URL with a path should carry a
trailing slash so the last segment is not treated as a filename.

### Dev server is running but the harness cannot connect

Check which loopback address it bound:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5173/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
```

Vite and several other dev servers bind IPv6 loopback only, so `127.0.0.1`
refuses the connection while `localhost` works. `init` emits `localhost` for
this reason.

### Playwright cannot start the application

`webServer.command` comes from `startCommand` in `agent-qa.config.json`,
detected from your `dev` or `start` script. If detection guessed wrong, edit the
config — it is a guess, not a contract. Override per run with
`WEB_SERVER_COMMAND` and `BASE_URL`.

`reuseExistingServer` is on outside CI, so an already-running dev server is used
rather than a second one being started on a taken port.

---

## The runner

### `ERR_MODULE_NOT_FOUND` for `@playwright/test` in the target repository

`npx playwright test` pulled a temporary copy of Playwright that cannot resolve
your config's imports. The target needs its own pinned dependency:

```bash
npm install --save-dev @playwright/test@1.62.1
npx playwright install chromium
```

### `spawnSync npx.cmd EINVAL` on Windows

Node refuses to spawn `.cmd` shims without `shell: true`.

Do **not** fix this by enabling a shell. The spawn target is caller-supplied,
and a shell would put it through command parsing — an injection route an MCP
tool must not have. The auditor spawns the Playwright CLI directly with
`process.execPath` and `require.resolve('@playwright/test/cli')`.

### `require is not defined`

The package is `type: module`. Use `createRequire(import.meta.url)`.

---

## Locators

### `strict mode violation: resolved to 2 elements`

The same accessible name exists more than once — almost always a link repeated
in a header and a footer.

**Do not use `.first()` or `.nth(0)`.** They turn the assertion into "one of
these exists somewhere", which is exactly the weakening the harness exists to
prevent, and the auditor rejects `nth()` outright.

Scope to the landmark instead:

```json
{
  "by": "role", "role": "link", "name": "Pricing",
  "within": { "role": "navigation", "name": "Primary" }
}
```

Available `within` roles include `banner`, `navigation`, `main`, `contentinfo`,
`region` and `form`, optionally with an accessible name.

### An element has no accessible name

First check whether the application is at fault — a control with no accessible
name is usually an accessibility defect worth reporting, not a locator puzzle.

If a test ID is genuinely required, add it to that one control and say so in the
report.

---

## The auditor

### `requires-requirement-source`

The generated file has no `// Generated from requirement:` header, meaning it
did not come from the compiler. Author a scenario with a `requirementSource` and
compile it. Do not hand-write files into `tests/e2e/generated/` — they are build
artifacts.

### `no-raw-css-locator` / `no-xpath-selector` / `no-nth-selector`

Something bypassed the scenario schema, which cannot express these. Fix the
scenario, not the generated output.

### `no-fixed-sleep`

Wait on observable state — visibility, enabled state, a URL change, a response,
a field value, a spinner disappearing — never a duration.

### `requires-assertion`

A browser action without an assertion is not a test.

---

## Results that look wrong

### The test passes but the feature is broken

The assertion is not actually checking the behaviour. Run the mutation check:
break the behaviour, confirm the test fails. If it stays green, rewrite the
assertion. This is the single most valuable check in the workflow.

### Values read as zero, empty or placeholder

Content that animates on scroll, lazy-loads or counts up is not settled at first
paint. A landing page in the first bring-up read `0+ Providers / 0.0% Uptime` on
load and `20+ / 99.9%` after scrolling.

Assert neither without a source. The initial value is a transient; the settled
value is often unreviewed marketing copy. Record it in `specs/qa/defects/` and
ask a human.

Worth checking separately: if the settled value only appears after a
scroll-triggered animation, a screen-reader user who never triggers the
intersection observer hears the placeholder. That is an accessibility defect in
its own right.

### The test is flaky across repeated runs

`repeatEach: 3` exists to surface exactly this. Usual causes: state leaking
between runs from a shared account or seeded record, an assertion racing an
animation, or a real application race. Do not "fix" it with a longer timeout —
that hides the third case, which is a genuine defect.

---

## MCP

### The agent says a QA tool does not exist

MCP servers are launched by the coding client when the project opens, not by the
agent at runtime. Confirm `.mcp.json` exists in the **target** repository,
approve the project's servers (`/mcp` in Claude Code), and restart the session —
a tool that did not exist at session start cannot appear mid-response.

### The MCP server appears to hang

`npm run mcp` speaks JSON-RPC on stdin/stdout. Silence is correct behaviour, not
a hang.

### An MCP version changed and something broke

Versions are pinned deliberately. Do not switch to `@latest` to make a problem
go away; that converts a reproducible failure into an intermittent one.
