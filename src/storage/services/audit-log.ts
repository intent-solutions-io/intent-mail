/**
 * Audit Log Storage Service
 *
 * Tracks rule executions for audit trails and rollback support.
 */

import { getDatabase } from '../database.js';
import { RuleExecutionResult } from '../../types/rule.js';
import { Email } from '../../types/email.js';

/**
 * Audit log entry interface
 */
export interface AuditLogEntry {
  id?: number;
  ruleId: number;
  emailId: number;
  executionResult: RuleExecutionResult;
  stateBefore: EmailState;
  stateAfter: EmailState | null;
  executedAt: string;
  rolledBack: boolean;
  rolledBackAt: string | null;
}

/**
 * Email state snapshot for rollback
 */
export interface EmailState {
  labels: string[];
  flags: string[];
  lastModified: string;
}

/**
 * Database row for audit_log table
 */
interface AuditLogRow {
  id: number;
  rule_id: number;
  email_id: number;
  execution_result: string; // JSON
  state_before: string; // JSON
  state_after: string | null; // JSON
  executed_at: string;
  rolled_back: number; // 0 or 1
  rolled_back_at: string | null;
}

/**
 * Convert database row to domain object
 */
function rowToAuditLogEntry(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    ruleId: row.rule_id,
    emailId: row.email_id,
    executionResult: JSON.parse(row.execution_result),
    stateBefore: JSON.parse(row.state_before),
    stateAfter: row.state_after ? JSON.parse(row.state_after) : null,
    executedAt: row.executed_at,
    rolledBack: row.rolled_back === 1,
    rolledBackAt: row.rolled_back_at,
  };
}

/**
 * Capture current email state for rollback
 */
export function captureEmailState(email: Email): EmailState {
  return {
    labels: [...email.labels],
    flags: [...email.flags],
    lastModified: new Date().toISOString(),
  };
}

/**
 * Create audit log entry
 */
export function createAuditLogEntry(
  ruleId: number,
  emailId: number,
  executionResult: RuleExecutionResult,
  stateBefore: EmailState,
  stateAfter: EmailState | null
): number {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT INTO audit_log (
      rule_id,
      email_id,
      execution_result,
      state_before,
      state_after
    ) VALUES (?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    ruleId,
    emailId,
    JSON.stringify(executionResult),
    JSON.stringify(stateBefore),
    stateAfter ? JSON.stringify(stateAfter) : null
  );

  return result.lastInsertRowid as number;
}

/**
 * Get audit log entry by ID
 */
export function getAuditLogEntryById(id: number): AuditLogEntry | null {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT * FROM audit_log WHERE id = ?
  `);

  const row = stmt.get(id) as AuditLogRow | undefined;

  if (!row) {
    return null;
  }

  return rowToAuditLogEntry(row);
}

/**
 * Get audit log entries for a rule
 */
export function getAuditLogEntriesByRule(
  ruleId: number,
  limit: number = 100,
  offset: number = 0
): AuditLogEntry[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT * FROM audit_log
    WHERE rule_id = ?
    ORDER BY executed_at DESC
    LIMIT ? OFFSET ?
  `);

  const rows = stmt.all(ruleId, limit, offset) as AuditLogRow[];

  return rows.map(rowToAuditLogEntry);
}

/**
 * Get audit log entries for an email
 */
export function getAuditLogEntriesByEmail(
  emailId: number,
  limit: number = 100,
  offset: number = 0
): AuditLogEntry[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT * FROM audit_log
    WHERE email_id = ?
    ORDER BY executed_at DESC
    LIMIT ? OFFSET ?
  `);

  const rows = stmt.all(emailId, limit, offset) as AuditLogRow[];

  return rows.map(rowToAuditLogEntry);
}

/**
 * Get recent audit log entries
 */
export function getRecentAuditLogEntries(
  limit: number = 100,
  offset: number = 0
): AuditLogEntry[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT * FROM audit_log
    ORDER BY executed_at DESC
    LIMIT ? OFFSET ?
  `);

  const rows = stmt.all(limit, offset) as AuditLogRow[];

  return rows.map(rowToAuditLogEntry);
}

/**
 * Mark audit log entry as rolled back
 */
export function markAsRolledBack(id: number): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    UPDATE audit_log
    SET rolled_back = 1,
        rolled_back_at = datetime('now')
    WHERE id = ?
  `);

  stmt.run(id);
}

/**
 * Get audit log entries that can be rolled back (not already rolled back, not dry-run)
 */
export function getRollbackableEntries(
  ruleId?: number,
  emailId?: number,
  limit: number = 100
): AuditLogEntry[] {
  const db = getDatabase();

  let query = `
    SELECT * FROM audit_log
    WHERE rolled_back = 0
      AND state_after IS NOT NULL
  `;

  const params: any[] = [];

  if (ruleId !== undefined) {
    query += ' AND rule_id = ?';
    params.push(ruleId);
  }

  if (emailId !== undefined) {
    query += ' AND email_id = ?';
    params.push(emailId);
  }

  query += ' ORDER BY executed_at DESC LIMIT ?';
  params.push(limit);

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as AuditLogRow[];

  return rows.map(rowToAuditLogEntry);
}

/**
 * Delete old audit log entries (cleanup)
 */
export function deleteOldAuditLogEntries(daysToKeep: number = 90): number {
  const db = getDatabase();

  const stmt = db.prepare(`
    DELETE FROM audit_log
    WHERE executed_at < datetime('now', '-' || ? || ' days')
  `);

  const result = stmt.run(daysToKeep);

  return result.changes;
}

/**
 * Get audit log statistics
 */
export function getAuditLogStats(): {
  totalEntries: number;
  totalRolledBack: number;
  entriesByRule: { ruleId: number; ruleName: string; count: number }[];
} {
  const db = getDatabase();

  // Total entries
  const totalStmt = db.prepare('SELECT COUNT(*) as count FROM audit_log');
  const totalResult = totalStmt.get() as { count: number };

  // Total rolled back
  const rolledBackStmt = db.prepare(
    'SELECT COUNT(*) as count FROM audit_log WHERE rolled_back = 1'
  );
  const rolledBackResult = rolledBackStmt.get() as { count: number };

  // Entries by rule
  const byRuleStmt = db.prepare(`
    SELECT
      a.rule_id as ruleId,
      r.name as ruleName,
      COUNT(*) as count
    FROM audit_log a
    JOIN rules r ON a.rule_id = r.id
    GROUP BY a.rule_id, r.name
    ORDER BY count DESC
    LIMIT 10
  `);

  const byRuleResult = byRuleStmt.all() as {
    ruleId: number;
    ruleName: string;
    count: number;
  }[];

  return {
    totalEntries: totalResult.count,
    totalRolledBack: rolledBackResult.count,
    entriesByRule: byRuleResult,
  };
}
