# Test Quality Rules

What the auditor enforces, and why each rule exists. Implemented in
`src/lib/audit.ts`.

The rules are mechanical. They cannot tell whether an assertion reflects a real
requirement — only a human reviewing `requirementSource` can. What they catch is
the decay that turns a generated suite into a slow suite everyone ignores.

---

## Rejected patterns

### `requires-assertion`

A file with no `expect(` at all. A browser action without an assertion is a
click, not a test.

### `requires-requirement-source`

No `// Generated from requirement:` header, meaning the file did not come from
the compiler. The requirement trail is how a reviewer checks that an expectation
was sourced rather than invented. Author a scenario and compile it.

### `no-fixed-sleep` — `waitForTimeout()`

A sleep is a guess about someone else's machine. Too short and it is flaky; too
long and the suite crawls. It also hides real races rather than surfacing them.

Wait on observable state: visibility, enabled state, a URL change, a response, a
field value, a spinner disappearing. Playwright's web assertions already retry.

### `no-skipped-tests` — `test.skip()` / `test.fixme()`

A skipped test reports green while protecting nothing. If a test cannot run,
that is a finding to report, not a line to commit.

### `no-only-tests` — `test.only()`

Silently disables every other test in the file. Catastrophic in CI.

### `no-nth-selector` — `.nth()`

Couples the test to DOM ordering, so any layout change breaks it and any
reordering makes it assert the wrong element. Scope with `within` instead.

### `no-xpath-selector`

Encodes document structure. Breaks when a wrapper moves. Unreadable in review.

### `no-raw-css-locator` — `page.locator()`

`div:nth-child(3) > button` breaks the moment someone adds a wrapper, and says
nothing about what the element *is*. Use role, label, text or test ID.

### `no-trivial-assertion` — `expect(true).toBe(true)`

Passes perfectly. Tests nothing. Its only function is to make a suite look
larger.

### `no-weak-truthiness` — `.toBeTruthy()`

`"undefined"`, `"0"`, `[]` and `{}` are all truthy. It is the assertion you
write when you do not know what you expect. Assert the exact required state.

---

## Beyond static rules

The auditor cannot check these. You must.

### The assertion must be able to fail

Run the mutation check: break the behaviour the test claims to protect and
confirm the test goes red, then restore and confirm green. A test that passes in
both states is theatre.

This is the single highest-value check in the workflow and the one most often
skipped.

### The expectation must be sourced

Valid: acceptance criteria, API or schema contracts, route tables, approved
tests, human-confirmed behaviour.

Not valid: what the screen currently shows.

Observed behaviour becomes an assertion only when a requirement agrees with it.
Otherwise the suite is a snapshot of today's bugs, defended forever.

### Assert the side effect too

A frontend can display a success toast while sending the wrong request, a
duplicate request, or none. Pair the visible result with `requestSeen` or
`requestAbsent` wherever a requirement mentions a system effect.

### Beware unsettled content

Values that animate, lazy-load or count up are not final at first paint.
Asserting the initial value pins a transient; asserting the settled value often
pins unreviewed copy. When neither is sourced, write a defect note instead.

### One behaviour per test

A single end-to-end journey covering registration, checkout and invoicing fails
for a dozen reasons and localises none of them. Split it.

---

## Healing limits

Permitted: replace a brittle locator with a semantic one, repair valid setup,
fix a real synchronization problem, update an expected route when an approved
requirement confirms it changed.

Prohibited: delete an assertion, weaken an assertion, add `test.skip` or
`test.fixme`, replace an expected value with whatever the application currently
returns, raise a timeout without evidence, suppress browser errors, or
regenerate a whole test to bypass one localised failure.

When behaviour contradicts the requirement, that is an **application defect**.
File it. Do not rewrite the assertion to match.

A healing report must state plainly whether any assertion changed:

```
Failure classification: locator drift
Old locator: text=Continue
New locator: role=button, name=Continue to payment
Application behaviour changed: no
Assertions changed: no
Evidence: artifacts/test-results/.../trace.zip
```

A healer permitted to weaken checks is a machine that deletes your quality
signal whenever it becomes inconvenient.
