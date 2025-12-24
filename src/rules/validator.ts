/**
 * Rules Validator
 *
 * Semantic validation for IntentMail rules beyond schema validation.
 * Based on: completed-docs/intent-mail/000-docs/262-AT-DSGN-rules-as-code-spec.md
 */

import { Rule, Action, ActionType, ConditionOperator, ConditionField } from './types.js';

/**
 * Validation error details
 */
export interface ValidationError {
  code: string;
  message: string;
  field?: string;
  severity: 'error' | 'warning';
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Validate rule for semantic correctness
 *
 * Checks beyond schema validation:
 * - Action parameter requirements (e.g., forward needs 'to')
 * - Conflicting actions (e.g., mark_read + mark_unread)
 * - Gmail label limits (max 5000 labels per account)
 * - Condition value types match operators
 *
 * @param rule - Rule to validate
 * @returns Validation result with errors and warnings
 *
 * @example
 * ```typescript
 * const result = validateRule(rule);
 * if (!result.valid) {
 *   console.error('Validation errors:', result.errors);
 * }
 * if (result.warnings.length > 0) {
 *   console.warn('Warnings:', result.warnings);
 * }
 * ```
 */
export function validateRule(rule: Rule): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Validate action parameters
  for (const action of rule.actions) {
    const actionErrors = validateAction(action);
    errors.push(...actionErrors);
  }

  // Check for conflicting actions
  const conflicts = findConflictingActions(rule.actions);
  errors.push(...conflicts);

  // Validate condition value types
  for (const condition of rule.conditions) {
    const conditionErrors = validateConditionValueType(condition.field, condition.operator, condition.value);
    errors.push(...conditionErrors);
  }

  // Validate safety settings
  if (rule.safety) {
    if (rule.safety.max_actions_per_run < 1) {
      errors.push({
        code: 'INVALID_MAX_ACTIONS',
        message: 'safety.max_actions_per_run must be at least 1',
        field: 'safety.max_actions_per_run',
        severity: 'error',
      });
    }

    if (rule.safety.max_actions_per_run > 10000) {
      warnings.push({
        code: 'HIGH_MAX_ACTIONS',
        message: `max_actions_per_run of ${rule.safety.max_actions_per_run} is very high. Consider reducing to avoid rate limits.`,
        field: 'safety.max_actions_per_run',
        severity: 'warning',
      });
    }
  }

  // Warn if no safety settings and actions are destructive
  const hasDestructiveActions = rule.actions.some(
    (a) => a.type === ActionType.DELETE || a.type === ActionType.ARCHIVE
  );

  if (hasDestructiveActions && !rule.safety?.dry_run_required) {
    warnings.push({
      code: 'NO_DRY_RUN_FOR_DESTRUCTIVE',
      message: 'Rule contains destructive actions (delete/archive) but dry_run_required is not set. Consider enabling for safety.',
      field: 'safety.dry_run_required',
      severity: 'warning',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate action has required parameters
 */
function validateAction(action: Action): ValidationError[] {
  const errors: ValidationError[] = [];

  switch (action.type) {
    case ActionType.APPLY_LABEL:
    case ActionType.REMOVE_LABEL:
      if (!action.label) {
        errors.push({
          code: 'MISSING_LABEL_PARAMETER',
          message: `Action '${action.type}' requires 'label' parameter`,
          field: `actions.${action.type}.label`,
          severity: 'error',
        });
      }
      break;

    case ActionType.MOVE_FOLDER:
      if (!action.folder) {
        errors.push({
          code: 'MISSING_FOLDER_PARAMETER',
          message: `Action 'move_folder' requires 'folder' parameter`,
          field: 'actions.move_folder.folder',
          severity: 'error',
        });
      }
      break;

    case ActionType.FORWARD:
      if (!action.to) {
        errors.push({
          code: 'MISSING_TO_PARAMETER',
          message: `Action 'forward' requires 'to' parameter (email address)`,
          field: 'actions.forward.to',
          severity: 'error',
        });
      }
      break;

    // Other actions don't require additional parameters
    case ActionType.MARK_READ:
    case ActionType.MARK_UNREAD:
    case ActionType.ARCHIVE:
    case ActionType.DELETE:
      break;
  }

  return errors;
}

/**
 * Find conflicting actions in rule
 */
function findConflictingActions(actions: Action[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const types = actions.map((a) => a.type);

  // Check for mark_read + mark_unread
  if (types.includes(ActionType.MARK_READ) && types.includes(ActionType.MARK_UNREAD)) {
    errors.push({
      code: 'CONFLICTING_ACTIONS',
      message: 'Rule contains conflicting actions: mark_read and mark_unread',
      field: 'actions',
      severity: 'error',
    });
  }

  // Check for delete + other actions (delete should be last)
  if (types.includes(ActionType.DELETE) && types.indexOf(ActionType.DELETE) !== types.length - 1) {
    errors.push({
      code: 'DELETE_NOT_LAST',
      message: 'Delete action should be last in action list (other actions will have no effect)',
      field: 'actions',
      severity: 'error',
    });
  }

  // Check for duplicate label applications
  const labelActions = actions.filter((a) => a.type === ActionType.APPLY_LABEL);
  const labels = labelActions.map((a) => a.label);
  const duplicateLabels = labels.filter((label, index) => labels.indexOf(label) !== index);

  if (duplicateLabels.length > 0) {
    errors.push({
      code: 'DUPLICATE_LABEL',
      message: `Duplicate apply_label actions for: ${duplicateLabels.join(', ')}`,
      field: 'actions',
      severity: 'error',
    });
  }

  return errors;
}

/**
 * Validate condition value type matches operator
 */
function validateConditionValueType(
  field: ConditionField,
  operator: ConditionOperator,
  value: string | number | boolean | string[]
): ValidationError[] {
  const errors: ValidationError[] = [];

  // age_days must be number
  if (field === ConditionField.AGE_DAYS && typeof value !== 'number') {
    errors.push({
      code: 'INVALID_VALUE_TYPE',
      message: `Field 'age_days' requires number value, got ${typeof value}`,
      field: `conditions.${field}`,
      severity: 'error',
    });
  }

  // has_attachment must be boolean
  if (field === ConditionField.HAS_ATTACHMENT && typeof value !== 'boolean') {
    errors.push({
      code: 'INVALID_VALUE_TYPE',
      message: `Field 'has_attachment' requires boolean value, got ${typeof value}`,
      field: `conditions.${field}`,
      severity: 'error',
    });
  }

  // 'in' operator requires array
  if (operator === ConditionOperator.IN && !Array.isArray(value)) {
    errors.push({
      code: 'INVALID_VALUE_TYPE',
      message: `Operator 'in' requires array value, got ${typeof value}`,
      field: 'conditions.value',
      severity: 'error',
    });
  }

  // greater_than / less_than require number
  if (
    (operator === ConditionOperator.GREATER_THAN || operator === ConditionOperator.LESS_THAN) &&
    typeof value !== 'number'
  ) {
    errors.push({
      code: 'INVALID_VALUE_TYPE',
      message: `Operator '${operator}' requires number value, got ${typeof value}`,
      field: 'conditions.value',
      severity: 'error',
    });
  }

  return errors;
}

/**
 * Validate rule against provider-specific limits
 *
 * @param rule - Rule to validate
 * @param provider - Provider ('gmail', 'outlook', 'fastmail', 'imap')
 * @returns Validation result with provider-specific warnings
 *
 * @example
 * ```typescript
 * const result = validateRuleForProvider(rule, 'gmail');
 * if (result.warnings.length > 0) {
 *   console.warn('Gmail-specific warnings:', result.warnings);
 * }
 * ```
 */
export function validateRuleForProvider(
  rule: Rule,
  provider: 'gmail' | 'outlook' | 'fastmail' | 'imap'
): ValidationResult {
  const warnings: ValidationError[] = [];

  if (provider === 'gmail') {
    // Gmail has max 5000 labels per account
    const labelActions = rule.actions.filter((a) => a.type === ActionType.APPLY_LABEL);
    if (labelActions.length > 100) {
      warnings.push({
        code: 'MANY_LABEL_ACTIONS',
        message: `Rule applies ${labelActions.length} labels. Gmail has a limit of 5000 total labels per account.`,
        field: 'actions',
        severity: 'warning',
      });
    }

    // Gmail doesn't support move_folder (only labels)
    const moveFolderActions = rule.actions.filter((a) => a.type === ActionType.MOVE_FOLDER);
    if (moveFolderActions.length > 0) {
      warnings.push({
        code: 'UNSUPPORTED_ACTION',
        message: `Gmail uses labels instead of folders. 'move_folder' actions will be converted to labels.`,
        field: 'actions',
        severity: 'warning',
      });
    }
  }

  if (provider === 'outlook') {
    // Outlook limits folder depth
    const moveFolderActions = rule.actions.filter((a) => a.type === ActionType.MOVE_FOLDER);
    for (const action of moveFolderActions) {
      if (action.folder && action.folder.split('/').length > 10) {
        warnings.push({
          code: 'DEEP_FOLDER_NESTING',
          message: `Outlook may not support folder paths deeper than 10 levels: ${action.folder}`,
          field: 'actions.move_folder.folder',
          severity: 'warning',
        });
      }
    }
  }

  return {
    valid: true,
    errors: [],
    warnings,
  };
}
