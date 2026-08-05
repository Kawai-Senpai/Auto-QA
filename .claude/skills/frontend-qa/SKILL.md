---
name: frontend-qa
description: Explore a web frontend, diagnose browser behavior, convert approved requirements into Playwright tests, validate generated tests, or repair frontend tests. Use for browser interaction, frontend regression testing, Playwright generation, UI defect reproduction, accessibility checks and test healing. Do not use for backend-only unit tests or unapproved production interaction.
---

# Frontend QA Workflow

Read the repository root `AGENTS.md` before using this skill.

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

## Exploration

Use Playwright MCP as the browser-control owner.

Record every meaningful action, the semantic locator used, visible state before and after, current URL, console errors, page errors, failed requests, relevant successful requests, dialogs, downloads, popups, candidate assertions, and the requirement passage supporting each assertion.

Use Chrome DevTools MCP only when Playwright evidence is insufficient. Do not let both tools issue actions against the same page concurrently.

## Scenario Design

Each scenario must contain a stable lowercase ID, a descriptive name, a repository-relative `requirementSource`, deterministic actions, semantic targets, at least one requirement-backed assertion, any required network assertions, and evidence references.

Separate unrelated behavior into separate tests. Do not produce one enormous end-to-end test covering an entire application.

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

Run `qa_audit_generated_tests` with the generated test path, `repeatEach: 3`, `project: chromium`, `execute: true`.

When the flow is responsive or mobile-sensitive, also run `project: mobile-chrome`.

Preserve traces and failure reports under `artifacts/`.

## Repair

Classify a failure before editing the test: application defect, requirement ambiguity, fixture failure, environment failure, locator drift, synchronization failure, invalid generated assertion, or genuine requirement change.

Repair only test-owned defects. Never delete or weaken an assertion to achieve a passing result. After a repair, rerun static audit and repeated execution.

## Completion

Update the active ExecPlan, ensure the scenario is stored, ensure audit and repeated execution pass, preserve evidence paths, report requirement conflicts separately, list any unverified behavior, state which assertions changed during healing, and move a completed ExecPlan into `.agent/plans/completed/`.
