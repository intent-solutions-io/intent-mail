/**
 * Tests for Rules Validator
 */

import { describe, it, expect } from 'vitest';
import { validateRule, validateRuleForProvider } from './validator.js';
import { Rule, ActionType, ConditionField, ConditionOperator } from './types.js';

describe('validateRule', () => {
  it('should validate correct rule', () => {
    const rule: Rule = {
      version: 1,
      name: 'Test rule',
      enabled: true,
      conditions: [
        {
          field: ConditionField.FROM,
          operator: ConditionOperator.CONTAINS,
          value: '@example.com',
        },
      ],
      actions: [
        {
          type: ActionType.APPLY_LABEL,
          label: 'test',
        },
      ],
    };

    const result = validateRule(rule);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect missing label parameter', () => {
    const rule: Rule = {
      version: 1,
      name: 'Missing label',
      enabled: true,
      conditions: [
        {
          field: ConditionField.SUBJECT,
          operator: ConditionOperator.EQUALS,
          value: 'test',
        },
      ],
      actions: [
        {
          type: ActionType.APPLY_LABEL,
          // label missing!
        },
      ],
    };

    const result = validateRule(rule);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('MISSING_LABEL_PARAMETER');
  });

  it('should detect missing folder parameter', () => {
    const rule: Rule = {
      version: 1,
      name: 'Missing folder',
      enabled: true,
      conditions: [
        {
          field: ConditionField.SUBJECT,
          operator: ConditionOperator.EQUALS,
          value: 'test',
        },
      ],
      actions: [
        {
          type: ActionType.MOVE_FOLDER,
          // folder missing!
        },
      ],
    };

    const result = validateRule(rule);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('MISSING_FOLDER_PARAMETER');
  });

  it('should detect missing to parameter for forward', () => {
    const rule: Rule = {
      version: 1,
      name: 'Missing to',
      enabled: true,
      conditions: [
        {
          field: ConditionField.SUBJECT,
          operator: ConditionOperator.EQUALS,
          value: 'test',
        },
      ],
      actions: [
        {
          type: ActionType.FORWARD,
          // to missing!
        },
      ],
    };

    const result = validateRule(rule);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('MISSING_TO_PARAMETER');
  });

  it('should detect conflicting mark_read and mark_unread', () => {
    const rule: Rule = {
      version: 1,
      name: 'Conflicting actions',
      enabled: true,
      conditions: [
        {
          field: ConditionField.SUBJECT,
          operator: ConditionOperator.EQUALS,
          value: 'test',
        },
      ],
      actions: [
        { type: ActionType.MARK_READ },
        { type: ActionType.MARK_UNREAD },
      ],
    };

    const result = validateRule(rule);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('CONFLICTING_ACTIONS');
  });

  it('should detect delete not being last action', () => {
    const rule: Rule = {
      version: 1,
      name: 'Delete not last',
      enabled: true,
      conditions: [
        {
          field: ConditionField.SUBJECT,
          operator: ConditionOperator.EQUALS,
          value: 'test',
        },
      ],
      actions: [
        { type: ActionType.DELETE },
        { type: ActionType.ARCHIVE }, // won't execute
      ],
    };

    const result = validateRule(rule);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('DELETE_NOT_LAST');
  });

  it('should detect duplicate label applications', () => {
    const rule: Rule = {
      version: 1,
      name: 'Duplicate labels',
      enabled: true,
      conditions: [
        {
          field: ConditionField.SUBJECT,
          operator: ConditionOperator.EQUALS,
          value: 'test',
        },
      ],
      actions: [
        { type: ActionType.APPLY_LABEL, label: 'test' },
        { type: ActionType.APPLY_LABEL, label: 'test' },
      ],
    };

    const result = validateRule(rule);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('DUPLICATE_LABEL');
  });

  it('should detect invalid age_days value type', () => {
    const rule: Rule = {
      version: 1,
      name: 'Wrong age_days type',
      enabled: true,
      conditions: [
        {
          field: ConditionField.AGE_DAYS,
          operator: ConditionOperator.GREATER_THAN,
          value: '30' as any, // should be number
        },
      ],
      actions: [{ type: ActionType.ARCHIVE }],
    };

    const result = validateRule(rule);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INVALID_VALUE_TYPE')).toBe(true);
  });

  it('should detect invalid has_attachment value type', () => {
    const rule: Rule = {
      version: 1,
      name: 'Wrong has_attachment type',
      enabled: true,
      conditions: [
        {
          field: ConditionField.HAS_ATTACHMENT,
          operator: ConditionOperator.EQUALS,
          value: 'true' as any, // should be boolean
        },
      ],
      actions: [{ type: ActionType.ARCHIVE }],
    };

    const result = validateRule(rule);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INVALID_VALUE_TYPE')).toBe(true);
  });

  it('should warn about destructive actions without dry run', () => {
    const rule: Rule = {
      version: 1,
      name: 'Destructive without dry run',
      enabled: true,
      conditions: [
        {
          field: ConditionField.AGE_DAYS,
          operator: ConditionOperator.GREATER_THAN,
          value: 30,
        },
      ],
      actions: [{ type: ActionType.DELETE }],
    };

    const result = validateRule(rule);

    expect(result.valid).toBe(true); // Still valid
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe('NO_DRY_RUN_FOR_DESTRUCTIVE');
  });

  it('should warn about high max_actions_per_run', () => {
    const rule: Rule = {
      version: 1,
      name: 'High max actions',
      enabled: true,
      conditions: [
        {
          field: ConditionField.SUBJECT,
          operator: ConditionOperator.EQUALS,
          value: 'test',
        },
      ],
      actions: [{ type: ActionType.ARCHIVE }],
      safety: {
        dry_run_required: false,
        audit: true,
        max_actions_per_run: 50000,
      },
    };

    const result = validateRule(rule);

    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.code === 'HIGH_MAX_ACTIONS')).toBe(true);
  });
});

describe('validateRuleForProvider', () => {
  it('should warn about move_folder on Gmail', () => {
    const rule: Rule = {
      version: 1,
      name: 'Gmail folder move',
      enabled: true,
      conditions: [
        {
          field: ConditionField.SUBJECT,
          operator: ConditionOperator.EQUALS,
          value: 'test',
        },
      ],
      actions: [
        {
          type: ActionType.MOVE_FOLDER,
          folder: 'Archive/2024',
        },
      ],
    };

    const result = validateRuleForProvider(rule, 'gmail');

    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe('UNSUPPORTED_ACTION');
  });

  it('should warn about deep folder nesting on Outlook', () => {
    const rule: Rule = {
      version: 1,
      name: 'Deep folder nesting',
      enabled: true,
      conditions: [
        {
          field: ConditionField.SUBJECT,
          operator: ConditionOperator.EQUALS,
          value: 'test',
        },
      ],
      actions: [
        {
          type: ActionType.MOVE_FOLDER,
          folder: 'A/B/C/D/E/F/G/H/I/J/K', // 11 levels
        },
      ],
    };

    const result = validateRuleForProvider(rule, 'outlook');

    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe('DEEP_FOLDER_NESTING');
  });
});
