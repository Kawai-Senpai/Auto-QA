import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';

import { CONFIG_FILENAME, TargetConfigSchema } from './lib/target-config.js';
import type { TargetConfig } from './lib/target-config.js';
import {
  authAdapterTemplate,
  authTypesTemplate,
  evidenceFixtureTemplate,
  lighthouseConfigTemplate,
  playwrightConfigTemplate,
  prepareAuthStateTemplate,
  qaMissionTemplate,
  seedTemplate,
  targetAgentsTemplate,
} from './lib/templates.js';

/**
 * Bootstrap a target application repository for agent-driven QA.
 *
 * Everything written here belongs to the product, not the engine: its
 * requirements, its scenarios, its generated tests, its evidence. The engine
 * stays reusable precisely because none of that lives inside it.
 *
 * Detection is best-effort and always visible in the emitted config, so a wrong
 * guess is a one-line edit rather than a mystery. Existing files are never
 * overwritten - re-running init on a configured repository must be safe.
 */

interface Detected {
  startCommand: string | undefined;
  buildCommand: string | undefined;
  baseURL: string;
  framework: string;
}

function detect(root: string): Detected {
  const packageJsonPath = resolve(root, 'package.json');

  if (!existsSync(packageJsonPath)) {
    return {
      startCommand: undefined,
      buildCommand: undefined,
      baseURL: 'http://localhost:3000/',
      framework: 'unknown',
    };
  }

  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const scripts = pkg.scripts ?? {};

  const startCommand = scripts.dev
    ? 'npm run dev'
    : scripts.start
      ? 'npm run start'
      : undefined;

  // Default ports differ per framework, and guessing 3000 for everything is the
  // single most common reason a harness cannot reach the application.
  let port = 3000;
  let framework = 'unknown';

  if (deps.vite || scripts.dev?.includes('vite')) {
    framework = 'vite';
    port = 5173;
  } else if (deps.next) {
    framework = 'next';
    port = 3000;
  } else if (deps['@angular/core']) {
    framework = 'angular';
    port = 4200;
  } else if (deps.nuxt) {
    framework = 'nuxt';
    port = 3000;
  } else if (deps['react-scripts']) {
    framework = 'cra';
    port = 3000;
  } else if (deps.svelte) {
    framework = 'svelte';
    port = 5173;
  }

  const explicitPort = scripts.dev?.match(/--port[= ](\d+)/)?.[1];
  if (explicitPort) {
    port = Number.parseInt(explicitPort, 10);
  }

  return {
    startCommand,
    buildCommand: scripts.build ? 'npm run build' : undefined,
    // localhost rather than 127.0.0.1: dev servers commonly bind IPv6 loopback
    // only, and a hardcoded IPv4 host then fails to connect.
    baseURL: `http://localhost:${port}/`,
    framework,
  };
}

/**
 * `--refresh` rewrites engine-owned templates that a newer engine version has
 * changed. It is opt-in because the alternative - overwriting by default -
 * would silently discard hand edits, and never overwriting leaves a target
 * stranded on the templates it was first initialised with.
 *
 * It applies only to files the engine owns. Configuration, requirements,
 * scenarios and tests are the product's and are never touched.
 */
const REFRESH = process.argv.includes('--refresh');

function writeIfAbsent(
  path: string,
  contents: string,
  engineOwned = false,
): 'created' | 'kept' | 'refreshed' {
  if (existsSync(path)) {
    if (!(REFRESH && engineOwned)) {
      return 'kept';
    }

    if (readFileSync(path, 'utf8') === contents) {
      return 'kept';
    }

    writeFileSync(path, contents, 'utf8');
    return 'refreshed';
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, 'utf8');
  return 'created';
}

/**
 * Anything that can impersonate an account, or that captures live page content
 * before redaction has been reviewed, must never reach version control.
 */
const GITIGNORE_ENTRIES = [
  '.env.agent-qa.local',
  '.qa/runtime/',
  '.qa/sessions/',
  'playwright/.auth/',
  'artifacts/',
  '.lighthouseci/',
];

function appendGitignore(root: string, entries: string[]): 'updated' | 'kept' {
  const path = resolve(root, '.gitignore');
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const missing = entries.filter((entry) => !existing.includes(entry));

  if (missing.length === 0) {
    return 'kept';
  }

  const block = [
    '',
    '# Agent QA runtime state and evidence.',
    '# Storage state can impersonate the account it was captured from, and',
    '# session evidence may contain unredacted page content.',
    ...missing,
    '',
  ].join('\n');

  writeFileSync(path, existing.replace(/\s*$/, '\n') + block, 'utf8');
  return 'updated';
}

const targetIndex = process.argv.indexOf('--target');
const targetRoot = resolve(
  targetIndex !== -1 ? (process.argv[targetIndex + 1] ?? '.') : '.',
);

if (!existsSync(targetRoot)) {
  console.error(`Target does not exist: ${targetRoot}`);
  process.exit(1);
}

const detected = detect(targetRoot);

// Reuse an existing config so re-running init never silently reverts hand edits.
const configPath = join(targetRoot, CONFIG_FILENAME);

const config: TargetConfig = existsSync(configPath)
  ? TargetConfigSchema.parse(JSON.parse(readFileSync(configPath, 'utf8')))
  : TargetConfigSchema.parse({
      version: 1,
      application: {
        baseURL: detected.baseURL,
        startCommand: detected.startCommand,
        buildCommand: detected.buildCommand,
        healthURL: detected.baseURL,
        startupTimeoutMs: 120_000,
        seedPath: './',
      },
      scope: { allowedOrigins: [detected.baseURL] },
      requirements: {},
      authentication: {},
      discovery: {},
      evidence: {},
      validation: {},
      accessibility: {},
      visual: {},
      performance: {},
      testing: {},
    });

const results: Record<string, string> = {};

results[CONFIG_FILENAME] = writeIfAbsent(
  configPath,
  JSON.stringify(config, null, 2) + '\n',
);

// Pinned versions, not @latest: an unattended upgrade of the browser-control
// layer should not be able to break a product's QA overnight.
results['.mcp.json'] = writeIfAbsent(
  join(targetRoot, '.mcp.json'),
  JSON.stringify(
    {
      mcpServers: {
        playwright: {
          type: 'stdio',
          command: 'npx',
          args: [
            '-y',
            '@playwright/mcp@0.0.78',
            '--isolated',
            '--caps=testing,storage,network,devtools,vision',
          ],
        },
        'chrome-devtools': {
          type: 'stdio',
          command: 'npx',
          args: ['-y', 'chrome-devtools-mcp@1.6.0', '--isolated'],
        },
        'agent-qa': {
          type: 'stdio',
          command: 'npx',
          args: ['--no-install', 'agent-qa-mcp', '--target', '.'],
        },
      },
    },
    null,
    2,
  ) + '\n',
);

for (const directory of [
  config.testing.requirementsDirectory,
  config.testing.scenariosDirectory,
  config.testing.defectsDirectory,
  config.testing.discoveriesDirectory,
  config.testing.generatedDirectory,
  config.testing.approvedDirectory,
  config.testing.visualDirectory,
  config.evidence.sessionsDirectory,
  config.testing.reportsDirectory,
  'qa',
  'scripts/qa',
]) {
  const absolute = join(targetRoot, directory);
  mkdirSync(absolute, { recursive: true });
  writeIfAbsent(join(absolute, '.gitkeep'), '');
  results[directory + '/'] = 'ensured';
}

// The runnable pieces. These live in the target so its tests execute with the
// plain Playwright runner - no engine, no MCP, no model - which is the whole
// point of externalising the tests into files.
const files: Array<[string, string]> = [
  [join(config.testing.testDirectory, 'fixtures.ts'), evidenceFixtureTemplate(config)],
  [join(config.testing.testDirectory, 'seed.spec.ts'), seedTemplate()],
  ['playwright.qa.config.ts', playwrightConfigTemplate(config)],
  ['.agent/QA_MISSION.md', qaMissionTemplate(config)],
  ['AGENTS.md', targetAgentsTemplate(config)],
  ['qa/auth.types.ts', authTypesTemplate()],
  ['qa/auth.adapter.ts', authAdapterTemplate()],
  ['scripts/qa/prepare-auth-state.ts', prepareAuthStateTemplate(config)],
];

if (config.performance.enabled) {
  files.push([config.performance.configPath.replace(/^\.\//, ''), lighthouseConfigTemplate(config)]);
}

// The auth adapter is a stub the target is expected to implement, so it is
// never refreshed - that would delete the only part someone had to write.
const PRODUCT_OWNED = new Set(['qa/auth.adapter.ts', 'AGENTS.md']);

for (const [relativePath, contents] of files) {
  results[relativePath] = writeIfAbsent(
    join(targetRoot, relativePath),
    contents,
    !PRODUCT_OWNED.has(relativePath),
  );
}

results['.gitignore'] = appendGitignore(targetRoot, GITIGNORE_ENTRIES);

console.log(
  JSON.stringify(
    {
      status: 'initialised',
      target: targetRoot,
      detectedFramework: detected.framework,
      baseURL: config.application.baseURL,
      startCommand: config.application.startCommand ?? null,
      roles: config.authentication.roles,
      results,
      nextSteps: [
        `Review ${CONFIG_FILENAME}. Detection is a guess, not a contract.`,
        'Implement qa/auth.adapter.ts for this application - there is no universal test-user protocol.',
        'Approve the project MCP servers in your coding client (/mcp in Claude Code), then restart the session.',
        `Write a requirement under ${config.testing.requirementsDirectory}/ before generating any test.`,
        'Then tell your agent: Execute .agent/QA_MISSION.md',
      ],
    },
    null,
    2,
  ),
);
