/**
 * Rollback Service
 *
 * Provides rollback functionality for rule executions using audit log.
 */

import {
  getAuditLogEntryById,
  getRollbackableEntries,
  markAsRolledBack,
  EmailState,
} from './audit-log.js';
import {
  getEmailById,
  updateEmailFlags,
  addLabels,
  removeLabels,
} from './email-storage.js';
import { EmailFlag } from '../../types/email.js';

/**
 * Rollback result
 */
export interface RollbackResult {
  success: boolean;
  auditLogId: number;
  emailId: number;
  ruleId: number;
  stateBefore: EmailState;
  stateAfter: EmailState | null;
  restoredState: EmailState;
  message: string;
  error?: string;
}

/**
 * Rollback plan (dry-run preview)
 */
export interface RollbackPlan {
  auditLogId: number;
  emailId: number;
  ruleId: number;
  ruleName: string;
  currentState: {
    labels: string[];
    flags: string[];
  };
  targetState: EmailState;
  changes: {
    labelsToAdd: string[];
    labelsToRemove: string[];
    flagsToSet: string[];
  };
  executedAt: string;
}

/**
 * Calculate differences between two email states
 */
function calculateStateDiff(
  current: { labels: string[]; flags: string[] },
  target: EmailState
): {
  labelsToAdd: string[];
  labelsToRemove: string[];
  flagsToSet: string[];
} {
  const currentLabels = new Set(current.labels);
  const targetLabels = new Set(target.labels);

  const labelsToAdd = target.labels.filter((label) => !currentLabels.has(label));
  const labelsToRemove = current.labels.filter((label) => !targetLabels.has(label));

  return {
    labelsToAdd,
    labelsToRemove,
    flagsToSet: [...target.flags],
  };
}

/**
 * Preview rollback changes (dry-run)
 */
export async function previewRollback(auditLogId: number): Promise<RollbackPlan | null> {
  // Get audit log entry
  const entry = getAuditLogEntryById(auditLogId);

  if (!entry) {
    return null;
  }

  if (entry.rolledBack) {
    throw new Error(`Audit log entry ${auditLogId} has already been rolled back`);
  }

  if (!entry.stateAfter) {
    throw new Error(`Audit log entry ${auditLogId} was a dry-run and cannot be rolled back`);
  }

  // Get current email state
  const email = await getEmailById(entry.emailId);

  if (!email) {
    throw new Error(`Email ${entry.emailId} not found`);
  }

  const currentState = {
    labels: email.labels,
    flags: email.flags,
  };

  // Calculate changes
  const changes = calculateStateDiff(currentState, entry.stateBefore);

  return {
    auditLogId: entry.id!,
    emailId: entry.emailId,
    ruleId: entry.ruleId,
    ruleName: entry.executionResult.ruleName,
    currentState,
    targetState: entry.stateBefore,
    changes,
    executedAt: entry.executedAt,
  };
}

/**
 * Execute rollback for a single audit log entry
 */
export async function executeRollback(
  auditLogId: number,
  dryRun: boolean = false
): Promise<RollbackResult> {
  try {
    // Get audit log entry
    const entry = getAuditLogEntryById(auditLogId);

    if (!entry) {
      throw new Error(`Audit log entry ${auditLogId} not found`);
    }

    if (entry.rolledBack) {
      throw new Error(`Audit log entry ${auditLogId} has already been rolled back`);
    }

    if (!entry.stateAfter) {
      throw new Error(`Audit log entry ${auditLogId} was a dry-run and cannot be rolled back`);
    }

    // Get current email
    const email = await getEmailById(entry.emailId);

    if (!email) {
      throw new Error(`Email ${entry.emailId} not found`);
    }

    const currentState = {
      labels: email.labels,
      flags: email.flags,
    };

    // Calculate changes
    const changes = calculateStateDiff(currentState, entry.stateBefore);

    if (dryRun) {
      return {
        success: true,
        auditLogId: entry.id!,
        emailId: entry.emailId,
        ruleId: entry.ruleId,
        stateBefore: entry.stateBefore,
        stateAfter: entry.stateAfter,
        restoredState: entry.stateBefore,
        message: `[DRY RUN] Would rollback: ${changes.labelsToAdd.length} labels to add, ${changes.labelsToRemove.length} labels to remove, flags set to [${entry.stateBefore.flags.join(', ')}]`,
      };
    }

    // Apply rollback changes
    // 1. Restore flags (cast from string[] to EmailFlag[] since they were validated on storage)
    await updateEmailFlags(entry.emailId, entry.stateBefore.flags as EmailFlag[]);

    // 2. Remove labels that were added
    if (changes.labelsToRemove.length > 0) {
      await removeLabels(entry.emailId, changes.labelsToRemove);
    }

    // 3. Add labels that were removed
    if (changes.labelsToAdd.length > 0) {
      await addLabels(entry.emailId, changes.labelsToAdd);
    }

    // Mark as rolled back in audit log
    markAsRolledBack(entry.id!);

    // Get final state
    const restoredEmail = await getEmailById(entry.emailId);
    const restoredState: EmailState = {
      labels: restoredEmail!.labels,
      flags: restoredEmail!.flags,
      lastModified: new Date().toISOString(),
    };

    return {
      success: true,
      auditLogId: entry.id!,
      emailId: entry.emailId,
      ruleId: entry.ruleId,
      stateBefore: entry.stateBefore,
      stateAfter: entry.stateAfter,
      restoredState,
      message: `Successfully rolled back rule execution. Restored ${changes.labelsToAdd.length + changes.labelsToRemove.length} label changes and reset flags.`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      auditLogId,
      emailId: 0,
      ruleId: 0,
      stateBefore: { labels: [], flags: [], lastModified: '' },
      stateAfter: null,
      restoredState: { labels: [], flags: [], lastModified: '' },
      message: `Rollback failed: ${errorMessage}`,
      error: errorMessage,
    };
  }
}

/**
 * Rollback all executions for a specific rule
 */
export async function rollbackRule(
  ruleId: number,
  dryRun: boolean = false,
  limit: number = 100
): Promise<RollbackResult[]> {
  const entries = getRollbackableEntries(ruleId, undefined, limit);

  const results: RollbackResult[] = [];

  for (const entry of entries) {
    const result = await executeRollback(entry.id!, dryRun);
    results.push(result);
  }

  return results;
}

/**
 * Rollback all executions for a specific email
 */
export async function rollbackEmail(
  emailId: number,
  dryRun: boolean = false,
  limit: number = 100
): Promise<RollbackResult[]> {
  const entries = getRollbackableEntries(undefined, emailId, limit);

  const results: RollbackResult[] = [];

  for (const entry of entries) {
    const result = await executeRollback(entry.id!, dryRun);
    results.push(result);
  }

  return results;
}

/**
 * Get rollback statistics
 */
export function getRollbackStats(): {
  totalRollbackable: number;
  byRule: { ruleId: number; count: number }[];
  byEmail: { emailId: number; count: number }[];
} {
  const rollbackableEntries = getRollbackableEntries(undefined, undefined, 1000);

  const byRule = new Map<number, number>();
  const byEmail = new Map<number, number>();

  for (const entry of rollbackableEntries) {
    byRule.set(entry.ruleId, (byRule.get(entry.ruleId) || 0) + 1);
    byEmail.set(entry.emailId, (byEmail.get(entry.emailId) || 0) + 1);
  }

  return {
    totalRollbackable: rollbackableEntries.length,
    byRule: Array.from(byRule.entries())
      .map(([ruleId, count]) => ({ ruleId, count }))
      .sort((a, b) => b.count - a.count),
    byEmail: Array.from(byEmail.entries())
      .map(([emailId, count]) => ({ emailId, count }))
      .sort((a, b) => b.count - a.count),
  };
}
