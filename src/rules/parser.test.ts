/**
 * Tests for Rules Parser
 */

import { describe, it, expect } from 'vitest';
import { parseRule, parseRuleFromFile, RuleParseError } from './parser.js';
import { ActionType, ConditionField, ConditionOperator } from './types.js';

describe('parseRule', () => {
  it('should parse valid YAML rule', () => {
    const yaml = `
version: 1
name: "Test rule"
enabled: true
conditions:
  - field: from
    operator: contains
    value: "@example.com"
actions:
  - type: apply_label
    label: "test"
`;

    const rule = parseRule(yaml);

    expect(rule.version).toBe(1);
    expect(rule.name).toBe('Test rule');
    expect(rule.enabled).toBe(true);
    expect(rule.conditions).toHaveLength(1);
    expect(rule.conditions[0].field).toBe(ConditionField.FROM);
    expect(rule.conditions[0].operator).toBe(ConditionOperator.CONTAINS);
    expect(rule.conditions[0].value).toBe('@example.com');
    expect(rule.actions).toHaveLength(1);
    expect(rule.actions[0].type).toBe(ActionType.APPLY_LABEL);
    expect(rule.actions[0].label).toBe('test');
  });

  it('should apply default values', () => {
    const yaml = `
version: 1
name: "Minimal rule"
conditions:
  - field: subject
    operator: equals
    value: "test"
actions:
  - type: archive
`;

    const rule = parseRule(yaml);

    expect(rule.enabled).toBe(true); // default
    expect(rule.safety).toBeUndefined(); // optional
  });

  it('should parse rule with safety settings', () => {
    const yaml = `
version: 1
name: "Safe rule"
conditions:
  - field: age_days
    operator: greater_than
    value: 30
actions:
  - type: delete
safety:
  dry_run_required: true
  audit: true
  max_actions_per_run: 50
`;

    const rule = parseRule(yaml);

    expect(rule.safety).toBeDefined();
    expect(rule.safety?.dry_run_required).toBe(true);
    expect(rule.safety?.audit).toBe(true);
    expect(rule.safety?.max_actions_per_run).toBe(50);
  });

  it('should throw on invalid YAML syntax', () => {
    const yaml = `
version: 1
name: "Invalid
this is not valid yaml
`;

    expect(() => parseRule(yaml)).toThrow(RuleParseError);
    expect(() => parseRule(yaml)).toThrow('Invalid YAML syntax');
  });

  it('should throw on schema validation failure', () => {
    const yaml = `
version: 2
name: "Wrong version"
conditions: []
actions: []
`;

    expect(() => parseRule(yaml)).toThrow(RuleParseError);
    expect(() => parseRule(yaml)).toThrow('Rule validation failed');
  });

  it('should throw on missing required fields', () => {
    const yaml = `
version: 1
conditions:
  - field: from
    operator: contains
    value: "test"
actions:
  - type: archive
`;

    expect(() => parseRule(yaml)).toThrow(RuleParseError);
    expect(() => parseRule(yaml)).toThrow('name');
  });

  it('should throw on empty conditions array', () => {
    const yaml = `
version: 1
name: "No conditions"
conditions: []
actions:
  - type: archive
`;

    expect(() => parseRule(yaml)).toThrow(RuleParseError);
  });

  it('should throw on empty actions array', () => {
    const yaml = `
version: 1
name: "No actions"
conditions:
  - field: from
    operator: contains
    value: "test"
actions: []
`;

    expect(() => parseRule(yaml)).toThrow(RuleParseError);
  });
});

describe('parseRuleFromFile', () => {
  it('should parse valid rule file', async () => {
    const rule = await parseRuleFromFile('examples/rules/archive-newsletters.yaml');

    expect(rule.name).toBe('Archive newsletters');
    expect(rule.conditions).toHaveLength(2);
    expect(rule.actions).toHaveLength(3);
  });

  it('should throw on non-existent file', async () => {
    await expect(
      parseRuleFromFile('nonexistent.yaml')
    ).rejects.toThrow(RuleParseError);
  });
});
