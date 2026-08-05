# Auto-QA Harness

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

1. Read this file.
2. Read the applicable product specification in `specs/product/`.
3. Read `tests/seed.spec.ts`.
4. Read the active ExecPlan when one exists.
5. Start the application using the documented repository command.
6. Run the seed test before exploration. Stop if it fails.
7. Explore with Playwright MCP.
8. Use Chrome DevTools MCP only for deeper runtime, network, rendering or performance diagnosis.
9. Record proposed tests as structured scenarios in `specs/scenarios/`.
10. Compile scenarios with `qa_compile_scenario`.
11. Audit generated tests with `qa_audit_generated_tests`.
12. Run accepted tests repeatedly from clean browser contexts.
13. Update the active ExecPlan after every meaningful milestone.
14. Store failure evidence under `artifacts/`.

## Planning Rule

Use an ExecPlan for work that changes more than one subsystem, introduces or changes an MCP tool, changes the scenario schema, changes generated-test or healing behavior, requires a migration, spans more than one session, or contains material uncertainty requiring a prototype.

ExecPlans must follow `.agent/PLANS.md`. Active plans live in `.agent/plans/active/`; completed plans move to `.agent/plans/completed/`.

## Tool Responsibilities

Playwright MCP acts. Chrome DevTools MCP inspects. The QA harness MCP compiles, audits and executes.

Do not use two tools to control the same browser page concurrently.

## Selector Rules

Use, in order: `getByRole`, `getByLabel`, `getByText`, `getByTestId`.

Do not generate XPath, DOM-position selectors, `nth()`, long CSS selectors, or selectors based on generated class names.

Add a test ID only when semantic locators cannot uniquely identify the control. Do not add `data-testid` to elements that already have an accessible role and name.

## Assertion Rules

Every test must contain at least one requirement-backed assertion.

Prefer checking both the user-visible result and the relevant system side effect. A blocked order submission should verify both the visible validation error and the absence of the order-creation request.

Do not generate tautologies, generic truthiness, screenshot-only tests presented as behavioral tests, assertions copied from unexplained observed behavior, or assertions weakened to make a failing test pass.

## Timing Rules

Do not use `waitForTimeout()` or arbitrary sleeps.

Wait for an observable condition: an element becoming visible or enabled, a URL change, a response, a field value, or a loading indicator disappearing.

## Healing Rules

The healer may replace a brittle locator with a semantic one, repair valid test setup, correct a real synchronization problem, or update an expected route when an approved requirement confirms it changed.

The healer may not delete or weaken assertions, add `test.skip()` or `test.fixme()`, replace expected data with current broken output, increase timeouts without evidence, hide browser errors, or regenerate a whole test to bypass a localized failure.

When application behavior contradicts the requirement, classify the failure as an application defect and report it. Do not rewrite the assertion to match the defect.

## Safety Rules

Use isolated browser profiles. Do not connect testing agents to personal browser profiles.

Do not test production unless the task explicitly names an approved production-safe environment.

Do not submit payments, publish content, delete data, rotate credentials or modify real user accounts without an explicit approved test fixture.

Never store passwords, cookies, authorization headers or private user data in prompts, plans, screenshots, traces, generated tests or committed storage-state files.

## Commands

    npm ci
    npx playwright install --with-deps chromium
    npm run typecheck
    npm run compile -- specs/scenarios/<name>.json
    npm run audit
    npx playwright test tests/generated --project=chromium --repeat-each=3
    npm test

Target a specific application with `BASE_URL`, and let Playwright start it with `WEB_SERVER_COMMAND` and `WEB_SERVER_URL`.

## Completion Criteria

Frontend QA work is complete only when the requirement source is named, the scenario is stored, the generated test passes static audit and repeated clean execution, assertions are meaningful, selectors follow these rules, no assertion was weakened during repair, failure evidence is preserved, the active plan reflects the final state, and unresolved product ambiguity is reported rather than guessed.
