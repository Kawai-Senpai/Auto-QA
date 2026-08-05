import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

import type { TargetConfig } from './target-config.js';
import { resolveInTarget } from './target-config.js';

/**
 * Repository reconnaissance.
 *
 * Reports what the repository *contains* - routes, scripts, roles, existing
 * tests. It deliberately does not report what the application *should do*: that
 * comes from requirements, and conflating the two is how an agent ends up
 * treating the current implementation as the specification.
 */

export interface PreflightCapability {
  name: string;
  available: boolean;
  detail: string;
}

export interface PreflightReport {
  targetRoot: string;
  ready: boolean;
  capabilities: PreflightCapability[];
  blockers: string[];
}

export function preflight(
  root: string,
  config: TargetConfig,
): PreflightReport {
  const has = (relativePath: string) => existsSync(join(root, relativePath));

  const capabilities: PreflightCapability[] = [
    {
      name: 'playwright-runner',
      available: has('node_modules/@playwright/test'),
      detail: 'npm install --save-dev @playwright/test@1.62.1',
    },
    {
      name: 'playwright-config',
      available: has('playwright.qa.config.ts'),
      detail: 'Written by agent-qa init.',
    },
    {
      name: 'evidence-fixture',
      available: has(join(config.testing.testDirectory, 'fixtures.ts')),
      detail: 'Console, page-error and network capture for permanent tests.',
    },
    {
      name: 'seed-test',
      available: has(join(config.testing.testDirectory, 'seed.spec.ts')),
      detail: 'Proves the environment before exploration.',
    },
    {
      name: 'requirements',
      available:
        existsSync(join(root, config.testing.requirementsDirectory)) &&
        readdirSync(join(root, config.testing.requirementsDirectory)).some(
          (entry) => entry.endsWith('.md'),
        ),
      detail:
        `No requirement documents in ${config.testing.requirementsDirectory}. ` +
        'Without an oracle, generated assertions would encode current behaviour.',
    },
    {
      name: 'auth-adapter',
      available: has('qa/auth.adapter.ts'),
      detail: 'Required only for authenticated flows. Must be implemented per application.',
    },
    {
      name: 'accessibility-scanner',
      available: has('node_modules/@axe-core/playwright'),
      detail: 'npm install --save-dev @axe-core/playwright',
    },
    {
      name: 'performance-auditor',
      available: config.performance.enabled ? has('node_modules/@lhci/cli') : true,
      detail: config.performance.enabled
        ? 'npm install --save-dev @lhci/cli'
        : 'Disabled in configuration.',
    },
    {
      name: 'mcp-configuration',
      available: has('.mcp.json'),
      detail: 'Servers must also be approved in the coding client, then the session restarted.',
    },
  ];

  // Only genuinely blocking capabilities gate the run. An auth adapter is not
  // needed for public flows, and stopping on it would block real work.
  const required = new Set([
    'playwright-runner',
    'playwright-config',
    'evidence-fixture',
    'seed-test',
    'requirements',
  ]);

  const blockers = capabilities
    .filter((capability) => required.has(capability.name) && !capability.available)
    .map((capability) => `${capability.name}: ${capability.detail}`);

  return {
    targetRoot: root,
    ready: blockers.length === 0,
    capabilities,
    blockers,
  };
}

export interface ApplicationMap {
  framework: string;
  packageManager: string;
  scripts: Record<string, string>;
  routes: string[];
  authIndicators: string[];
  existingTests: string[];
  designSystemHints: string[];
  notes: string[];
}

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte']);
const SKIP_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  'artifacts',
  '.qa',
]);

export function discoverApplication(
  root: string,
  config: TargetConfig,
): ApplicationMap {
  const packageJsonPath = join(root, 'package.json');
  const pkg = existsSync(packageJsonPath)
    ? (JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      })
    : {};

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  const framework = deps.next
    ? 'next'
    : deps['@angular/core']
      ? 'angular'
      : deps.nuxt
        ? 'nuxt'
        : deps.vite
          ? 'vite'
          : 'unknown';

  const sourceFiles = collectSourceFiles(join(root, 'src'), root);

  return {
    framework,
    packageManager: existsSync(join(root, 'pnpm-lock.yaml'))
      ? 'pnpm'
      : existsSync(join(root, 'yarn.lock'))
        ? 'yarn'
        : 'npm',
    scripts: pkg.scripts ?? {},
    routes: extractRoutes(root, sourceFiles),
    authIndicators: sourceFiles.filter((file) =>
      /auth|login|sign-?in|session|protected|guard/i.test(file),
    ),
    existingTests: collectSourceFiles(join(root, config.testing.testDirectory), root),
    designSystemHints: [
      'tailwind.config.js',
      'tailwind.config.ts',
      'theme.ts',
      'tokens.json',
      'BRAND.md',
      'DESIGN.md',
    ].filter((candidate) => existsSync(join(root, candidate))),
    notes: [
      'Routes are extracted textually and may be incomplete. Verify against the router.',
      'This map describes what the repository contains, not what it should do. ' +
        'Expected behaviour comes from requirements.',
    ],
  };
}

function collectSourceFiles(directory: string, root: string, depth = 0): string[] {
  if (depth > 8 || !existsSync(directory)) {
    return [];
  }

  const entries: string[] = [];

  for (const entry of readdirSync(directory)) {
    if (SKIP_DIRECTORIES.has(entry)) {
      continue;
    }

    const absolute = join(directory, entry);

    try {
      if (statSync(absolute).isDirectory()) {
        entries.push(...collectSourceFiles(absolute, root, depth + 1));
      } else if (SOURCE_EXTENSIONS.has(extname(absolute))) {
        entries.push(relative(root, absolute).replace(/\\/g, '/'));
      }
    } catch {
      // Unreadable entries are skipped rather than aborting discovery.
    }
  }

  return entries;
}

/**
 * Route paths, read from the router rather than from the rendered navigation.
 *
 * A link in the UI proves someone put a link there. The route table is the
 * contract the application actually serves, which makes it a valid oracle for
 * navigation requirements.
 */
function extractRoutes(root: string, sourceFiles: string[]): string[] {
  const routes = new Set<string>();
  const candidates = sourceFiles.filter((file) =>
    /router|routes|app\.(t|j)sx?$/i.test(file),
  );

  for (const file of candidates.slice(0, 20)) {
    try {
      const source = readFileSync(join(root, file), 'utf8');

      for (const match of source.matchAll(/path\s*[:=]\s*["'`](\/[^"'`]*)["'`]/g)) {
        if (match[1]) routes.add(match[1]);
      }
      for (const match of source.matchAll(/<Route\s+path=["'`](\/[^"'`]*)["'`]/g)) {
        if (match[1]) routes.add(match[1]);
      }
    } catch {
      // Skip unreadable files.
    }
  }

  return [...routes].sort();
}
