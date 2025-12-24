/**
 * Rule Storage Service
 *
 * CRUD operations for email automation rules.
 */

import { getDatabase } from '../database.js';
import { StorageError } from '../../types/storage.js';
import { Rule, RuleRow } from '../../types/rule.js';

/**
 * Convert database row to Rule object
 */
function rowToRule(row: RuleRow): Rule {
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    description: row.description || undefined,
    trigger: row.trigger as Rule['trigger'],
    conditions: JSON.parse(row.conditions),
    actions: JSON.parse(row.actions),
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create a new rule
 */
export function createRule(params: Omit<Rule, 'id' | 'createdAt' | 'updatedAt'>): Rule {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT INTO rules (account_id, name, description, trigger, conditions, actions, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    params.accountId,
    params.name,
    params.description || null,
    params.trigger,
    JSON.stringify(params.conditions),
    JSON.stringify(params.actions),
    params.isActive ? 1 : 0
  );

  const ruleId = result.lastInsertRowid as number;

  const rule = getRuleById(ruleId);
  if (!rule) {
    throw new StorageError(
      `Failed to retrieve rule after creation (ID: ${ruleId})`,
      'RULE_CREATE_ERROR'
    );
  }

  return rule;
}

/**
 * Get rule by ID
 */
export function getRuleById(ruleId: number): Rule | null {
  const db = getDatabase();

  const stmt = db.prepare('SELECT * FROM rules WHERE id = ?');
  const row = stmt.get(ruleId) as RuleRow | undefined;

  return row ? rowToRule(row) : null;
}

/**
 * Get all rules for an account
 */
export function getRulesByAccountId(accountId: number, activeOnly: boolean = false): Rule[] {
  const db = getDatabase();

  const query = activeOnly
    ? 'SELECT * FROM rules WHERE account_id = ? AND is_active = 1 ORDER BY created_at DESC'
    : 'SELECT * FROM rules WHERE account_id = ? ORDER BY created_at DESC';

  const stmt = db.prepare(query);
  const rows = stmt.all(accountId) as RuleRow[];

  return rows.map(rowToRule);
}

/**
 * Get all rules across all accounts
 */
export function getAllRules(activeOnly: boolean = false): Rule[] {
  const db = getDatabase();

  const query = activeOnly
    ? 'SELECT * FROM rules WHERE is_active = 1 ORDER BY account_id, created_at DESC'
    : 'SELECT * FROM rules ORDER BY account_id, created_at DESC';

  const stmt = db.prepare(query);
  const rows = stmt.all() as RuleRow[];

  return rows.map(rowToRule);
}

/**
 * Update rule
 */
export function updateRule(params: {
  ruleId: number;
  name?: string;
  description?: string;
  trigger?: Rule['trigger'];
  conditions?: Rule['conditions'];
  actions?: Rule['actions'];
  isActive?: boolean;
}): Rule {
  const db = getDatabase();

  // Get existing rule
  const existingRule = getRuleById(params.ruleId);
  if (!existingRule) {
    throw new StorageError(`Rule with ID ${params.ruleId} not found`, 'RULE_NOT_FOUND');
  }

  // Build update query dynamically
  const updates: string[] = [];
  const values: unknown[] = [];

  if (params.name !== undefined) {
    updates.push('name = ?');
    values.push(params.name);
  }

  if (params.description !== undefined) {
    updates.push('description = ?');
    values.push(params.description || null);
  }

  if (params.trigger !== undefined) {
    updates.push('trigger = ?');
    values.push(params.trigger);
  }

  if (params.conditions !== undefined) {
    updates.push('conditions = ?');
    values.push(JSON.stringify(params.conditions));
  }

  if (params.actions !== undefined) {
    updates.push('actions = ?');
    values.push(JSON.stringify(params.actions));
  }

  if (params.isActive !== undefined) {
    updates.push('is_active = ?');
    values.push(params.isActive ? 1 : 0);
  }

  // Always update updated_at
  updates.push("updated_at = datetime('now')");

  if (updates.length === 0) {
    // No updates, return existing rule
    return existingRule;
  }

  // Add rule ID to values
  values.push(params.ruleId);

  const query = `UPDATE rules SET ${updates.join(', ')} WHERE id = ?`;
  const stmt = db.prepare(query);
  stmt.run(...values);

  const updatedRule = getRuleById(params.ruleId);
  if (!updatedRule) {
    throw new StorageError(
      `Failed to retrieve rule after update (ID: ${params.ruleId})`,
      'RULE_UPDATE_ERROR'
    );
  }

  return updatedRule;
}

/**
 * Delete rule
 */
export function deleteRule(ruleId: number): boolean {
  const db = getDatabase();

  const stmt = db.prepare('DELETE FROM rules WHERE id = ?');
  const result = stmt.run(ruleId);

  return result.changes > 0;
}

/**
 * Deactivate rule (soft delete)
 */
export function deactivateRule(ruleId: number): Rule {
  return updateRule({ ruleId, isActive: false });
}

/**
 * Activate rule
 */
export function activateRule(ruleId: number): Rule {
  return updateRule({ ruleId, isActive: true });
}

/**
 * Get rules by trigger type
 */
export function getRulesByTrigger(trigger: Rule['trigger'], activeOnly: boolean = true): Rule[] {
  const db = getDatabase();

  const query = activeOnly
    ? 'SELECT * FROM rules WHERE trigger = ? AND is_active = 1 ORDER BY created_at DESC'
    : 'SELECT * FROM rules WHERE trigger = ? ORDER BY created_at DESC';

  const stmt = db.prepare(query);
  const rows = stmt.all(trigger) as RuleRow[];

  return rows.map(rowToRule);
}
