import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * Static guardrails against the ways generated tests usually rot.
 *
 * This is not a verifier. It cannot tell whether an assertion reflects a real
 * requirement. What it does catch is the mechanical decay - brittle selectors,
 * sleeps, skipped tests, tautologies - that turns a generated suite into a slow
 * suite everyone ignores.
 */

export interface AuditIssue {
  file: string;
  rule: string;
  message: string;
}

export interface TestRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const prohibitedPatterns: Array<{
  rule: string;
  pattern: RegExp;
  message: string;
}> = [
  {
    rule: 'no-fixed-sleep',
    pattern: /\.waitForTimeout\s*\(/,
    message:
      'Do not use waitForTimeout(). Wait for observable application state.',
  },
  {
    rule: 'no-skipped-tests',
    pattern: /\btest\.(skip|fixme)\s*\(/,
    message: 'Generated tests may not silently skip failures.',
  },
  {
    rule: 'no-only-tests',
    pattern: /\btest\.only\s*\(/,
    message: 'Generated tests may not commit test.only().',
  },
  {
    rule: 'no-nth-selector',
    pattern: /\.nth\s*\(/,
    message:
      'nth() is coupled to DOM ordering. Use a semantic locator instead.',
  },
  {
    rule: 'no-xpath-selector',
    pattern: /xpath\s*=/i,
    message: 'XPath selectors are prohibited in generated tests.',
  },
  {
    rule: 'no-raw-css-locator',
    pattern: /page\.locator\s*\(/,
    message:
      'Generated tests must use role, label, text or test-ID locators.',
  },
  {
    rule: 'no-trivial-assertion',
    pattern: /expect\s*\(\s*true\s*\)\s*\.toBe\s*\(\s*true\s*\)/,
    message: 'A tautology does not test application behaviour.',
  },
  {
    rule: 'no-weak-truthiness',
    pattern: /\.toBeTruthy\s*\(/,
    message:
      'Assert the exact required state instead of generic truthiness.',
  },
];

function collectFiles(path: string): string[] {
  const absolutePath = resolve(path);

  if (!existsSync(absolutePath)) {
    return [];
  }

  const stats = statSync(absolutePath);

  if (stats.isFile()) {
    return extname(absolutePath) === '.ts' ? [absolutePath] : [];
  }

  return readdirSync(absolutePath).flatMap((entry) =>
    collectFiles(resolve(absolutePath, entry)),
  );
}

export function auditGeneratedTests(root = 'tests/generated'): AuditIssue[] {
  const files = collectFiles(root);
  const issues: AuditIssue[] = [];

  for (const file of files) {
    const source = readFileSync(file, 'utf8');

    if (!/\bexpect\s*(?:\.poll)?\s*\(/.test(source)) {
      issues.push({
        file,
        rule: 'requires-assertion',
        message: 'Generated test file contains no assertion.',
      });
    }

    // Every generated test records where its expectations came from. A missing
    // header means the scenario bypassed the compiler, so the requirement trail
    // is broken even if the test itself looks reasonable.
    if (!/^\/\/ Generated from requirement: \S/m.test(source)) {
      issues.push({
        file,
        rule: 'requires-requirement-source',
        message:
          'Generated test does not name the requirement its assertions came from.',
      });
    }

    for (const prohibited of prohibitedPatterns) {
      if (prohibited.pattern.test(source)) {
        issues.push({
          file,
          rule: prohibited.rule,
          message: prohibited.message,
        });
      }
    }
  }

  return issues;
}

export function runPlaywrightTests(options: {
  target?: string;
  repeatEach?: number;
  project?: string;
}): TestRunResult {
  const target = options.target ?? 'tests/generated';
  const repeatEach = options.repeatEach ?? 3;
  const project = options.project ?? 'chromium';

  // Spawn the Playwright CLI with the current Node binary rather than going
  // through npx. Node refuses to spawn .cmd shims without shell: true on
  // Windows, and enabling a shell here would pass a caller-supplied target
  // through command parsing - an injection route the MCP tool must not have.
  const result = spawnSync(
    process.execPath,
    [
      require.resolve('@playwright/test/cli'),
      'test',
      target,
      `--project=${project}`,
      `--repeat-each=${repeatEach}`,
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      encoding: 'utf8',
      stdio: 'pipe',
      maxBuffer: 20 * 1024 * 1024,
    },
  );

  return {
    exitCode: typeof result.status === 'number' ? result.status : 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? result.error?.message ?? '',
  };
}
