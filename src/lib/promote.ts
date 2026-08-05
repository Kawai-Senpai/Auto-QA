import { existsSync, mkdirSync, readFileSync, renameSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

import { auditGeneratedTests } from './audit.js';
import type { TargetConfig } from './target-config.js';
import { resolveInTarget } from './target-config.js';

/**
 * The gate between "a test exists" and "a test is trusted".
 *
 * Promotion is the only place the suite grows, so every reason to refuse lives
 * here rather than in an agent's judgement. The default answer is no.
 */

export interface PromotionGate {
  name: string;
  passed: boolean;
  detail: string;
}

export interface PromotionResult {
  file: string;
  promoted: boolean;
  destination?: string;
  gates: PromotionGate[];
}

export interface PromotionEvidence {
  /** Static audit and repeated execution already passed for this file. */
  auditPassed: boolean;
  typeCheckPassed: boolean;
  repeatedRunsPassed: boolean;
  /**
   * A test that still passes when the behaviour it protects is broken is not a
   * test. This cannot be inferred - it must be performed and reported.
   */
  negativeValidationPerformed: boolean;
  negativeValidationFailedAsExpected: boolean;
  /** Baselines must be reviewed by a human, not accepted because they rendered. */
  visualBaselinesApproved: boolean;
  /** A test depending on a personal session cannot run in CI. */
  usesPersonalCredentials: boolean;
  requirementSourceResolved: boolean;
}

/**
 * Evaluate one generated test against every promotion gate.
 *
 * Gates are reported individually rather than as a single boolean so a refusal
 * says which condition failed and what to do about it.
 */
export function evaluateGates(
  config: TargetConfig,
  file: string,
  evidence: PromotionEvidence,
): PromotionGate[] {
  const source = existsSync(file) ? readFileSync(file, 'utf8') : '';

  const gates: PromotionGate[] = [
    {
      name: 'static-audit',
      passed: evidence.auditPassed,
      detail: 'Rejects sleeps, brittle selectors, tautologies and missing requirement headers.',
    },
    {
      name: 'type-check',
      passed: evidence.typeCheckPassed,
      detail: 'A test that does not compile never ran.',
    },
    {
      name: 'repeated-execution',
      passed: evidence.repeatedRunsPassed,
      detail: `Must pass ${config.validation.repeatEach} consecutive clean runs.`,
    },
    {
      name: 'requirement-source',
      passed:
        evidence.requirementSourceResolved &&
        /^\/\/ Generated from requirement: \S/m.test(source),
      detail: 'Every assertion must trace to a requirement, not to observed behaviour.',
    },
    {
      name: 'negative-validation',
      passed:
        evidence.negativeValidationPerformed &&
        evidence.negativeValidationFailedAsExpected,
      detail:
        'The test must fail when the behaviour it protects is deliberately broken. ' +
        'Not performed, or performed and still passing, both block promotion.',
    },
    {
      name: 'no-personal-credentials',
      passed: !evidence.usesPersonalCredentials,
      detail: 'A test bound to a personal session cannot run in CI.',
    },
  ];

  if (config.visual.requireBaselineApproval && /toHaveScreenshot/.test(source)) {
    gates.push({
      name: 'visual-baseline-approved',
      passed: evidence.visualBaselinesApproved,
      detail:
        'A screenshot baseline is an approval. It must not be accepted merely ' +
        'because the current implementation produced it.',
    });
  }

  return gates;
}

export function promoteTest(
  root: string,
  config: TargetConfig,
  fileName: string,
  evidence: PromotionEvidence,
): PromotionResult {
  const generatedDir = resolveInTarget(root, config.testing.generatedDirectory);
  const approvedDir = resolveInTarget(root, config.testing.approvedDirectory);

  // basename only: a promotion request must not be able to move arbitrary files.
  const safeName = basename(fileName);
  const source = join(generatedDir, safeName);

  if (!existsSync(source)) {
    return {
      file: safeName,
      promoted: false,
      gates: [
        {
          name: 'file-exists',
          passed: false,
          detail: `No such generated test: ${config.testing.generatedDirectory}/${safeName}`,
        },
      ],
    };
  }

  const auditIssues = auditGeneratedTests(source);
  const gates = evaluateGates(config, source, {
    ...evidence,
    auditPassed: evidence.auditPassed && auditIssues.length === 0,
  });

  if (gates.some((gate) => !gate.passed)) {
    return { file: safeName, promoted: false, gates };
  }

  mkdirSync(approvedDir, { recursive: true });
  const destination = join(approvedDir, safeName);
  renameSync(source, destination);

  return {
    file: safeName,
    promoted: true,
    destination: `${config.testing.approvedDirectory}/${safeName}`,
    gates,
  };
}

export function listGeneratedTests(
  root: string,
  config: TargetConfig,
): string[] {
  const generatedDir = resolveInTarget(root, config.testing.generatedDirectory);

  if (!existsSync(generatedDir)) {
    return [];
  }

  return readdirSync(generatedDir).filter((entry) => entry.endsWith('.spec.ts'));
}
