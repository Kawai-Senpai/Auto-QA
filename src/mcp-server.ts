import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';

import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod';

import { auditGeneratedTests, runPlaywrightTests } from './lib/audit.js';
import { compileScenario } from './lib/compiler.js';
import { ScenarioSchema } from './lib/scenario.js';

/**
 * The QA harness MCP server.
 *
 * It deliberately exposes no generic shell tool. Browser-controlled content
 * reaching a shell is remote code execution, and every capability here is a
 * narrow, typed operation instead.
 */

function textResult(value: unknown, isError = false) {
  return {
    isError,
    content: [
      { type: 'text' as const, text: JSON.stringify(value, null, 2) },
    ],
  };
}

function generatedTestPath(scenarioId: string): string {
  return resolve('tests', 'generated', `${scenarioId}.spec.ts`);
}

/**
 * Keep tool-supplied paths inside the repository. The scenario id is already
 * pattern-restricted, but audit and run targets are free-form strings and must
 * not be able to reach arbitrary parts of the filesystem.
 */
function assertInsideRepository(target: string): string {
  const root = process.cwd();
  const absolute = resolve(root, target);
  const relativePath = relative(root, absolute);

  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(
      `Target must stay inside the repository. Rejected: ${target}`,
    );
  }

  return target;
}

function truncate(value: string, limit = 30_000): string {
  if (value.length <= limit) {
    return value;
  }

  return [
    value.slice(0, limit),
    '',
    `[Output truncated after ${limit} characters]`,
  ].join('\n');
}

serveStdio(() => {
  const server = new McpServer({
    name: 'auto-qa',
    version: '0.1.0',
  });

  server.registerTool(
    'qa_compile_scenario',
    {
      description:
        'Validate a structured frontend scenario and compile it into a permanent Playwright test under tests/generated.',
      inputSchema: z.object({ scenario: ScenarioSchema }),
    },
    async ({ scenario }) => {
      const outputPath = generatedTestPath(scenario.id);

      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, compileScenario(scenario), 'utf8');

      return textResult({
        status: 'compiled',
        outputPath,
        requirementSource: scenario.requirementSource,
      });
    },
  );

  server.registerTool(
    'qa_audit_generated_tests',
    {
      description:
        'Reject brittle or weakened generated tests and optionally run accepted tests repeatedly.',
      inputSchema: z.object({
        target: z.string().default('tests/generated'),
        repeatEach: z.number().int().min(1).max(10).default(3),
        project: z.enum(['chromium', 'mobile-chrome']).default('chromium'),
        execute: z.boolean().default(true),
      }),
    },
    async ({ target, repeatEach, project, execute }) => {
      let safeTarget: string;

      try {
        safeTarget = assertInsideRepository(target);
      } catch (error) {
        return textResult({ status: 'rejected', error: String(error) }, true);
      }

      const issues = auditGeneratedTests(safeTarget);

      if (issues.length > 0) {
        return textResult({ status: 'rejected', issues }, true);
      }

      if (!execute) {
        return textResult({
          status: 'static-audit-passed',
          target: safeTarget,
        });
      }

      const run = runPlaywrightTests({
        target: safeTarget,
        repeatEach,
        project,
      });

      return textResult(
        {
          status: run.exitCode === 0 ? 'passed' : 'failed',
          exitCode: run.exitCode,
          repeatEach,
          project,
          stdout: truncate(run.stdout),
          stderr: truncate(run.stderr),
        },
        run.exitCode !== 0,
      );
    },
  );

  server.registerTool(
    'qa_run_playwright_tests',
    {
      description:
        'Run an existing Playwright test file or directory without accepting arbitrary shell commands.',
      inputSchema: z.object({
        target: z.string().default('tests'),
        repeatEach: z.number().int().min(1).max(10).default(1),
        project: z.enum(['chromium', 'mobile-chrome']).default('chromium'),
      }),
    },
    async ({ target, repeatEach, project }) => {
      let safeTarget: string;

      try {
        safeTarget = assertInsideRepository(target);
      } catch (error) {
        return textResult({ status: 'rejected', error: String(error) }, true);
      }

      const run = runPlaywrightTests({
        target: safeTarget,
        repeatEach,
        project,
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
    },
  );

  return server;
});
