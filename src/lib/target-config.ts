import { existsSync, readFileSync } from 'node:fs';
import { resolve, isAbsolute, relative } from 'node:path';
import * as z from 'zod';

/**
 * Where the engine ends and a product begins.
 *
 * This repository is the machinery: schema, compiler, auditor, MCP server. It
 * holds no product's tests. Each target application keeps its own requirements,
 * scenarios, generated tests and evidence, because those are facts about that
 * product and belong under its own review and history.
 *
 * agent-qa.config.json lives in the target repository and tells the engine
 * where those directories are and how to start the application.
 */

export const TargetConfigSchema = z.object({
  version: z.literal(1),

  application: z.object({
    baseURL: z.string().min(1),
    startCommand: z.string().optional(),
    healthURL: z.string().optional(),
    startupTimeoutMs: z.number().int().positive().default(120_000),
    // Relative, so an app served from a sub-path resolves against the full
    // baseURL instead of replacing its path.
    seedPath: z.string().default('./'),
    seedHeading: z.string().optional(),
  }),

  testing: z.object({
    testDirectory: z.string().default('tests/e2e'),
    generatedDirectory: z.string().default('tests/e2e/generated'),
    approvedDirectory: z.string().default('tests/e2e/approved'),
    requirementsDirectory: z.string().default('specs/qa/requirements'),
    scenariosDirectory: z.string().default('specs/qa/scenarios'),
    defectsDirectory: z.string().default('specs/qa/defects'),
  }),

  capture: z.object({
    sessionDirectory: z.string().default('.qa/sessions'),
    screenshots: z.boolean().default(true),
    trace: z.boolean().default(true),
    video: z.boolean().default(false),
    network: z.boolean().default(true),
    console: z.boolean().default(true),
  }),

  browser: z.object({
    default: z.enum(['chromium', 'mobile-chrome']).default('chromium'),
    isolated: z.boolean().default(true),
    visionFallback: z.boolean().default(true),
  }),

  validation: z.object({
    repeatEach: z.number().int().min(1).max(10).default(3),
    rejectFixedTimeouts: z.boolean().default(true),
    rejectXPath: z.boolean().default(true),
    rejectRawCssSelectors: z.boolean().default(true),
    requireRequirementSource: z.boolean().default(true),
  }),
});

export type TargetConfig = z.infer<typeof TargetConfigSchema>;

export const CONFIG_FILENAME = 'agent-qa.config.json';

export interface LoadedTargetConfig {
  root: string;
  config: TargetConfig;
}

/**
 * Resolve a path inside the target repository, refusing anything that escapes
 * it. Config values are attacker-adjacent once an agent can propose them, so
 * "../../etc" must not become a writable destination.
 */
export function resolveInTarget(root: string, candidate: string): string {
  const absolute = resolve(root, candidate);
  const relativePath = relative(root, absolute);

  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(
      `Path must stay inside the target repository. Rejected: ${candidate}`,
    );
  }

  return absolute;
}

export function loadTargetConfig(targetRoot: string): LoadedTargetConfig {
  const root = resolve(targetRoot);
  const configPath = resolve(root, CONFIG_FILENAME);

  if (!existsSync(configPath)) {
    throw new Error(
      `No ${CONFIG_FILENAME} in ${root}. Run: agent-qa init --target ${root}`,
    );
  }

  const parsed = TargetConfigSchema.safeParse(
    JSON.parse(readFileSync(configPath, 'utf8')),
  );

  if (!parsed.success) {
    throw new Error(
      `${CONFIG_FILENAME} is invalid:\n${JSON.stringify(parsed.error.issues, null, 2)}`,
    );
  }

  return { root, config: parsed.data };
}
