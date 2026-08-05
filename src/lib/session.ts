import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import * as z from 'zod';

import { TargetSchema } from './scenario.js';
import type { TargetConfig } from './target-config.js';
import { resolveInTarget } from './target-config.js';

/**
 * Durable record of one exploration.
 *
 * Without this, the pipeline depends on an agent transcribing its own browser
 * session from memory into a scenario - the least reliable step in the loop. An
 * append-only event log makes the exploration reviewable, resumable after a
 * crash, and separable from the approved test it eventually produces.
 *
 * Exploration deliberately stays separate from scenarios. It contains failed
 * attempts, transient states and diagnostics that must not become approved test
 * behaviour by accident.
 */

/**
 * MCP snapshot refs such as `e42` are scoped to the snapshot that produced
 * them and are meaningless after the next DOM update. Actions therefore persist
 * a semantic target and keep the ref only as a debugging breadcrumb.
 */
const ActionEventSchema = z.object({
  type: z.literal('action'),
  action: z.enum([
    'goto',
    'click',
    'fill',
    'press',
    'check',
    'uncheck',
    'hover',
    'select',
    'scroll',
  ]),
  target: TargetSchema.optional(),
  value: z.string().optional(),
  key: z.string().optional(),
  path: z.string().optional(),
  observedRef: z.string().optional(),
  urlBefore: z.string().optional(),
  urlAfter: z.string().optional(),
  screenshot: z.string().optional(),
});

const ObservationEventSchema = z.object({
  type: z.literal('observation'),
  kind: z.enum([
    'visible-text',
    'aria-snapshot',
    'url',
    'screenshot',
    'element-state',
  ]),
  value: z.string(),
  note: z.string().optional(),
});

const ConsoleEventSchema = z.object({
  type: z.literal('console'),
  level: z.enum(['error', 'warning', 'info']),
  text: z.string(),
});

const NetworkEventSchema = z.object({
  type: z.literal('network'),
  method: z.string().min(1),
  url: z.string().min(1),
  status: z.number().int().optional(),
  firstParty: z.boolean().optional(),
  failure: z.string().optional(),
  /** Whether the request was expected to occur. False records an absence. */
  occurred: z.boolean().default(true),
});

/**
 * A proposed assertion plus the oracle backing it.
 *
 * `verified: false` means the agent saw something but cannot justify it from a
 * requirement. Those never reach a compiled test - they become discoveries for
 * a human, which is the whole point of separating exploration from approval.
 */
const CandidateAssertionEventSchema = z.object({
  type: z.literal('candidate-assertion'),
  description: z.string().min(1),
  oracle: z.object({
    source: z.string().min(1),
    section: z.string().optional(),
    verified: z.boolean(),
  }),
});

const FindingEventSchema = z.object({
  type: z.literal('finding'),
  category: z.enum([
    'functional',
    'visual',
    'accessibility',
    'performance',
    'console',
    'network',
    'security',
  ]),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  summary: z.string().min(1),
  evidence: z.array(z.string()).default([]),
});

export const SessionEventSchema = z.discriminatedUnion('type', [
  ActionEventSchema,
  ObservationEventSchema,
  ConsoleEventSchema,
  NetworkEventSchema,
  CandidateAssertionEventSchema,
  FindingEventSchema,
]);

export type SessionEvent = z.infer<typeof SessionEventSchema>;

export const SessionMetadataSchema = z.object({
  sessionId: z.string().min(1),
  flow: z.string().min(1),
  requirementSource: z.string().optional(),
  role: z.string().optional(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  baseURL: z.string().optional(),
  applicationCommit: z.string().optional(),
  browserVersion: z.string().optional(),
  viewport: z.string().optional(),
  featureFlags: z.record(z.string(), z.unknown()).optional(),
  eventCount: z.number().int().default(0),
});

export type SessionMetadata = z.infer<typeof SessionMetadataSchema>;

export interface SessionPaths {
  directory: string;
  events: string;
  metadata: string;
  screenshots: string;
}

export function sessionPaths(
  root: string,
  config: TargetConfig,
  sessionId: string,
): SessionPaths {
  const directory = resolveInTarget(
    root,
    join(config.evidence.sessionsDirectory, sessionId),
  );

  return {
    directory,
    events: join(directory, 'events.jsonl'),
    metadata: join(directory, 'metadata.json'),
    screenshots: join(directory, 'screenshots'),
  };
}

export function beginSession(
  root: string,
  config: TargetConfig,
  input: {
    flow: string;
    requirementSource?: string;
    role?: string;
    applicationCommit?: string;
    browserVersion?: string;
    viewport?: string;
    featureFlags?: Record<string, unknown>;
  },
): { sessionId: string; paths: SessionPaths; metadata: SessionMetadata } {
  // Time-ordered id so sessions sort chronologically in a directory listing,
  // with a random suffix so two runs in the same second cannot collide and
  // overwrite each other's evidence.
  const sessionId = `${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;

  const paths = sessionPaths(root, config, sessionId);
  mkdirSync(paths.screenshots, { recursive: true });

  const metadata = SessionMetadataSchema.parse({
    sessionId,
    flow: input.flow,
    requirementSource: input.requirementSource,
    role: input.role,
    startedAt: new Date().toISOString(),
    baseURL: config.application.baseURL,
    applicationCommit: input.applicationCommit,
    browserVersion: input.browserVersion,
    viewport: input.viewport,
    featureFlags: input.featureFlags,
    eventCount: 0,
  });

  writeFileSync(paths.metadata, JSON.stringify(metadata, null, 2), 'utf8');
  writeFileSync(paths.events, '', 'utf8');

  return { sessionId, paths, metadata };
}

/**
 * Append one event. JSONL rather than a JSON array so a session interrupted
 * mid-run leaves a readable file instead of an unparseable fragment.
 */
export function recordEvent(
  root: string,
  config: TargetConfig,
  sessionId: string,
  event: SessionEvent,
): void {
  const paths = sessionPaths(root, config, sessionId);

  if (!existsSync(paths.events)) {
    throw new Error(`No such session: ${sessionId}. Call qa_begin_session first.`);
  }

  const redacted = redactEvent(config, event);

  appendFileSync(
    paths.events,
    JSON.stringify({ at: new Date().toISOString(), ...redacted }) + '\n',
    'utf8',
  );

  const metadata = SessionMetadataSchema.parse(
    JSON.parse(readFileSync(paths.metadata, 'utf8')),
  );
  metadata.eventCount += 1;
  writeFileSync(paths.metadata, JSON.stringify(metadata, null, 2), 'utf8');
}

/**
 * Strip anything that looks like a credential before it reaches disk.
 *
 * Evidence files are read by humans, attached to reports and occasionally
 * pasted into issues. A token captured here outlives the session that produced
 * it, so redaction happens at write time rather than at review time.
 */
function redactEvent(config: TargetConfig, event: SessionEvent): SessionEvent {
  if (event.type === 'network') {
    return { ...event, url: redactURL(event.url) };
  }

  if (event.type === 'action' && event.value !== undefined) {
    // A filled value could be a password. The scenario records what was typed;
    // the evidence log does not need it.
    return { ...event, value: looksSecret(event.value) ? '[redacted]' : event.value };
  }

  if (event.type === 'console') {
    return { ...event, text: redactURL(event.text) };
  }

  return event;
}

const SECRET_QUERY_KEYS =
  /([?&](?:token|access_token|refresh_token|api[-_]?key|password|secret|code|state|session)=)[^&#\s]*/gi;

function redactURL(value: string): string {
  return value.replace(SECRET_QUERY_KEYS, '$1[redacted]');
}

function looksSecret(value: string): boolean {
  // Heuristic and deliberately conservative: over-redacting a form value costs
  // a little evidence, under-redacting writes a credential to disk.
  return /^(?=.*[A-Za-z])(?=.*\d).{12,}$/.test(value) || value.length > 60;
}

export function completeSession(
  root: string,
  config: TargetConfig,
  sessionId: string,
): { metadata: SessionMetadata; summary: SessionSummary } {
  const paths = sessionPaths(root, config, sessionId);

  const metadata = SessionMetadataSchema.parse(
    JSON.parse(readFileSync(paths.metadata, 'utf8')),
  );
  metadata.completedAt = new Date().toISOString();
  writeFileSync(paths.metadata, JSON.stringify(metadata, null, 2), 'utf8');

  return { metadata, summary: summariseSession(root, config, sessionId) };
}

export interface SessionSummary {
  sessionId: string;
  events: number;
  actions: number;
  consoleErrors: number;
  networkFailures: number;
  httpErrors: number;
  findings: number;
  verifiedAssertions: number;
  unverifiedAssertions: number;
  /** Set when the session recorded observations no requirement can justify. */
  blockedByUnverifiedOracle: boolean;
}

export function summariseSession(
  root: string,
  config: TargetConfig,
  sessionId: string,
): SessionSummary {
  const paths = sessionPaths(root, config, sessionId);
  const lines = readFileSync(paths.events, 'utf8').split('\n').filter(Boolean);

  const summary: SessionSummary = {
    sessionId,
    events: lines.length,
    actions: 0,
    consoleErrors: 0,
    networkFailures: 0,
    httpErrors: 0,
    findings: 0,
    verifiedAssertions: 0,
    unverifiedAssertions: 0,
    blockedByUnverifiedOracle: false,
  };

  for (const line of lines) {
    const parsed = SessionEventSchema.safeParse(JSON.parse(line));
    if (!parsed.success) {
      continue;
    }

    const event = parsed.data;

    switch (event.type) {
      case 'action':
        summary.actions += 1;
        break;
      case 'console':
        if (event.level === 'error') summary.consoleErrors += 1;
        break;
      case 'network':
        if (event.failure) summary.networkFailures += 1;
        if (event.status && event.status >= 400) summary.httpErrors += 1;
        break;
      case 'finding':
        summary.findings += 1;
        break;
      case 'candidate-assertion':
        if (event.oracle.verified) summary.verifiedAssertions += 1;
        else summary.unverifiedAssertions += 1;
        break;
    }
  }

  summary.blockedByUnverifiedOracle =
    summary.unverifiedAssertions > 0 &&
    !config.requirements.allowObservedBehaviorAsOracle;

  return summary;
}
