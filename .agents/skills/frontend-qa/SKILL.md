---
name: frontend-qa
description: Explore a web frontend, diagnose browser behavior, convert approved requirements into Playwright tests, validate generated tests, or repair frontend tests. Use for browser interaction, frontend regression testing, Playwright generation, UI defect reproduction, accessibility checks and test healing. Do not use for backend-only unit tests or unapproved production interaction.
---

# Frontend QA Workflow

Read the repository root `AGENTS.md` before using this skill.


## Test like the real world, not like the developer

Read `docs/QA-MINDSET.md` before any exploration; its first section is the
owner's own brief, kept whole. The short of it, which is not a substitute:

- A developer's test passes because it only tries what the system already
  does. Be the outside user instead: real life is messy, full of exceptions,
  uniqueness and noise.
- Required information may simply not exist (no phone, no email, nothing at
  all about the client). Look for the way out; its absence is a finding.
- Steps happen out of order, get skipped, reordered or repeated for one
  exceptional client. Try it.
- People need to undo what they already did. Look for the way back.
- The same system may be used tomorrow by a different business in another
  country with 10,000 customers a day. Ask what breaks.
- Findings are bugs, missing ways out, improvements and new features alike.
- "Works" is not "done". Polish is tested too: if a screen or email is merely
  okay, that is a finding (the owner's bar: no "75% there").

## Think like a real user first

Use the chronological, multi-person method in `docs/QA-MINDSET.md`, "Walk one
real journey across every person". Follow one customer's real journey end to
end as client, sales, operations, engineer and accounts (or the target's roles).
After every step, compare everyone's Today, client page, stage, next step and
waiting on. Read all captured email in Mailpit or the configured sandbox and
count it per step and recipient, including zero and grouped messages. Change
an open page's data from another tab, API or MCP; try foreign-client tax,
unsent drafts, duplicate billing periods and rounding; and switch to people
who should and should not have access, checking direct requests too.

Log where, actor, what was seen, expectation source, evidence and kind (bug,
no way out, improvement, feature). Then convert confirmed journeys into
focused scenarios using the existing compiler, audit and repeated clean runs.
Do not turn uncertain observations into assertions or invent schema features
for cross-role coverage the compiler cannot express; record the gap.

## Required Inputs

Before browser exploration, identify the product requirement file under `specs/product/`, the application base URL, the seed test, the allowed test account or fixture, the requested flow, and prohibited or destructive actions.

Do not infer expected behavior solely from the current UI.

## Plan Selection

Read `.agent/PLANS.md`. Create an ExecPlan when the task meets the planning criteria in `AGENTS.md`. When an active plan already covers the task, resume and update it rather than creating a second plan.

## Preparation

    npm ci
    npm run typecheck
    npx playwright test tests/seed.spec.ts --project=chromium

Stop when the seed test fails. Classify the failure as an environment or fixture problem before exploring feature behavior.

## Browser Control Servers

Three browser-control servers may be available. Check which are connected before
exploring; do not assume.

| Server | Role |
| --- | --- |
| Playwright MCP | Default owner of browser actions. |
| browserd | Continuous recording of network, console, exceptions and navigations; semantic locator resolution; flow recording shaped for this harness. |
| Chrome DevTools MCP | Narrow fallback when Playwright evidence is insufficient. |

**Each server drives its own browser.** browserd records its own Chromium and
its own tool calls; it sees nothing that happens in the browser Playwright MCP
launched. Sharing one browser between them is not currently wired up - browserd
exposes no tool that returns its CDP endpoint - so do not try to arrange it.

That makes the choice per-flow, not per-session:

- **Driving with Playwright MCP** (the default): use browserd for nothing, and
  gather evidence from Playwright's own console and network reporting.
- **Driving with browserd**: you additionally get `locator.*` and `qa.*`, which
  are the tools that make a scenario cheap to author correctly. Prefer this for
  any flow you intend to turn into a test.

Do not mix drivers within one flow. A half-recorded flow is worse than an
unrecorded one, because the gap is invisible in the output.

### Installing browserd when it is missing

browserd is optional. Exploration works without it: you lose retrospective
evidence, not the ability to test. Install it only when the task needs that
evidence and the tools are absent, and only with the user's agreement, since it
writes to their MCP client config.

Confirm it is genuinely missing first: look for `browserd` tools such as
`network_summarize` or `console_query` in the connected tool list. Then:

    git clone https://github.com/Kawai-Senpai/Browsered.git browserd
    cd browserd
    npm install
    npm run build
    node dist/cli.js --tools          # expect a tool count, confirms the build
    node scripts/install-mcp.mjs      # merges into every detected client, writes .bak first
    node scripts/verify-mcp.mjs       # real MCP handshake per client

Requires Node >= 20.11 and a Chromium. If none is present,
`npx playwright install chromium` provides one. Do not install a Node runtime
yourself; stop and tell the user.

`install-mcp.mjs` merges into existing client config and never clobbers other
servers. Restart the session afterwards: **a server registered mid-session does
not appear until the client restarts**, so finish the current step before
installing rather than expecting the tools to arrive mid-response.

To register manually instead, the stdio entry uses an absolute path:

    {"mcpServers": {"browserd": {"command": "node", "args": ["<ABS>/dist/cli.js"]}}}

Never install into a user's personal browser profile or a production MCP client
without saying what you are about to change.

### Authoring locators with browserd

The scenario schema accepts only `role` + `name`, `label`, `text` and `testId`.
Guessing which of those addresses an element, then finding out at compile time,
is the slowest possible loop. `locator.candidates` answers it in the browser:

    locator.candidates { selector: "header nav a" }

It returns each usable locator with how many elements it actually matches, and
when a locator is ambiguous it computes the landmark scope that makes it unique.
Take `recommended` and put it in the scenario verbatim.

A count above one is a problem to fix, never one to route around. `.first()` and
`nth()` do not disambiguate; they suppress the complaint and reduce the assertion
to "one of these exists somewhere". If no candidate is unique, the answer is a
test id or a markup change, and that is worth saying to the user.

Before compiling, check each target you did not take verbatim:

    locator.check { target: { by: "role", role: "button", name: "Save" } }

`ok: true` means exactly one match. Anything else is cheaper to fix now than
after `qa_validate_generated_tests` has run the test three times.

### Recording a flow with browserd

    qa.record_start { flow: "create a todo" }   # then drive normally
    qa.steps {}                                 # scenario steps, semantic targets
    qa.evidence {}                              # what the application actually did
    qa.scenario_draft { id: "todo-create", name: "A todo can be created" }

Each action resolves its semantic locator before it runs, which is the only
moment that answer is reliable. `qa.evidence` reads the recording browserd was
keeping anyway, so the window is chosen after the flow.

**The draft is deliberately not compilable.** It returns `assertions: []` and
`requirementSource: null`, because those are exactly the two things that must
come from a requirement document rather than from observed behaviour. Candidate
assertions arrive with `oracle: null` and stay that way until you attach a
requirement passage to each one. A candidate you cannot justify from a
requirement is a discovery for `specs/discoveries/`, not an assertion.

`qa.session_events` returns the same exploration as harness events; feed each to
`qa_record_event` with the id from `qa_begin_session`.

### Artifacts browserd can hand over

- `storage.export { format: "playwright" }` writes a real `storageState` file,
  which is what a scenario's `role` field loads. Note it has no field for
  sessionStorage; the tool warns when keys were dropped.
- `page.snapshot { format: "aria" }` emits Playwright's aria-snapshot dialect
  for an `ariaSnapshot` assertion. It is a draft: run the assertion once and
  reconcile before committing, because Chrome and Playwright compute roles and
  names independently.
- `network.export_har` produces a HAR for a scenario's `har` field. Whether
  Playwright's `routeFromHAR` loads it unmodified has not been verified; prove
  it on one scenario before relying on it.

## Exploration

Use one browser-control owner per flow, chosen as described above.

Record every meaningful action, the semantic locator used, visible state before and after, current URL, console errors, page errors, failed requests, relevant successful requests, dialogs, downloads, popups, candidate assertions, and the requirement passage supporting each assertion.

When browserd drove the flow, `qa.steps` and `qa.evidence` already hold most of
that; do not transcribe it from memory when a tool can return it.

Use Chrome DevTools MCP only when the evidence from the driving server is
insufficient. Do not let two tools issue actions against the same page
concurrently - reading recorded history is safe, issuing competing clicks is not.

## Scenario Design

Each scenario must contain a stable lowercase ID, a descriptive name, a repository-relative `requirementSource`, deterministic actions, semantic targets, at least one requirement-backed assertion, any required network assertions, and evidence references.

Separate unrelated behavior into separate tests. Do not produce one enormous end-to-end test covering an entire application.

When browserd is the driver, every target in the scenario should have come from
`locator.candidates` or been confirmed by `locator.check`. A target nobody
resolved against the live page is a guess, and a guess is what the compile,
audit and repeated-run cycle is going to spend its time disproving.

## Assertion Review

For every candidate assertion, answer:

1. What requirement supports this expectation?
2. Can a user observe it?
3. Is there a system side effect that should also be checked?
4. Could this assertion pass while the feature is broken?
5. Does the assertion depend on unstable text, timing or data?
6. Does the current application contradict the requirement?

When the application contradicts the requirement, create a defect report in `specs/discoveries/`. Do not alter the requirement-backed expectation to make the test pass.

## Test Generation

Compile the approved scenario with `qa_compile_scenario`.

The scenario schema can only express role, label, text and test-ID locators, so brittle selectors are unrepresentable rather than merely discouraged.

## Validation

Run `qa_validate_generated_tests` with `target` set to the generated test path,
`repeatEach: 3` and `project: chromium`. `typeCheck` defaults to true; leave it on.

When the flow is responsive or mobile-sensitive, also run `project: mobile-chrome`.

Preserve traces and failure reports under `artifacts/`.

## Repair

Classify a failure before editing the test: application defect, requirement ambiguity, fixture failure, environment failure, locator drift, synchronization failure, invalid generated assertion, or genuine requirement change.

Repair only test-owned defects. Never delete or weaken an assertion to achieve a passing result. After a repair, rerun static audit and repeated execution.

## Completion

Update the active ExecPlan, ensure the scenario is stored, ensure audit and repeated execution pass, preserve evidence paths, report requirement conflicts separately, list any unverified behavior, state which assertions changed during healing, and move a completed ExecPlan into `.agent/plans/completed/`.
