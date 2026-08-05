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

  steps: z.array(StepSchema),

  assertions: z
    .array(AssertionSchema)
    .min(1, 'A test without assertions is not a test'),
});

export type Target = z.infer<typeof TargetSchema>;
export type Step = z.infer<typeof StepSchema>;
export type Assertion = z.infer<typeof AssertionSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;
