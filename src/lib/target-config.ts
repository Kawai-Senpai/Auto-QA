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
 * where those directories are, how to start the application, what it is allowed
 * to touch, and which gates a test must clear before promotion.
 */

const ViewportSchema = z.object({
  name: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const TargetConfigSchema = z.object({
  version: z.literal(1),

  application: z.object({
    baseURL: z.string().min(1),
    startCommand: z.string().optional(),
    buildCommand: z.string().optional(),
    healthURL: z.string().optional(),
    startupTimeoutMs: z.number().int().positive().default(120_000),
    // Relative, so an app served from a sub-path resolves against the full
    // baseURL instead of replacing its path.
    seedPath: z.string().default('./'),
    seedHeading: z.string().optional(),
    /** Optional command that returns the application to a known data state. */
    resetTestDataCommand: z.string().optional(),
  }),

  /**
   * The blast radius. An agent driving a browser with a real session can spend
   * money, delete records and email customers, so the boundary is configuration
   * rather than a sentence in a prompt.
   */
  scope: z.object({
    allowedOrigins: z.array(z.string().min(1)).default([]),
    productionForbidden: z.boolean().default(true),
    destructiveActionsRequireApproval: z.boolean().default(true),
    /** Substrings that mark an origin as production regardless of allowlisting. */
    productionHostPatterns: z
      .array(z.string().min(1))
      .default(['prod', 'www.', 'api.']),
  }).prefault({}),

  requirements: z.object({
    roots: z.array(z.string().min(1)).default(['specs/qa/requirements']),
    /**
     * When false, an assertion may not be justified by "this is what the app
     * currently does". That is the single rule preventing today's bugs from
     * becoming tomorrow's passing regression tests.
     */
    allowObservedBehaviorAsOracle: z.boolean().default(false),
  }).prefault({}),

  authentication: z.object({
    /** Target-implemented adapter. There is no universal user-creation protocol. */
    adapter: z.string().optional(),
    roles: z.array(z.string().min(1)).default(['guest']),
    stateDirectory: z.string().default('.qa/runtime/auth'),
    leaseDirectory: z.string().default('.qa/runtime/leases'),
    /** Re-provision state older than this rather than debugging a stale session. */
    stateMaxAgeMinutes: z.number().int().positive().default(60),
  }).prefault({}),

  discovery: z.object({
    maximumRoutes: z.number().int().positive().default(60),
    maximumActionsPerRoute: z.number().int().positive().default(30),
    maximumDepth: z.number().int().positive().default(4),
    viewports: z
      .array(ViewportSchema)
      .default([
        { name: 'desktop', width: 1440, height: 900 },
        { name: 'mobile', width: 390, height: 844 },
      ]),
  }).prefault({}),

  evidence: z.object({
    sessionsDirectory: z.string().default('.qa/sessions'),
    screenshots: z.boolean().default(true),
    traces: z.boolean().default(true),
    videos: z.enum(['off', 'on-failure', 'on']).default('on-failure'),
    console: z.boolean().default(true),
    network: z.boolean().default(true),
    /**
     * Off by default. Capturing bodies is how authorization tokens and personal
     * data end up in a committed test report.
     */
    captureBodies: z.boolean().default(false),
    redactHeaders: z
      .array(z.string().min(1))
      .default(['authorization', 'cookie', 'set-cookie', 'x-api-key']),
  }).prefault({}),

  validation: z.object({
    repeatEach: z.number().int().min(1).max(10).default(3),
    rejectFixedTimeouts: z.boolean().default(true),
    rejectXPath: z.boolean().default(true),
    rejectRawCssSelectors: z.boolean().default(true),
    rejectSkippedTests: z.boolean().default(true),
    requireRequirementSource: z.boolean().default(true),
    failOnPageErrors: z.boolean().default(true),
    failOnUnexpectedConsoleErrors: z.boolean().default(true),
    failOnFirstPartyRequestFailures: z.boolean().default(true),
    failOnHttpStatuses: z
      .array(z.number().int())
      .default([500, 501, 502, 503, 504]),
    /**
     * Console noise that predates the harness. An allowlist is honest; silently
     * ignoring every console error is not.
     */
    consoleAllowlist: z.array(z.string()).default([]),
  }).prefault({}),

  accessibility: z.object({
    enabled: z.boolean().default(true),
    axeTags: z
      .array(z.string().min(1))
      .default(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']),
  }).prefault({}),

  visual: z.object({
    enabled: z.boolean().default(true),
    /** A baseline is an approval, not a recording of whatever rendered today. */
    requireBaselineApproval: z.boolean().default(true),
    aiReviewMode: z.enum(['off', 'advisory', 'blocking']).default('advisory'),
    animations: z.enum(['disabled', 'allow']).default('disabled'),
    hideCaret: z.boolean().default(true),
    maxDiffPixelRatio: z.number().min(0).max(1).default(0.01),
  }).prefault({}),

  performance: z.object({
    enabled: z.boolean().default(false),
    lighthouseRuns: z.number().int().min(1).max(10).default(3),
    configPath: z.string().default('./lighthouserc.cjs'),
    criticalRoutes: z.array(z.string()).default([]),
  }).prefault({}),

  testing: z.object({
    testDirectory: z.string().default('tests/e2e'),
    generatedDirectory: z.string().default('tests/e2e/generated'),
    approvedDirectory: z.string().default('tests/e2e/approved'),
    visualDirectory: z.string().default('tests/e2e/visual'),
    fixturesDirectory: z.string().default('tests/e2e/fixtures'),
    requirementsDirectory: z.string().default('specs/qa/requirements'),
    scenariosDirectory: z.string().default('specs/qa/scenarios'),
    defectsDirectory: z.string().default('specs/qa/defects'),
    discoveriesDirectory: z.string().default('specs/qa/discoveries'),
    reportsDirectory: z.string().default('artifacts'),
  }).prefault({}),
});

export type TargetConfig = z.infer<typeof TargetConfigSchema>;
export type Viewport = z.infer<typeof ViewportSchema>;

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

/**
 * Refuse an origin the configuration has not approved.
 *
 * Called before any browser navigation the engine initiates. A prompt telling
 * an agent to avoid production is guidance; this is the enforcement, because an
 * authenticated browser session can spend money and delete records.
 */
export function assertOriginAllowed(
  config: TargetConfig,
  candidateURL: string,
): void {
  let origin: string;
  let hostname: string;

  try {
    const parsed = new URL(candidateURL);
    origin = parsed.origin;
    hostname = parsed.hostname;
  } catch {
    throw new Error(`Not a valid URL: ${candidateURL}`);
  }

  const allowed = config.scope.allowedOrigins.length
    ? config.scope.allowedOrigins
    : [config.application.baseURL];

  const permitted = allowed.some((entry) => {
    try {
      return new URL(entry).origin === origin;
    } catch {
      return false;
    }
  });

  if (!permitted) {
    throw new Error(
      `Origin is not in scope.allowedOrigins: ${origin}. ` +
        `Allowed: ${allowed.join(', ')}`,
    );
  }

  if (config.scope.productionForbidden) {
    const looksProduction =
      config.scope.productionHostPatterns.some((pattern) =>
        hostname.includes(pattern),
      ) && !isLoopback(hostname);

    if (looksProduction) {
      throw new Error(
        `Refusing to drive what looks like production: ${hostname}. ` +
          `Set scope.productionForbidden to false only for an approved ` +
          `production-safe environment.`,
      );
    }
  }
}

function isLoopback(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost')
  );
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
