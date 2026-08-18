# Agent Playbook

How an AI agent runs a QA session from cold start to an approved test.

`AGENTS.md` holds the permanent rules. This document is the procedure. Where
they disagree, `AGENTS.md` wins.

---

## The one idea that matters

**You can observe what happened. You cannot observe what should have happened.**

Everything below follows from that. An agent that skips the oracle step produces
tests that lock in current bugs, pass forever, and are worse than no tests
because they create confidence.

When you cannot source an expectation, you write it down in
`specs/qa/defects/` and you do not assert it. Refusing to generate an assertion
is a successful outcome, not a failure.

---

## Phase 1 — Orient

Read, in order:

1. The target repository's `AGENTS.md`
2. `agent-qa.config.json` — directories, base URL, start command
3. The requirement under `specs/qa/requirements/`
4. `tests/e2e/seed.spec.ts`
5. Any active ExecPlan in `.agent/plans/active/`

If `agent-qa.config.json` is missing, the repository has not been bootstrapped.
Run `agent-qa init --target .` and review the detected values — detection is a
guess.

**Do not proceed without a requirement document.** If the user asked for "test
the checkout" with no acceptance criteria, that is the thing to resolve first.
Ask, or read a route table, an API schema or an existing approved test. Vague
instructions produce vague tests.

---

## Phase 2 — Verify the environment

```bash
npx playwright test --config=playwright.qa.config.ts tests/e2e/seed.spec.ts --project=chromium
```

**If the seed fails, stop.** Classify it as an application, fixture or
environment problem and report that. Do not explore past it. Scenarios built on
a broken environment are worthless, and you will waste the session diagnosing
symptoms of a problem you already had evidence for.

---

## Phase 3 — Explore

Playwright MCP owns the browser. Chrome DevTools MCP inspects. Never let both
issue actions against the same page.

Work from the **accessibility snapshot**, not screenshots. It is text, it is
what assistive technology sees, and it maps directly onto the locators your test
will use. Screenshots are for visual questions only: layout, overlap, clipping,
canvas, charts, icons without accessible names.

Record as you go:

- every meaningful action and the semantic locator used
- visible state before and after
- current URL
- console errors, page errors, failed requests
- relevant successful requests, with method and URL
- candidate assertions, each with the requirement passage supporting it

**Never persist an MCP ref.** `button "Place order" [ref=e42]` is
snapshot-scoped; `e42` is meaningless after the next DOM update. Persist the
semantic identity instead:

```json
{
  "action": "click",
  "target": { "by": "role", "role": "button", "name": "Place order", "exact": true },
  "observedRef": "e42"
}
```

`observedRef` is a debugging breadcrumb. The target is the durable part.

### Watch for animated and deferred content

Values that animate on scroll, lazy-load, or count up will read as zero, empty
or placeholder at first paint. Asserting either the initial or the settled value
is usually wrong: the first encodes a transient state, the second often encodes
unreviewed copy.

This is a real trap. On the first run of this engine, a landing page showed
`0+ Providers / 0.0% Uptime` at load, animating to `20+ / 99.9%` only on scroll.
Both readings were unsuitable. The correct action was a defect note, not an
assertion.

---

## Phase 4 — Choose assertions

For every candidate, answer all six:

1. What requirement supports this expectation?
2. Can a user observe it?
3. Is there a system side effect that should also be checked?
4. **Could this assertion pass while the feature is broken?**
5. Does it depend on unstable text, timing or data?
6. Does the current application contradict the requirement?

Question 4 is the one that separates a test from theatre.

Prefer asserting **both** the visible result and the side effect. A frontend can
show a cheerful success toast while sending the wrong request, or none:

```json
{ "type": "containsText", "target": { "by": "role", "role": "alert" }, "text": "Accept the terms to continue" },
{ "type": "requestAbsent", "method": "POST", "urlIncludes": "/api/orders" }
```

If the application contradicts the requirement, write
`specs/qa/defects/<slug>.md` with evidence and **do not** rewrite the assertion
to match the defect.

---

## Phase 5 — Author the scenario

Write `specs/qa/scenarios/<id>.json` naming its `requirementSource`.

Locator preference, strictly in order: `getByRole` → `getByLabel` → `getByText`
→ `getByTestId`. The schema cannot express XPath, CSS or `nth()` at all.

When text repeats across a header and a footer, **scope to the landmark** rather
than reaching for `.first()`:

```json
{
  "by": "role", "role": "link", "name": "Pricing", "exact": true,
  "within": { "role": "navigation", "name": "Primary" }
}
```

`.first()` silently degrades the assertion to "one of these exists somewhere".

Add a `data-testid` to the application only when no semantic locator can
identify the control — and say so in the report. Sprinkling test IDs over
elements that already have a role and name is lazy pollution.

Keep scenarios small. One behaviour per test. A single enormous end-to-end
journey fails for a dozen reasons and tells you nothing about which.

---

## Phase 6 — Compile, audit, run

```
qa_compile_scenario           -> writes tests/e2e/generated/<id>.spec.ts
qa_validate_generated_tests      -> static gauntlet, then repeatEach: 3
```

The auditor rejects fixed sleeps, `test.skip`/`fixme`/`only`, `nth()`, XPath,
raw CSS locators, tautologies, bare truthiness, files with no assertion, and
files with no requirement header.

If it rejects your output, fix the scenario. Do not edit the generated file by
hand — it is a build artifact and will be overwritten.

---

## Phase 7 — Prove the test detects a defect

**Do not skip this.** A test that cannot fail is worse than none.

Break the behaviour the test claims to protect, run it, restore, run again:

```
mutate the application  -> run the test -> expect FAIL
revert the mutation     -> run the test -> expect PASS
git status --short      -> expect clean
```

Verify the revert. Leaving a mutation in someone's source is a serious mistake.

If the test passes while the feature is broken, the assertion is wrong. Go back
to Phase 4.

---

## Phase 8 — Repair, when a test later fails

Classify **before** editing anything:

| Classification | Who owns it |
| --- | --- |
| Application defect | The product. File it. Do not touch the test. |
| Requirement ambiguity | A human. Record it, stop. |
| Fixture / environment failure | Setup, not the test body. |
| Locator drift | The test. Repair with a better semantic locator. |
| Synchronization failure | The test. Wait on observable state. |
| Invalid generated assertion | The scenario. Regenerate. |
| Genuine requirement change | Update the requirement first, then the test. |

You may repair locators, setup and real synchronization problems.

You may **not** delete or weaken an assertion, add `test.skip`, replace an
expected value with whatever the app currently returns, or raise a timeout
without evidence that the operation legitimately needs longer.

A healer that erases checks whenever they become inconvenient is a machine for
destroying quality signal. Report a healing summary that states plainly whether
any assertion changed.

---

## Phase 9 — Report

State:

- what was tested and the requirement it came from
- assertions generated, and what each protects
- **the mutation-check result** — the evidence the test works
- defects found, separately from test problems
- anything left unverified and why
- whether any assertion changed during repair
- evidence paths under `artifacts/`

Do not report completion for work that only compiles. Compilation is not
acceptance.

---

## Safety

Isolated browser profile by default. Never attach to a personal profile.

No production unless the task explicitly names an approved production-safe
environment.

No payments, publishing, deletion, credential rotation or real-account changes
without an explicit approved fixture.

Never put passwords, cookies, authorization headers or personal data into
prompts, plans, screenshots, traces, generated tests or committed storage state.
`playwright/.auth/` holds credentials capable of impersonating an account and is
gitignored for that reason.
