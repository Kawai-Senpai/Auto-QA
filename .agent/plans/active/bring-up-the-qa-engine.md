# Bring Up the Auto-QA Engine

This ExecPlan follows `.agent/PLANS.md`.

## Purpose and User-Visible Outcome

After this work, a developer or agent can point Auto-QA at a running web
application, produce a requirement-backed Playwright test, prove that test fails
when the behaviour it protects is broken, and run it afterwards with no AI, MCP
server or browser extension involved.

A human can see it working by cloning the engine, running `npm run audit`
against the bundled TodoMVC scenario, then running
`npx tsx src/cli-init.ts --target <app>` and executing the seeded suite from
inside that application's own repository.

## Progress

- [x] (2026-08-05 12:00Z) Scaffolded the engine: package, tsconfig, Playwright config.
- [x] (2026-08-05 12:20Z) Implemented `src/lib/scenario.ts`, `compiler.ts`, `audit.ts`.
- [x] (2026-08-05 12:35Z) Implemented `cli-compile.ts`, `cli-audit.ts`, `mcp-server.ts`.
- [x] (2026-08-05 12:50Z) Verified the MCP server over a real stdio handshake; three tools returned.
- [x] (2026-08-05 13:00Z) Verified the auditor rejects a deliberately bad test with four issues.
- [x] (2026-08-05 13:20Z) Added the instruction hierarchy: `AGENTS.md`, `CLAUDE.md`, `.agent/PLANS.md`, `frontend-qa` skill mirrored to Claude and Codex paths.
- [x] (2026-08-05 13:40Z) Split engine from target: `target-config.ts` and `cli-init.ts`.
- [x] (2026-08-05 14:00Z) First experiment against the ML Junction frontend: requirement, defect note, scenario, generated test, three clean runs.
- [x] (2026-08-05 14:15Z) Mutation-checked the generated test: failed when the nav label changed, passed when reverted, target repository left clean.
- [x] (2026-08-05 14:40Z) Added `README.md`, `.gitignore`, `docs/SETUP.md`, `docs/AGENT-PLAYBOOK.md`, `docs/TROUBLESHOOTING.md`, skill references and the validation script.
- [ ] Record exploration sessions into `.qa/sessions/<id>/events.jsonl`.
- [ ] Validate `requirementSource` resolves to a real file under the target's requirements directory.
- [ ] Implement the healer with the restrictions in `AGENTS.md`.
- [ ] Add HAR recording and replay for runs that must not reach external services.
- [ ] Add auth storage-state setup for authenticated flows.
- [ ] Add visual baseline support.
- [ ] Add unit tests for the schema, compiler and auditor.
- [ ] Publish the engine so targets can depend on a pinned version rather than a path.

## Surprises and Discoveries

- Observation: `page.goto('/')` against a base URL carrying a path resolves to
  the origin and silently drops that path, producing a 404.
  Evidence: the first seed run against `https://demo.playwright.dev/todomvc`
  returned 404. Fixed by using relative `./` and a trailing-slash base URL.

- Observation: Node refuses to spawn `npx.cmd` on Windows without
  `shell: true`.
  Evidence: `spawnSync npx.cmd EINVAL` from `runPlaywrightTests`. Enabling a
  shell was rejected because the spawn target is caller-supplied; the auditor
  now spawns `process.execPath` with `require.resolve('@playwright/test/cli')`.

- Observation: Vite binds IPv6 loopback only, so `127.0.0.1` is refused while
  `localhost` succeeds.
  Evidence: `curl 127.0.0.1:5173` exit 7, `curl localhost:5173` 200. `cli-init`
  now emits `localhost`.

- Observation: the ML Junction landing page renders `0+ Providers / 0.0% Uptime`
  at first paint, animating to `20+ / 99.9%` only once scrolled into view, with
  no network request for the figures.
  Evidence: `specs/qa/defects/landing-stats-counter.md` in the frontend
  repository records both readings. Neither was asserted.

- Observation: the scenario schema could not disambiguate a link name repeated
  in a header and a footer, and Playwright failed on strict mode.
  Evidence: `getByRole('link', {name: 'Models'})` resolved to 2 elements. Added
  landmark scoping via `within` rather than accepting `.first()`, which would
  have weakened the assertion to "one of these exists somewhere".

- Observation: a target repository without its own `@playwright/test` gets a
  temporary copy from `npx` that cannot resolve the config's imports.
  Evidence: `ERR_MODULE_NOT_FOUND` loading `playwright.qa.config.ts`.

## Decision Log

- Decision: The engine stores no product artifacts; each target keeps its own
  requirements, scenarios, tests and evidence.
  Rationale: those are facts about a product and belong under its own review and
  history. A shared engine repository accumulating every client's tests becomes
  unmaintainable.
  Date: 2026-08-05

- Decision: Express only user-facing locators in the schema.
  Rationale: a schema that cannot represent XPath or DOM-position selectors
  cannot emit them. That is a stronger guarantee than instructing an agent.
  Date: 2026-08-05

- Decision: Expose no generic shell tool through MCP.
  Rationale: browser-controlled content with a route to shell execution is
  remote code execution.
  Date: 2026-08-05

- Decision: Pin MCP and Playwright versions in generated target configuration.
  Rationale: an unattended upgrade of the browser-control layer must not be able
  to break a product's QA overnight.
  Date: 2026-08-05

- Decision: Record browser evidence unconditionally but fail on it only behind
  `FAIL_ON_BROWSER_ERRORS=1`.
  Rationale: most applications log harmless console noise, and a harness that
  fails every test on the first warning gets disabled within a day.
  Date: 2026-08-05

## Outcomes and Retrospective

The work is not complete.

The compile-audit-execute pipeline is proven end to end against a real
application, including a mutation check that confirmed the generated test fails
when the protected behaviour is broken and passes when it is restored. The
engine/target split is implemented and demonstrated.

What is missing is the recording and repair half of the system: exploration
sessions are not yet persisted, `requirementSource` is accepted as unvalidated
text, and there is no healer. Until sessions are recorded, the pipeline depends
on an agent transcribing its own exploration into a scenario by hand, which is
the least reliable step in the loop.

At completion this section must document the final MCP tool surface, the test
evidence, remaining limitations, and any rules that should move into
`AGENTS.md`.

## Context and Repository Orientation

`src/lib/scenario.ts` defines the scenario schema, including landmark scoping.

`src/lib/compiler.ts` converts a valid scenario into Playwright TypeScript.

`src/lib/audit.ts` rejects prohibited generated-test patterns and runs the
Playwright CLI.

`src/lib/target-config.ts` defines `agent-qa.config.json` and constrains path
resolution to the target repository.

`src/cli-init.ts` bootstraps a target repository, detecting framework, port and
start command.

`src/mcp-server.ts` exposes `qa_compile_scenario`,
`qa_audit_generated_tests` and `qa_run_playwright_tests`.

`tests/seed.spec.ts` verifies an environment before exploration.

## Requirements and Non-Goals

The implementation must: validate scenarios, compile them to Playwright tests,
reject brittle or weakened generated tests, execute tests repeatedly, bootstrap
a target repository, keep product artifacts out of the engine, and expose the
above through MCP without generic shell access.

The implementation will not: interact with production systems, approve visual
baselines automatically, create pull requests, repair application defects, or
permit arbitrary command execution through MCP.

## Plan of Work

Next milestone is exploration recording. Add `src/lib/exploration.ts` writing
`.qa/sessions/<id>/events.jsonl` in the target, storing semantic targets rather
than MCP refs, which are snapshot-scoped and meaningless after a DOM update.

Then add `src/lib/requirements.ts` to resolve `requirementSource` to a real file
inside the target's requirements directory and store a content hash, so later
edits to a requirement are detectable.

Then the healer, constrained by the rules already written in `AGENTS.md`.

## Concrete Steps

Working directory: engine repository root.

    npm ci
    npm run typecheck
    npm run compile -- specs/scenarios/todo-create.json
    npm run audit

Expected: typecheck exits 0; audit prints `3 passed` then
`{"status": "accepted"}`.

Target bootstrap:

    npx tsx src/cli-init.ts --target <path>
    cd <path>
    npm install --save-dev @playwright/test@1.62.1
    npx playwright test --config=playwright.qa.config.ts --project=chromium

Expected: the seed test and any generated tests pass.

## Validation and Acceptance

Acceptance one: a scenario naming a requirement compiles to a test carrying a
`// Generated from requirement:` header. Evidence: `tests/generated/`.

Acceptance two: a test containing a sleep, a CSS locator, a tautology or no
requirement header is rejected with a named rule. Verified: four issues raised.

Acceptance three: an accepted test passes three consecutive isolated runs.
Verified against TodoMVC and the ML Junction frontend.

Acceptance four: breaking the protected behaviour makes the test fail, and
restoring it makes the test pass. Verified by renaming a navigation label.

Acceptance five: the generated suite runs from the target repository with no
MCP server or model. Verified: 6 passed.

## Idempotence and Recovery

`cli-init` never overwrites an existing file, so re-running it on a configured
repository is safe.

Recompiling a scenario deterministically replaces its generated test.

A mutation check must always be reverted and the revert verified with
`git status`. Leaving a mutation in a target repository is a serious error.

If validation fails, preserve the trace and do not promote the test to
`tests/e2e/approved/`.

## Security and Data Handling

The MCP server exposes no shell. Tool paths are constrained to the repository.

Browsers run isolated by default. Extension mode is for discovery only and
requires a human to install the extension.

`playwright/.auth/`, `.qa/sessions/` and `artifacts/` are gitignored: storage
state can impersonate the account it was captured from, and session evidence may
contain unredacted page content and headers.

## Artifacts and Evidence

- `artifacts/results.json`, `artifacts/html-report/` — engine runs
- `artifacts/test-results/**/trace.zip` — failure traces
- The ML Junction frontend's `specs/qa/` — the first experiment's requirement,
  scenario and defect note

## Interfaces and Dependencies

Exported from `src/lib/scenario.ts`: `ScenarioSchema`, `TargetSchema`,
`StepSchema`, `AssertionSchema` and their inferred types.

Exported from `src/lib/compiler.ts`: `compileScenario(scenario): string`.

Exported from `src/lib/audit.ts`: `auditGeneratedTests(root): AuditIssue[]`,
`runPlaywrightTests(options): TestRunResult`.

Exported from `src/lib/target-config.ts`: `TargetConfigSchema`,
`loadTargetConfig`, `resolveInTarget`, `CONFIG_FILENAME`.

MCP tools: `qa_compile_scenario`, `qa_audit_generated_tests`,
`qa_run_playwright_tests`.

Dependencies: `@modelcontextprotocol/server` (MCP), `zod` (schema validation),
`@playwright/test` (browser control and runner), `@axe-core/playwright`
(accessibility assertions), `tsx` and `typescript` (execution and checking).

## Revision Notes

- 2026-08-05: Created during first bring-up. Added landmark scoping to the
  target schema after strict-mode violations proved an unscoped name cannot
  identify a link repeated in a header and a footer.
