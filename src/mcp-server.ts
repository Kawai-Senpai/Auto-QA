import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute, join } from 'node:path';

import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod';

import { auditGeneratedTests, runPlaywrightTests, runTypeCheck } from './lib/audit.js';
import { compiledFileName, compileScenario } from './lib/compiler.js';
import { ScenarioSchema } from './lib/scenario.js';
import {
  CONFIG_FILENAME,
  assertOriginAllowed,
  loadTargetConfig,
} from './lib/target-config.js';
import type { TargetConfig } from './lib/target-config.js';
import { discoverApplication, preflight } from './lib/discover.js';
import {
  SessionEventSchema,
  beginSession,
  completeSession,
  recordEvent,
  summariseSession,
} from './lib/session.js';
import {
  assertRoleConfigured,
  inspectAuthState,
  prepareAuthCommand,
} from './lib/auth.js';
import { listGeneratedTests, promoteTest } from './lib/promote.js';

/**
 * The QA harness MCP server.
 *
 * It deliberately exposes no generic shell tool. Browser-controlled content
 * reaching a shell is remote code execution, so every capability here is a
 * narrow, typed operation with its paths constrained to the target repository.
 */

function textResult(value: unknown, isError = false) {
  return {
    isError,
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  };
}

/**
 * The target repository the server operates on.
 *
 * Passed as --target at launch so an agent cannot redirect the server at
 * another checkout mid-session by varying a tool argument.
 */
function resolveTargetRoot(): string {
  const index = process.argv.indexOf('--target');
  return resolve(index !== -1 ? (process.argv[index + 1] ?? '.') : '.');
}

const TARGET_ROOT = resolveTargetRoot();

function withConfig<T>(handler: (root: string, config: TargetConfig) => T): T {
  const { root, config } = loadTargetConfig(TARGET_ROOT);
  return handler(root, config);
}

function assertInsideRepository(root: string, target: string): string {
  const absolute = resolve(root, target);
  const relativePath = relative(root, absolute);

  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`Target must stay inside the repository. Rejected: ${target}`);
  }

  return target;
}

function truncate(value: string, limit = 30_000): string {
  if (value.length <= limit) {
    return value;
  }
  return [value.slice(0, limit), '', `[Output truncated after ${limit} characters]`].join('\n');
}

function failed(error: unknown) {
  return textResult({ status: 'error', error: String(error) }, true);
}

serveStdio(() => {
  const server = new McpServer({ name: 'auto-qa', version: '0.2.0' });

  // --------------------------------------------------------------- preflight

  server.registerTool(
    'qa_preflight',
    {
      description:
        'Report which QA capabilities are actually present in the target repository. Call before any browser work; do not continue silently when a required capability is missing.',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return withConfig((root, config) => textResult(preflight(root, config)));
      } catch (error) {
        return failed(error);
      }
    },
  );

  server.registerTool(
    'qa_discover_application',
    {
      description:
        'Read the target repository and report framework, scripts, routes, auth indicators, existing tests and design-system hints. Describes what the repository contains, never what it should do.',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return withConfig((root, config) =>
          textResult(discoverApplication(root, config)),
        );
      } catch (error) {
        return failed(error);
      }
    },
  );

  server.registerTool(
    'qa_check_scope',
    {
      description:
        'Check whether a URL is inside the configured allowed origins and not production. Call before navigating anywhere the mission did not name.',
      inputSchema: z.object({ url: z.string().min(1) }),
    },
    async ({ url }) => {
      try {
        return withConfig((_root, config) => {
          assertOriginAllowed(config, url);
          return textResult({ status: 'allowed', url });
        });
      } catch (error) {
        return failed(error);
      }
    },
  );

  // -------------------------------------------------------------------- auth

  server.registerTool(
    'qa_prepare_auth_state',
    {
      description:
        'Report the authentication state for a role: storage-state path, age and expiry. Returns an account id and a path, never a password. Emits the command to mint fresh state when needed.',
      inputSchema: z.object({ role: z.string().min(1) }),
    },
    async ({ role }) => {
      try {
        return withConfig((root, config) => {
          assertRoleConfigured(config, role);

          const existing = inspectAuthState(root, config, role);
          const command = prepareAuthCommand(config, role);

          if (existing && !existing.expired) {
            return textResult({ status: 'ready', ...existing });
          }

          return textResult({
            status: existing ? 'expired' : 'missing',
            role,
            ...(existing ?? {}),
            action: 'Run this in the target repository to mint fresh state.',
            ...command,
          });
        });
      } catch (error) {
        return failed(error);
      }
    },
  );

  // ---------------------------------------------------------------- sessions

  server.registerTool(
    'qa_begin_session',
    {
      description:
        'Start an exploration session. Returns a session id used by qa_record_event. Evidence is written under the configured sessions directory, which is gitignored.',
      inputSchema: z.object({
        flow: z.string().min(1),
        requirementSource: z.string().optional(),
        role: z.string().optional(),
        applicationCommit: z.string().optional(),
        browserVersion: z.string().optional(),
        viewport: z.string().optional(),
      }),
    },
    async (input) => {
      try {
        return withConfig((root, config) => {
          const { sessionId, paths } = beginSession(root, config, input);
          return textResult({
            status: 'started',
            sessionId,
            eventsFile: relative(root, paths.events).replace(/\\/g, '/'),
            screenshotsDirectory: relative(root, paths.screenshots).replace(/\\/g, '/'),
            reminder:
              'Record semantic targets, never MCP snapshot refs - a ref is meaningless after the next DOM update.',
          });
        });
      } catch (error) {
        return failed(error);
      }
    },
  );

  server.registerTool(
    'qa_record_event',
    {
      description:
        'Append one event to an exploration session: an action, observation, console message, network result, candidate assertion with its oracle, or a finding. URLs and suspected secrets are redacted at write time.',
      inputSchema: z.object({
        sessionId: z.string().min(1),
        event: SessionEventSchema,
      }),
    },
    async ({ sessionId, event }) => {
      try {
        return withConfig((root, config) => {
          recordEvent(root, config, sessionId, event);
          return textResult({ status: 'recorded', sessionId, type: event.type });
        });
      } catch (error) {
        return failed(error);
      }
    },
  );

  server.registerTool(
    'qa_complete_session',
    {
      description:
        'Close an exploration session and return its summary. Reports whether any candidate assertion lacked a verified oracle, which blocks compiling those assertions into tests.',
      inputSchema: z.object({ sessionId: z.string().min(1) }),
    },
    async ({ sessionId }) => {
      try {
        return withConfig((root, config) => {
          const { metadata, summary } = completeSession(root, config, sessionId);

          return textResult({
            status: 'completed',
            metadata,
            summary,
            ...(summary.blockedByUnverifiedOracle
              ? {
                  warning:
                    `${summary.unverifiedAssertions} candidate assertion(s) have no verified ` +
                    `requirement. Record them under ${config.testing.discoveriesDirectory}/ ` +
                    'and do not compile them into tests.',
                }
              : {}),
          });
        });
      } catch (error) {
        return failed(error);
      }
    },
  );

  server.registerTool(
    'qa_session_summary',
    {
      description: 'Summarise a recorded session without closing it.',
      inputSchema: z.object({ sessionId: z.string().min(1) }),
    },
    async ({ sessionId }) => {
      try {
        return withConfig((root, config) =>
          textResult(summariseSession(root, config, sessionId)),
        );
      } catch (error) {
        return failed(error);
      }
    },
  );

  // ----------------------------------------------------------------- compile

  server.registerTool(
    'qa_compile_scenario',
    {
      description:
        'Validate a structured scenario and compile it into a permanent Playwright test in the target repository. The schema cannot express XPath, CSS or positional selectors, so it cannot emit them.',
      inputSchema: z.object({ scenario: ScenarioSchema }),
    },
    async ({ scenario }) => {
      try {
        return withConfig((root, config) => {
          if (scenario.role) {
            assertRoleConfigured(config, scenario.role);
          }

          const outputPath = join(
            root,
            config.testing.generatedDirectory,
            compiledFileName(scenario),
          );

          mkdirSync(dirname(outputPath), { recursive: true });
          writeFileSync(outputPath, compileScenario(scenario), 'utf8');

          return textResult({
            status: 'compiled',
            outputPath: relative(root, outputPath).replace(/\\/g, '/'),
            requirementSource: scenario.requirementSource,
            role: scenario.role ?? null,
            nextStep: 'qa_validate_generated_tests',
          });
        });
      } catch (error) {
        return failed(error);
      }
    },
  );

  // ---------------------------------------------------------------- validate

  server.registerTool(
    'qa_validate_generated_tests',
    {
      description:
        'Run the full validation gauntlet: static audit, type check, then repeated execution from a clean state. Does not prove the test can fail - perform negative validation separately before promoting.',
      inputSchema: z.object({
        target: z.string().optional(),
        repeatEach: z.number().int().min(1).max(10).optional(),
        project: z.string().optional(),
        typeCheck: z.boolean().default(true),
      }),
    },
    async ({ target, repeatEach, project, typeCheck }) => {
      try {
        return withConfig((root, config) => {
          const safeTarget = assertInsideRepository(
            root,
            target ?? config.testing.generatedDirectory,
          );

          const issues = auditGeneratedTests(join(root, safeTarget));
          if (issues.length > 0) {
            return textResult({ status: 'rejected', stage: 'static-audit', issues }, true);
          }

          if (typeCheck) {
            const types = runTypeCheck(root);
            if (types.exitCode !== 0) {
              return textResult(
                {
                  status: 'rejected',
                  stage: 'type-check',
                  detail: 'A test that does not compile never ran.',
                  stdout: truncate(types.stdout),
                },
                true,
              );
            }
          }

          const run = runPlaywrightTests({
            target: safeTarget,
            repeatEach: repeatEach ?? config.validation.repeatEach,
            project: project ?? config.discovery.viewports[0]?.name ?? 'chromium',
            config: 'playwright.qa.config.ts',
            cwd: root,
          });

          return textResult(
            {
              status: run.exitCode === 0 ? 'passed' : 'failed',
              stage: 'execution',
              exitCode: run.exitCode,
              repeatEach: repeatEach ?? config.validation.repeatEach,
              stdout: truncate(run.stdout),
              stderr: truncate(run.stderr),
              ...(run.exitCode === 0
                ? {
                    nextStep:
                      'Negative validation: break the behaviour this test protects, confirm it FAILS, revert, confirm it PASSES, then verify git status is clean.',
                  }
                : {}),
            },
            run.exitCode !== 0,
          );
        });
      } catch (error) {
        return failed(error);
      }
    },
  );

  server.registerTool(
    'qa_run_playwright_tests',
    {
      description:
        'Run existing tests in the target repository without accepting arbitrary shell commands.',
      inputSchema: z.object({
        target: z.string().optional(),
        repeatEach: z.number().int().min(1).max(10).default(1),
        project: z.string().optional(),
      }),
    },
    async ({ target, repeatEach, project }) => {
      try {
        return withConfig((root, config) => {
          const safeTarget = assertInsideRepository(
            root,
            target ?? config.testing.testDirectory,
          );

          const run = runPlaywrightTests({
            target: safeTarget,
            repeatEach,
            project: project ?? config.discovery.viewports[0]?.name ?? 'chromium',
            config: 'playwright.qa.config.ts',
            cwd: root,
          });

          return textResult(
            {
              status: run.exitCode === 0 ? 'passed' : 'failed',
              exitCode: run.exitCode,
              stdout: truncate(run.stdout),
              stderr: truncate(run.stderr),
            },
            run.exitCode !== 0,
          );
        });
      } catch (error) {
        return failed(error);
      }
    },
  );

  // ----------------------------------------------------------------- promote

  server.registerTool(
    'qa_promote_tests',
    {
      description:
        'Move a validated test from generated to approved. Every gate must be reported as passed, including negative validation - a test that still passes when its behaviour is broken is refused.',
      inputSchema: z.object({
        file: z.string().min(1),
        evidence: z.object({
          auditPassed: z.boolean(),
          typeCheckPassed: z.boolean(),
          repeatedRunsPassed: z.boolean(),
          negativeValidationPerformed: z.boolean(),
          negativeValidationFailedAsExpected: z.boolean(),
          visualBaselinesApproved: z.boolean().default(false),
          usesPersonalCredentials: z.boolean().default(false),
          requirementSourceResolved: z.boolean(),
        }),
      }),
    },
    async ({ file, evidence }) => {
      try {
        return withConfig((root, config) => {
          const result = promoteTest(root, config, file, evidence);
          return textResult(result, !result.promoted);
        });
      } catch (error) {
        return failed(error);
      }
    },
  );

  server.registerTool(
    'qa_list_generated_tests',
    {
      description: 'List generated tests awaiting validation and promotion.',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return withConfig((root, config) =>
          textResult({
            generatedDirectory: config.testing.generatedDirectory,
            files: listGeneratedTests(root, config),
          }),
        );
      } catch (error) {
        return failed(error);
      }
    },
  );

  server.registerTool(
    'qa_config',
    {
      description: `Return the resolved ${CONFIG_FILENAME} for the target repository.`,
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return withConfig((root, config) => textResult({ root, config }));
      } catch (error) {
        return failed(error);
      }
    },
  );

  return server;
});
