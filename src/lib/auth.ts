import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

import type { TargetConfig } from './target-config.js';
import { resolveInTarget } from './target-config.js';

/**
 * Test identity handling.
 *
 * Playwright can save and restore an authenticated browser state. What it
 * cannot know is how a given application creates users, so every target
 * implements the adapter below. There is no honest universal implementation:
 * applications differ in database, identity provider, signup rules and
 * authorization model.
 *
 * The security property that matters: the language model receives an account
 * id, a role and a path to a storage-state file. It never receives a password.
 * Secrets live in environment variables the engine reads and the model does not.
 */

export interface QaAccountLease {
  accountId: string;
  username: string;
  role: string;
  cleanupToken?: string;
}

export interface ProvisionedQaAccount extends QaAccountLease {
  /** Never logged, never serialised, never returned to the model. */
  secret: string;
}

export interface QaAuthAdapter {
  provision(role: string): Promise<ProvisionedQaAccount>;
  authenticate(page: unknown, account: ProvisionedQaAccount): Promise<void>;
  cleanup(lease: QaAccountLease): Promise<void>;
}

/** Exactly what may be handed back to the model. */
export interface AuthStateHandle {
  accountId: string;
  role: string;
  storageStatePath: string;
  leasePath: string;
  ageMinutes: number;
  expired: boolean;
}

export function authStatePath(
  root: string,
  config: TargetConfig,
  role: string,
): string {
  return resolveInTarget(
    root,
    join(config.authentication.stateDirectory, `${role}.json`),
  );
}

export function authLeasePath(
  root: string,
  config: TargetConfig,
  role: string,
): string {
  return resolveInTarget(
    root,
    join(config.authentication.leaseDirectory, `${role}.json`),
  );
}

/**
 * Report whether usable state exists for a role, and how old it is.
 *
 * Sessions expire server-side with no local signal, and a stale state fails
 * later as a confusing assertion error in the middle of a flow. Checking age
 * up front turns that into a re-provision.
 */
export function inspectAuthState(
  root: string,
  config: TargetConfig,
  role: string,
): AuthStateHandle | null {
  const statePath = authStatePath(root, config, role);

  if (!existsSync(statePath)) {
    return null;
  }

  const ageMinutes = (Date.now() - statSync(statePath).mtimeMs) / 60_000;

  return {
    accountId: readLeaseAccountId(root, config, role),
    role,
    storageStatePath: statePath,
    leasePath: authLeasePath(root, config, role),
    ageMinutes: Math.round(ageMinutes),
    expired: ageMinutes > config.authentication.stateMaxAgeMinutes,
  };
}

function readLeaseAccountId(
  root: string,
  config: TargetConfig,
  role: string,
): string {
  const leasePath = authLeasePath(root, config, role);

  if (!existsSync(leasePath)) {
    return 'unknown';
  }

  try {
    const lease = JSON.parse(
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('node:fs').readFileSync(leasePath, 'utf8'),
    ) as { accountId?: string };
    return lease.accountId ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * The command a human or agent runs to mint authenticated state for a role.
 *
 * Returned as a string rather than executed here: provisioning touches real
 * accounts and real credentials, so it stays an explicit, reviewable step in
 * the target repository rather than something the MCP server does silently.
 */
export function prepareAuthCommand(
  config: TargetConfig,
  role: string,
): { command: string; requiredEnv: string[]; note: string } {
  return {
    command:
      `npx tsx scripts/qa/prepare-auth-state.ts ` +
      `--role=${role} ` +
      `--output=${config.authentication.stateDirectory}/${role}.json ` +
      `--lease-output=${config.authentication.leaseDirectory}/${role}.json`,
    requiredEnv: ['QA_BASE_URL', 'QA_USER_FACTORY_URL', 'QA_USER_FACTORY_TOKEN'],
    note:
      'Runs the target-implemented auth adapter. The secret never leaves the ' +
      'script: only an account id, role and storage-state path are returned.',
  };
}

/**
 * Roles a scenario may reference must exist in configuration, so a typo
 * produces a clear error instead of a silently unauthenticated run that then
 * fails as a mysterious redirect to the login page.
 */
export function assertRoleConfigured(config: TargetConfig, role: string): void {
  if (!config.authentication.roles.includes(role)) {
    throw new Error(
      `Role "${role}" is not in authentication.roles ` +
        `(${config.authentication.roles.join(', ')}). ` +
        `Add it to ${'agent-qa.config.json'} before using it in a scenario.`,
    );
  }
}
