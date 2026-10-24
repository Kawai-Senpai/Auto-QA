# Journey exploration across people and systems

## Purpose and User-Visible Outcome

Agents using Auto-QA follow a chronological customer journey as every affected
person, compare their state after every step, inspect captured email and find
concurrent editing, money and authorization defects before generating tests.
New target repositories receive the same method in their generated guidance.

## Progress

- [x] (2026-10-24 09:03Z) Read AGENTS.md, both frontend-qa skills, QA-MINDSET.md, templates and the seed test.
- [x] (2026-10-24 09:03Z) Validated updated guidance, both rendered template functions and identical skill copies.
- [x] (2026-10-24 09:03Z) Restored type checking after fixing email-lab CLI imports and output-directory narrowing; fixed first-input loss.
- [x] (2026-10-24 09:03Z) Audit accepted three generated-test repeats; seed plus generated tests passed six clean Chromium runs.

## Surprises and Discoveries

The two skill copies are identical and both need updating. Target repositories
receive strings from src/lib/templates.ts, so changing only local instructions
would miss new installations. Initial npm run typecheck reported TS5097 and
two undefined output-directory errors in src/cli-email-lab.ts. Inspection also
found its argument filter dropped the first input when --out was absent.

## Decision Log

2026-10-24: Keep the full method in docs/QA-MINDSET.md, concise instructions in
AGENTS.md and both skills, and one shared text fragment in templates.ts for
generated entry points. Preserve the compiler, schema, browser ownership,
oracle rules and clean-run gates. Repair the CLI's small validation blockers.

## Outcomes and Retrospective

The full method now reaches local and generated entry points. The compiler,
scenario schema, browser ownership and assertion gates are unchanged. Both
template functions were rendered with a valid default TargetConfig and checked
for all journey topics. Both skill copies have identical SHA256 hashes.
Typecheck passes; audit reports accepted with repeatEach 3; the seed and
generated tests pass six repeated Chromium runs. The email-lab CLI rejects a
missing --out directory with its explicit error. No commits or pushes were made.

## Context and Repository Orientation

Auto-QA compiles structured scenarios to Playwright tests. AGENTS.md and
.agents/skills/frontend-qa/SKILL.md govern exploration; the .claude copy mirrors
the skill. src/lib/templates.ts emits QA_MISSION.md and target AGENTS.md.
tests/seed.spec.ts proves the configured app is reachable before exploration.

## Requirements and Non-Goals

Teach chronological role switching, cross-role state consistency, per-step
email inspection/counts, second-place edits, money edges and denied access.
Every finding includes where, actor, observation, expectation source, kind and
evidence. Requirement-confirmed journeys still compile into focused tests.
No new scenario fields, MCP tools or automation gates are introduced.

## Plan of Work

Update the full method and all entry points. Check both skills match. Validate
generated text through the existing template functions. Run typecheck, audit
and existing Playwright tests. Repair only the small email-lab CLI issues that
prevent typecheck, retaining its capture and reporting behavior.

## Concrete Steps

From the repository root run npm run typecheck, npm run audit, then
npx playwright test tests/seed.spec.ts tests/generated --project=chromium --repeat-each=3.
Use a scratch script to render both template functions with the default target
configuration and check that all required journey topics are present.

## Validation and Acceptance

Both skills match, every guidance entry point contains the method, typecheck
and static audit pass, and existing generated tests still pass clean repeated
execution. Preserve any environment failure as a limitation rather than a pass.

## Idempotence and Recovery

Edits are local and reversible. Do not regenerate target repositories or
overwrite user configuration. Tests use the existing disposable demo setup.

## Security and Data Handling

Use sandbox email, fixture money and approved accounts. Store no real client
data or auth state in guidance, generated examples or evidence summaries.

## Artifacts and Evidence

Commands passed: npm run typecheck; npm run audit (accepted, three repeats);
npx playwright test tests/seed.spec.ts tests/generated --project=chromium --repeat-each=3
(six passed). A temporary script rendered qaMissionTemplate and
targetAgentsTemplate and asserted all journey topics, then compared both skill
files byte for byte; it passed and was removed. Playwright evidence remains in
gitignored artifacts/results.json and artifacts/test-results/.

The repaired email-lab CLI also processed one captured development email with
--no-shots and no --out argument, proving that the first input is retained and
the default output directory works. Its report in artifacts/email-lab/report.md
contains 24 local-link findings (two localhost links across 12 width/client
variants), so it correctly exited 1 for this development fixture. No other
finding kinds were reported; this is a CLI smoke check, not a production email
approval.

## Interfaces and Dependencies

No schema or tool interfaces change. qaMissionTemplate and targetAgentsTemplate
retain their TargetConfig parameter. CLI imports use the repository's .js
TypeScript convention.

## Revision Notes

2026-10-24: Created for the approved handover's Auto-QA guidance task.
