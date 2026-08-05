<div align="center">

```
   █████╗ ██╗   ██╗████████╗ ██████╗        ██████╗  █████╗
  ██╔══██╗██║   ██║╚══██╔══╝██╔═══██╗      ██╔═══██╗██╔══██╗
  ███████║██║   ██║   ██║   ██║   ██║█████╗██║   ██║███████║
  ██╔══██║██║   ██║   ██║   ██║   ██║╚════╝██║▄▄ ██║██╔══██║
  ██║  ██║╚██████╔╝   ██║   ╚██████╔╝      ╚██████╔╝██║  ██║
  ╚═╝  ╚═╝ ╚═════╝    ╚═╝    ╚═════╝        ╚══▀▀═╝ ╚═╝  ╚═╝
```

### **An agentic QA engine that writes tests you can actually trust**

*Explores your app like a human · Writes durable Playwright tests · **Proves they catch regressions***

[![Playwright](https://img.shields.io/badge/Playwright-1.62.1-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev)
[![Node](https://img.shields.io/badge/Node-%E2%89%A520-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![MCP](https://img.shields.io/badge/MCP-stdio-6E56CF)](https://modelcontextprotocol.io)
[![Status](https://img.shields.io/badge/status-early-orange)]()

**[Setup](docs/SETUP.md) · [Agent Playbook](docs/AGENT-PLAYBOOK.md) · [Troubleshooting](docs/TROUBLESHOOTING.md) · [Architecture](docs/PLAN.md)**

Built by **[Ranit Bhowmick](https://ranitbhowmick.com)** · [ranitbhowmick.com](https://ranitbhowmick.com)

</div>

---

## Why this exists

Letting a model click a button is no longer a product. Playwright ships a
planner, generator and healer. Chrome ships DevTools for agents. That layer is
commodity plumbing now.

The hard part is the thing nobody automates:

> ### 🧠 An agent can observe **what happened**.<br>It cannot know **what should have happened**.

Point a naive agent at your app and it will faithfully encode today's bugs as
tomorrow's passing regression tests — green forever, protecting nothing. That is
strictly worse than having no tests, because it manufactures confidence.

Auto-QA is built around that single problem. Every assertion must name where its
expectation came from, and the machinery makes weak tests *hard to produce*.

---

## 🛡️ How weak tests are prevented

| Failure mode | Defence | Enforced by |
| --- | --- | --- |
| Brittle selectors | The schema **cannot express** XPath, CSS or `nth()` | Type system |
| Sleeps & races | `waitForTimeout` rejected | Static auditor |
| Tautologies | `expect(true).toBe(true)` rejected | Static auditor |
| No oracle | Missing requirement header = audit failure | Static auditor |
| Flaky tests | Must pass repeated clean runs | `repeatEach: 3` |
| **Tests that can never fail** | **Mutate the app, confirm it goes red** | Human/agent step |
| Healer erosion | Assertions may not be deleted or weakened | `AGENTS.md` + audit |

> **Unrepresentable beats discouraged.** A schema that cannot emit an XPath is a
> stronger guarantee than a prompt politely asking an agent not to.

---

## 🏗️ Architecture

**This repository is the engine. It holds no product's tests.**

```mermaid
flowchart LR
    subgraph ENGINE["🔧 Auto-QA — the engine (reusable)"]
        S["scenario.ts<br/><i>schema</i>"]
        C["compiler.ts<br/><i>→ Playwright</i>"]
        A["audit.ts<br/><i>guardrails</i>"]
        M["mcp-server.ts<br/><i>3 typed tools</i>"]
        I["cli-init.ts<br/><i>bootstrap</i>"]
    end

    subgraph TARGET["📦 your-application (the truth)"]
        R["specs/qa/requirements/"]
        SC["specs/qa/scenarios/"]
        D["specs/qa/defects/"]
        G["tests/e2e/generated/"]
        AP["tests/e2e/approved/"]
    end

    ENGINE -->|"agent-qa init"| TARGET
    R --> SC --> G --> AP
```

Each application keeps its **own** requirements, scenarios, tests and evidence,
because those are facts about *that product* and belong under its own review and
history. Dumping every client's tests into the engine would be an unmanageable
sewer.

---

## ⚡ Quick start

```bash
git clone https://github.com/mljunction/auto-qa.git
cd auto-qa
npm ci
npx playwright install --with-deps chromium
npm run typecheck
```

> Update the clone URL if you host this elsewhere — no remote is configured yet.

**Prove the pipeline works** before pointing it at your own app:

```bash
npm run compile -- specs/scenarios/todo-create.json
npm run audit
```

Expected: `3 passed`, then `{"status": "accepted", "repeatEach": 3}`.

**Prove the guardrails actually bite** — a guardrail that cannot fail is
decoration:

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
npx tsx src/cli-audit.ts tests/generated/__probe.spec.ts   # expect exit 1 + 4 issues
rm tests/generated/__probe.spec.ts
```

---

## 🎯 Point it at your application

```bash
npx tsx src/cli-init.ts --target /absolute/path/to/your-app
```

Detects your framework, dev command and port, then scaffolds everything **into
the target repo**. Never overwrites an existing file, so re-running is safe.

```bash
cd /path/to/your-app
npm install --save-dev @playwright/test@1.62.1
npx playwright install chromium
npx playwright test --config=playwright.qa.config.ts tests/e2e/seed.spec.ts --project=chromium
```

**If the seed test fails, stop.** That is the environment, not the feature.

Full walkthrough: **[docs/SETUP.md](docs/SETUP.md)**

---

## 🤖 Copy-paste prompts for AI agents

### Bootstrap a new target repository

```text
Set up Auto-QA for this repository.

1. Clone the engine if it is not already present:
   git clone https://github.com/mljunction/auto-qa.git ../auto-qa
   cd ../auto-qa && npm ci && npx playwright install --with-deps chromium

2. Bootstrap this repo as a QA target:
   npx tsx ../auto-qa/src/cli-init.ts --target .

3. Review the generated agent-qa.config.json. Framework detection is a guess —
   verify baseURL, port and startCommand against how this app actually starts.

4. Install the runner here:
   npm install --save-dev @playwright/test@1.62.1
   npx playwright install chromium

5. Verify the environment:
   npx playwright test --config=playwright.qa.config.ts tests/e2e/seed.spec.ts --project=chromium

Stop and report if the seed test fails. Do not continue past a failing seed.
Report the detected config so I can confirm it before any tests are written.
```

### Generate a test for a feature

```text
Read AGENTS.md, docs/AGENT-PLAYBOOK.md and agent-qa.config.json first.

Test: <feature name>

Requirement source: specs/qa/requirements/<file>.md
(If no requirement document exists, STOP and tell me. Do not infer expected
behaviour from what the screen currently shows.)

Steps:
1. Run the seed test. Stop if it fails.
2. Explore with Playwright MCP using accessibility snapshots, not screenshots.
3. Record actions, semantic locators, console errors and network activity.
4. For each candidate assertion answer: what requirement supports this, and
   could this assertion pass while the feature is broken?
5. Write specs/qa/scenarios/<id>.json naming its requirementSource.
6. Compile with qa_compile_scenario.
7. Validate with qa_audit_generated_tests (repeatEach: 3, project: chromium).
8. MUTATION CHECK: break the behaviour, confirm the test FAILS, revert,
   confirm it PASSES, confirm git status is clean.

Rules: no waitForTimeout, no CSS/XPath/nth() selectors, no test.skip, no
weakened assertions. Scope duplicated names with `within`, never .first().

If the app contradicts the requirement, write specs/qa/defects/<slug>.md and
report a defect. Do NOT rewrite the assertion to match the defect.

Report the mutation-check result explicitly.
```

### Repair a failing test

```text
Test <path> is failing. Read docs/AGENT-PLAYBOOK.md phase 8 first.

Classify the failure BEFORE editing anything:
application defect | requirement ambiguity | fixture failure | environment
failure | locator drift | synchronization failure | invalid assertion |
genuine requirement change

You may repair: locators, setup, real synchronization problems.
You may NOT: delete or weaken assertions, add test.skip, replace expected
values with current output, or raise timeouts without evidence.

If behaviour contradicts the requirement, that is an application defect — file
it, do not touch the test.

Report whether any assertion changed.
```

---

## 📚 Documentation

| Document | What it covers |
| --- | --- |
| 🚀 **[docs/SETUP.md](docs/SETUP.md)** | Every verified command, engine and target — plus the failures hit during bring-up |
| 🤖 **[docs/AGENT-PLAYBOOK.md](docs/AGENT-PLAYBOOK.md)** | 9-phase procedure for running a QA session |
| 🔧 **[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** | Real symptoms → real causes |
| 📋 **[AGENTS.md](AGENTS.md)** | Permanent rules for any agent working here |
| 🎭 **[CLAUDE.md](CLAUDE.md)** | Thin Claude Code adapter over `AGENTS.md` |
| 📐 **[.agent/PLANS.md](.agent/PLANS.md)** | What a valid ExecPlan must contain |
| 🏛️ **[docs/PLAN.md](docs/PLAN.md)** | Original architecture rationale |
| 🔌 **[docs/MCP-STRUCTURE.md](docs/MCP-STRUCTURE.md)** | Engine/target split, MCP install, vision, offline tests |

### Skills

Loaded automatically by Claude Code and Codex when a task matches.

| Skill | Path |
| --- | --- |
| `frontend-qa` (Claude) | [.claude/skills/frontend-qa/SKILL.md](.claude/skills/frontend-qa/SKILL.md) |
| `frontend-qa` (Codex) | [.agents/skills/frontend-qa/SKILL.md](.agents/skills/frontend-qa/SKILL.md) |
| ↳ Scenario format | [references/scenario-format.md](.claude/skills/frontend-qa/references/scenario-format.md) |
| ↳ Test quality rules | [references/test-quality-rules.md](.claude/skills/frontend-qa/references/test-quality-rules.md) |
| ↳ Validation script | [scripts/validate-generated-test.sh](.claude/skills/frontend-qa/scripts/validate-generated-test.sh) |

---

## 🔌 MCP tools

Three narrow, typed operations — and **no generic shell tool**. Browser-controlled
content reaching a shell is remote code execution.

| Tool | Purpose |
| --- | --- |
| `qa_compile_scenario` | Validate a scenario → write a permanent test |
| `qa_audit_generated_tests` | Reject weak tests, then run them repeatedly |
| `qa_run_playwright_tests` | Run existing tests without arbitrary commands |

Target paths are constrained to the repository. Versions in generated
`.mcp.json` are **pinned**, never `@latest` — an unattended upgrade of the
browser-control layer must not break a product's QA overnight.

| Package | Pinned |
| --- | --- |
| `@playwright/mcp` | `0.0.78` |
| `chrome-devtools-mcp` | `1.6.0` |
| `@playwright/test` | `1.62.1` |

---

## 🔄 The lifecycle

```
  📖 Requirement          ← the oracle. Without this, stop.
       ↓
  🌱 Seed test            ← environment proven, or stop
       ↓
  🔍 Explore              ← accessibility tree, not pixels
       ↓
  📝 Scenario JSON        ← reviewable, requirement-linked
       ↓
  ⚙️  Compile             ← permanent Playwright TypeScript
       ↓
  🛡️  Static audit        ← brittle patterns rejected
       ↓
  🔁 Repeat ×3            ← flakiness surfaced
       ↓
  💥 Mutation check       ← proves the test can actually fail
       ↓
  ✅ Approved             ← runs in CI with no AI, no MCP
```

> **The agent is the explorer and author. Playwright is the permanent executor.**
> Once the file exists, no model, MCP server or extension is involved.

---

## 🧩 Scripts

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run compile -- <scenario.json>` | Compile one scenario |
| `npm run audit [target]` | Static audit + repeated execution |
| `npm run init -- --target <path>` | Bootstrap a target repository |
| `npm run mcp` | Start the QA MCP server on stdio |
| `npm test` | Run the whole Playwright suite |

---

## 📍 Status

**Working:** scenario schema with landmark scoping · compiler · static auditor ·
MCP server · target bootstrap with framework detection · browser evidence
capture · seed verification.

**Not built yet:** exploration recording to `.qa/sessions` · the healer · HAR
replay for offline runs · auth storage-state · visual baselines · automatic
requirement-file validation · PR creation.

Early, but the pipeline is proven end to end against a real application —
including a mutation check that confirmed the generated test fails when the
behaviour it protects is broken.

---

<div align="center">

**Built by [Ranit Bhowmick](https://ranitbhowmick.com)**

[🌐 ranitbhowmick.com](https://ranitbhowmick.com)

<sub>Markdown guides tell an agent what good work looks like.<br/>
Schemas, scripts, permissions and CI are what prevent bad work.</sub>

</div>
