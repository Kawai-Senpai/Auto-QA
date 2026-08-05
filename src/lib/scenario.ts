import * as z from 'zod';

/**
 * The framework-neutral representation of a test, sitting between "the agent
 * clicked around" and permanent Playwright code.
 *
 * Generating code directly from each click produces duplicated, unreviewable
 * output. Going through this shape instead makes scenarios reviewable before
 * compilation, lets selectors and assertions be improved in one place, and
 * keeps the requirement that justified each test attached to it.
 */

const RoleSchema = z.enum([
  'alert',
  'button',
  'checkbox',
  'combobox',
  'dialog',
  'heading',
  'img',
  'link',
  'list',
  'listitem',
  'option',
  'radio',
  'searchbox',
  'status',
  'switch',
  'tab',
  'textbox',
]);

/**
 * Scopes a target to a landmark or container, by role and accessible name.
 *
 * Real pages repeat the same link text in a header and a footer, so an
 * unscoped `getByRole('link', { name: 'Models' })` matches twice and Playwright
 * fails on strict mode. The tempting fixes - `.first()` or `.nth(0)` - reduce
 * the assertion to "one of these exists somewhere", which is exactly the
 * weakening this harness is meant to prevent. Scoping keeps the assertion
 * specific about which navigation is under test.
 */
const WithinSchema = z.object({
  role: RoleSchema.or(z.enum(['banner', 'navigation', 'main', 'contentinfo', 'region', 'form'])),
  name: z.string().min(1).optional(),
});

/**
 * Only user-facing locators are expressible. This is deliberate: a schema that
 * cannot represent an XPath or a DOM-position selector cannot emit one, which
 * is a stronger guarantee than asking an agent nicely in a prompt.
 */
export const TargetSchema = z.discriminatedUnion('by', [
  z.object({
    by: z.literal('role'),
    role: RoleSchema,
    name: z.string().min(1),
    exact: z.boolean().optional(),
    within: WithinSchema.optional(),
  }),
  z.object({
    by: z.literal('label'),
    label: z.string().min(1),
    exact: z.boolean().optional(),
    within: WithinSchema.optional(),
  }),
  z.object({
    by: z.literal('text'),
    text: z.string().min(1),
    exact: z.boolean().optional(),
    within: WithinSchema.optional(),
  }),
  z.object({
    by: z.literal('testId'),
    testId: z.string().min(1),
    within: WithinSchema.optional(),
  }),
]);

export const StepSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('goto'), path: z.string().min(1) }),
  z.object({ action: z.literal('click'), target: TargetSchema }),
  z.object({
    action: z.literal('fill'),
    target: TargetSchema,
    value: z.string(),
  }),
  z.object({
    action: z.literal('press'),
    target: TargetSchema,
    key: z.string().min(1),
  }),
  z.object({ action: z.literal('check'), target: TargetSchema }),
  z.object({ action: z.literal('uncheck'), target: TargetSchema }),
  z.object({ action: z.literal('hover'), target: TargetSchema }),
  z.object({
    action: z.literal('select'),
    target: TargetSchema,
    value: z.string(),
  }),

  /** Keyboard-only navigation, for focus order and reachability checks. */
  z.object({ action: z.literal('keyboard'), key: z.string().min(1) }),

  /**
   * Advance virtual time instead of waiting.
   *
   * Session expiry, inactivity logout, countdowns and scheduled behaviour are
   * otherwise untestable without a real-time sleep, which the auditor rejects
   * and which would make the suite unusably slow.
   */
  z.object({
    action: z.literal('advanceClock'),
    duration: z.string().min(1).describe('e.g. "05:00" or "30:00"'),
  }),

  /** Re-run the flow at a different viewport without duplicating the scenario. */
  z.object({
    action: z.literal('setViewport'),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
]);

export const AssertionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('visible'), target: TargetSchema }),
  z.object({ type: z.literal('hidden'), target: TargetSchema }),
  z.object({
    type: z.literal('containsText'),
    target: TargetSchema,
    text: z.string(),
  }),
  z.object({
    type: z.literal('value'),
    target: TargetSchema,
    value: z.string(),
  }),
  z.object({ type: z.literal('checked'), target: TargetSchema }),
  z.object({ type: z.literal('unchecked'), target: TargetSchema }),
  z.object({
    type: z.literal('count'),
    target: TargetSchema,
    count: z.number().int().min(0),
  }),
  z.object({ type: z.literal('urlPath'), path: z.string().min(1) }),
  // Network assertions exist because a frontend can show a success toast while
  // having sent the wrong request, or no request at all.
  z.object({
    type: z.literal('requestSeen'),
    method: z
      .string()
      .min(1)
      .transform((value) => value.toUpperCase()),
    urlIncludes: z.string().min(1),
  }),
  z.object({
    type: z.literal('requestAbsent'),
    method: z
      .string()
      .min(1)
      .transform((value) => value.toUpperCase()),
    urlIncludes: z.string().min(1),
  }),
  z.object({ type: z.literal('axe'), tags: z.array(z.string()).optional() }),

  /**
   * Pixel comparison against a committed baseline.
   *
   * A baseline is an approval, not a recording of whatever rendered today, so
   * the first run of a visual assertion must be reviewed by a human before the
   * snapshot is committed. Animations are disabled and the caret hidden because
   * otherwise the diff is dominated by noise nobody cares about.
   */
  z.object({
    type: z.literal('screenshot'),
    name: z.string().min(1),
    fullPage: z.boolean().default(true),
    maxDiffPixelRatio: z.number().min(0).max(1).optional(),
    /** Selectors to blank out: clocks, ads, random data, avatars. */
    mask: z.array(TargetSchema).default([]),
  }),

  /**
   * Structural comparison of the accessibility tree.
   *
   * Cheaper and far more stable than a screenshot, and it fails for reasons a
   * human can read: a heading that lost its level, a control that lost its
   * name. Prefer this over a pixel diff whenever the question is structural.
   */
  z.object({
    type: z.literal('ariaSnapshot'),
    snapshot: z.string().min(1),
    target: TargetSchema.optional(),
  }),

  /** Element is present in the DOM but not visible - distinct from absent. */
  z.object({ type: z.literal('attached'), target: TargetSchema }),
  z.object({ type: z.literal('detached'), target: TargetSchema }),

  z.object({ type: z.literal('enabled'), target: TargetSchema }),
  z.object({ type: z.literal('disabled'), target: TargetSchema }),

  /** Keyboard reachability: the named control must hold focus. */
  z.object({ type: z.literal('focused'), target: TargetSchema }),
]);

export const ScenarioSchema = z.object({
  id: z
    .string()
    .regex(
      /^[a-z0-9][a-z0-9-]*$/,
      'Use lowercase letters, numbers and hyphens',
    ),

  name: z.string().min(3),

  /**
   * Where the expected result came from. An agent can observe what happened but
   * cannot know what should have happened, so a scenario without a stated
   * source is how a current bug becomes a permanent regression test.
   */
  requirementSource: z.string().min(1),

  startPath: z.string().min(1).default('/'),

  /**
   * Role whose stored authentication state the test loads.
   *
   * Omitted means unauthenticated. Naming a role compiles to a storage-state
   * load rather than logging in through the UI on every test - which is slow,
   * couples every test to the login form, and turns one login change into a
   * hundred failures.
   */
  role: z.string().min(1).optional(),

  /**
   * Replay recorded network traffic instead of reaching a real service.
   *
   * For deterministic third-party dependencies, not as a substitute for
   * integration testing your own API.
   */
  har: z
    .object({
      path: z.string().min(1),
      urlPattern: z.string().min(1).default('**/api/**'),
      notFound: z.enum(['abort', 'fallback']).default('abort'),
    })
    .optional(),

  /** Fixed starting time, so date-dependent rendering is reproducible. */
  clockStart: z.string().optional(),

  steps: z.array(StepSchema),

  assertions: z
    .array(AssertionSchema)
    .min(1, 'A test without assertions is not a test'),
});

export type Target = z.infer<typeof TargetSchema>;
export type Step = z.infer<typeof StepSchema>;
export type Assertion = z.infer<typeof AssertionSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;
