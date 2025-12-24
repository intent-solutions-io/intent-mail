/**
 * IntentMail Rules-as-Code Engine
 *
 * Public API for parsing, validating, and working with email automation rules.
 *
 * @example
 * ```typescript
 * import { parseRuleFromFile, validateRule } from './rules/index.js';
 *
 * // Load and validate a rule
 * const rule = await parseRuleFromFile('./rules/archive-newsletters.yaml');
 * const validation = validateRule(rule);
 *
 * if (!validation.valid) {
 *   console.error('Validation errors:', validation.errors);
 *   process.exit(1);
 * }
 *
 * if (validation.warnings.length > 0) {
 *   console.warn('Warnings:', validation.warnings);
 * }
 *
 * console.log(`Rule loaded: ${rule.name}`);
 * ```
 *
 * Based on: completed-docs/intent-mail/000-docs/262-AT-DSGN-rules-as-code-spec.md
 */

// Export types
export type {
  Condition,
  Action,
  Safety,
  Rule,
  StoredRule,
  DryRunPlan,
  MatchedMessage,
  AuditLog,
  RollbackPlan,
  RollbackAction,
  RuleExecutionResult,
} from './types.js';

export {
  ConditionOperator,
  ConditionField,
  ActionType,
  ConditionSchema,
  ActionSchema,
  SafetySchema,
  RuleSchema,
} from './types.js';

// Export parser
export {
  parseRule,
  parseRuleFromFile,
  parseRulesFromFile,
  RuleParseError,
} from './parser.js';

// Export validator
export type {
  ValidationError,
  ValidationResult,
} from './validator.js';

export {
  validateRule,
  validateRuleForProvider,
} from './validator.js';
