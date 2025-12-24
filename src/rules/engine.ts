/**
 * Rule Execution Engine
 *
 * Evaluates rule conditions and applies actions to emails.
 */

import {
  Rule,
  RuleCondition,
  RuleConditionField,
  RuleConditionOperator,
  RuleAction,
  RuleActionType,
  RuleExecutionResult,
} from '../types/rule.js';
import { Email, EmailFlag } from '../types/email.js';
import { addLabels, removeLabels, updateEmailFlags, getEmailById } from '../storage/services/email-storage.js';
import {
  createAuditLogEntry,
  captureEmailState,
  EmailState,
} from '../storage/services/audit-log.js';

/**
 * Evaluate a single condition against an email
 */
function evaluateCondition(email: Email, condition: RuleCondition): boolean {
  let fieldValue: unknown;

  // Extract field value from email
  switch (condition.field) {
    case RuleConditionField.FROM:
      fieldValue = email.from.address.toLowerCase();
      break;
    case RuleConditionField.TO:
      fieldValue = email.to.map((addr) => addr.address.toLowerCase()).join(',');
      break;
    case RuleConditionField.CC:
      fieldValue = email.cc?.map((addr) => addr.address.toLowerCase()).join(',') || '';
      break;
    case RuleConditionField.SUBJECT:
      fieldValue = email.subject.toLowerCase();
      break;
    case RuleConditionField.BODY:
      fieldValue = (email.bodyText || '').toLowerCase();
      break;
    case RuleConditionField.LABEL:
      fieldValue = email.labels.join(',');
      break;
    case RuleConditionField.HAS_ATTACHMENT:
      fieldValue = email.hasAttachments;
      break;
    case RuleConditionField.THREAD_SIZE:
      // This would require counting emails in thread - for now, return 1
      fieldValue = 1;
      break;
    case RuleConditionField.DATE:
      fieldValue = email.date;
      break;
    default:
      return false;
  }

  // Evaluate operator
  switch (condition.operator) {
    case RuleConditionOperator.EQUALS:
      if (typeof fieldValue === 'string' && typeof condition.value === 'string') {
        return fieldValue === condition.value.toLowerCase();
      }
      return fieldValue === condition.value;

    case RuleConditionOperator.NOT_EQUALS:
      if (typeof fieldValue === 'string' && typeof condition.value === 'string') {
        return fieldValue !== condition.value.toLowerCase();
      }
      return fieldValue !== condition.value;

    case RuleConditionOperator.CONTAINS:
      if (typeof fieldValue === 'string' && typeof condition.value === 'string') {
        return fieldValue.includes(condition.value.toLowerCase());
      }
      return false;

    case RuleConditionOperator.NOT_CONTAINS:
      if (typeof fieldValue === 'string' && typeof condition.value === 'string') {
        return !fieldValue.includes(condition.value.toLowerCase());
      }
      return false;

    case RuleConditionOperator.MATCHES_REGEX:
      if (typeof fieldValue === 'string' && typeof condition.value === 'string') {
        try {
          const regex = new RegExp(condition.value, 'i');
          return regex.test(fieldValue);
        } catch {
          return false;
        }
      }
      return false;

    case RuleConditionOperator.GREATER_THAN:
      if (typeof fieldValue === 'number' && typeof condition.value === 'number') {
        return fieldValue > condition.value;
      }
      if (typeof fieldValue === 'string' && typeof condition.value === 'string') {
        return fieldValue > condition.value;
      }
      return false;

    case RuleConditionOperator.LESS_THAN:
      if (typeof fieldValue === 'number' && typeof condition.value === 'number') {
        return fieldValue < condition.value;
      }
      if (typeof fieldValue === 'string' && typeof condition.value === 'string') {
        return fieldValue < condition.value;
      }
      return false;

    case RuleConditionOperator.IN:
      if (Array.isArray(condition.value)) {
        const values = condition.value.map((v) => String(v).toLowerCase());
        return values.includes(String(fieldValue).toLowerCase());
      }
      return false;

    case RuleConditionOperator.NOT_IN:
      if (Array.isArray(condition.value)) {
        const values = condition.value.map((v) => String(v).toLowerCase());
        return !values.includes(String(fieldValue).toLowerCase());
      }
      return false;

    default:
      return false;
  }
}

/**
 * Evaluate all conditions for a rule (AND logic)
 */
function evaluateConditions(email: Email, conditions: RuleCondition[]): boolean {
  // All conditions must match (AND logic)
  return conditions.every((condition) => evaluateCondition(email, condition));
}

/**
 * Apply a single action to an email
 */
async function applyAction(
  email: Email,
  action: RuleAction,
  dryRun: boolean
): Promise<string> {
  const actionDescription = `${action.type}${action.value ? ` (${action.value})` : ''}`;

  if (dryRun) {
    return actionDescription;
  }

  // Apply action based on type
  switch (action.type) {
    case RuleActionType.ADD_LABEL:
      if (!action.value) {
        throw new Error('ADD_LABEL action requires a label name');
      }
      await addLabels(email.id!, [action.value]);
      break;

    case RuleActionType.REMOVE_LABEL:
      if (!action.value) {
        throw new Error('REMOVE_LABEL action requires a label name');
      }
      await removeLabels(email.id!, [action.value]);
      break;

    case RuleActionType.MARK_READ:
      // Get current flags and add SEEN if not present
      {
        const currentEmail = await getEmailById(email.id!);
        if (currentEmail) {
          const flags = currentEmail.flags;
          if (!flags.includes(EmailFlag.SEEN)) {
            flags.push(EmailFlag.SEEN);
          }
          await updateEmailFlags(email.id!, flags);
        }
      }
      break;

    case RuleActionType.MARK_UNREAD:
      // Get current flags and remove SEEN
      {
        const currentEmail = await getEmailById(email.id!);
        if (currentEmail) {
          const flags = currentEmail.flags.filter((f) => f !== EmailFlag.SEEN);
          await updateEmailFlags(email.id!, flags);
        }
      }
      break;

    case RuleActionType.ARCHIVE:
      // Remove INBOX label
      await removeLabels(email.id!, ['INBOX']);
      break;

    case RuleActionType.MOVE_TO_TRASH:
      // Add TRASH label, remove others
      await addLabels(email.id!, ['TRASH']);
      await removeLabels(email.id!, ['INBOX']);
      break;

    case RuleActionType.DELETE:
      // This would require actual deletion from database
      // For now, just move to trash
      await addLabels(email.id!, ['TRASH']);
      await removeLabels(email.id!, ['INBOX']);
      break;

    case RuleActionType.FORWARD:
      // Forward action would require email sending
      // Not implemented yet - return description for now
      break;

    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }

  return actionDescription;
}

/**
 * Execute a rule against an email
 */
export async function executeRule(
  rule: Rule,
  email: Email,
  dryRun: boolean = false
): Promise<RuleExecutionResult> {
  const result: RuleExecutionResult = {
    ruleId: rule.id!,
    ruleName: rule.name,
    emailId: email.id!,
    matched: false,
    actionsApplied: [],
    dryRun,
    executedAt: new Date().toISOString(),
  };

  let stateBefore: EmailState | null = null;
  let stateAfter: EmailState | null = null;

  try {
    // Evaluate conditions
    result.matched = evaluateConditions(email, rule.conditions);

    if (!result.matched) {
      return result;
    }

    // Capture state before applying actions
    stateBefore = captureEmailState(email);

    // Apply actions if conditions match
    for (const action of rule.actions) {
      const actionDescription = await applyAction(email, action, dryRun);
      result.actionsApplied.push(actionDescription);
    }

    // Capture state after applying actions (only if not dry-run)
    if (!dryRun) {
      const updatedEmail = await getEmailById(email.id!);
      if (updatedEmail) {
        stateAfter = captureEmailState(updatedEmail);
      }
    }

    // Create audit log entry
    if (stateBefore && rule.id && email.id) {
      createAuditLogEntry(rule.id, email.id, result, stateBefore, stateAfter);
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);

    // Still create audit log entry for failed executions
    if (stateBefore && rule.id && email.id) {
      createAuditLogEntry(rule.id, email.id, result, stateBefore, stateAfter);
    }
  }

  return result;
}

/**
 * Execute multiple rules against an email
 */
export async function executeRules(
  rules: Rule[],
  email: Email,
  dryRun: boolean = false
): Promise<RuleExecutionResult[]> {
  const results: RuleExecutionResult[] = [];

  for (const rule of rules) {
    if (!rule.isActive) {
      continue;
    }

    const result = await executeRule(rule, email, dryRun);
    results.push(result);
  }

  return results;
}
