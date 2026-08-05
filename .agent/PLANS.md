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

Active plans: `.agent/plans/active/`
Completed plans: `.agent/plans/completed/`

Use lowercase hyphenated filenames, for example `.agent/plans/active/add-network-oracles.md`.

Do not use one shared plan file for unrelated tasks.

## Self-Containment

Every plan must assume its reader knows nothing beyond the current repository checkout and the contents of the plan.

The plan must identify all relevant files using repository-relative paths, explain unfamiliar terms, state environmental assumptions, name exact commands, describe expected command output, describe observable success, include safe recovery instructions, and preserve important decisions and discoveries.

Do not rely on chat history. Do not write "as discussed earlier." Do not refer vaguely to "the existing service" or "the relevant file." Name it.

## Living Document Rules

Update the plan while implementation proceeds.

These sections must always represent the current state: Progress, Surprises and Discoveries, Decision Log, Outcomes and Retrospective.

After any material change in direction, update all affected sections rather than adding a contradictory note at the bottom.

At each stopping point, the plan must make it possible for another stateless agent to continue the work.

## Required Structure

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

## Section Rules

**Purpose and User-Visible Outcome.** Explain what becomes possible after the change and how a human can see it working. Do not define success only as files changed or code compiling.

**Progress.** Checkboxes only in this section. Every completed item carries a UTC timestamp:

    - [x] (2026-08-05 10:00Z) Completed repository investigation.
    - [ ] Implement scenario validation.
    - [ ] Partially completed browser evidence collection. Completed: console capture. Remaining: failed request capture.

Do not mark an item complete until its validation has passed.

**Surprises and Discoveries.** Record unexpected behavior, defects, constraints and findings, each with evidence:

    - Observation: The application registers its service worker during Playwright runs.
      Evidence: `artifacts/traces/checkout-run-03.zip` shows requests served from the worker.

**Decision Log.** Record material decisions with rationale, date and author.

**Outcomes and Retrospective.** At completion, compare implementation against the original purpose: completed behavior, uncompleted behavior, limitations, follow-up work, evidence, and lessons that should become permanent repository guidance. Do not write "implementation completed successfully."

**Context and Repository Orientation.** Architecture, entry points, data flow, important types, existing tests, start commands, known constraints. Name exact paths and symbols.

**Requirements and Non-Goals.** Requirements must be observable or machine-verifiable. Non-goals prevent quiet scope expansion.

**Plan of Work.** For every change, identify the file, the symbol, the intended behavior, why it is necessary and how it will be verified. Prefer small milestones that leave the repository testable.

**Concrete Steps.** Exact commands, working directories and expected results.

**Validation and Acceptance.** Each item includes setup, action, expected visible result, expected system side effect and evidence location. For generated tests, demonstrate when practical that the test fails when the required behavior is deliberately broken and passes when restored. Compilation alone is not acceptance.

**Idempotence and Recovery.** State whether each operation is safe to repeat, and describe backup, partial-failure, retry, rollback and cleanup behavior. Never leave test accounts, browser sessions or seeded records in an unknown state.

**Security and Data Handling.** Allowed domains, approved test accounts, prohibited actions, secret handling, trace and screenshot redaction, production access, approval requirements.

**Artifacts and Evidence.** List traces, screenshots, videos, JSON reports, plans, scenarios and benchmarks. Do not paste enormous logs into the plan; store them under `artifacts/` and reference paths.

**Interfaces and Dependencies.** Exact exported types, function signatures, MCP tool names and schemas, environment variables, file locations and dependency additions. Explain why each new dependency is required.

**Revision Notes.** Append a dated note after every meaningful revision. A revision note does not replace updating the affected sections above.
