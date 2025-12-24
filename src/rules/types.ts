/**
 * Rules Engine Types
 *
 * TypeScript interfaces for IntentMail rules-as-code system.
 * Based on: completed-docs/intent-mail/000-docs/262-AT-DSGN-rules-as-code-spec.md
 */

import { z } from 'zod';

/**
 * Supported condition operators
 */
export enum ConditionOperator {
  EQUALS = 'equals',
  MATCHES = 'matches', // glob pattern
  CONTAINS = 'contains',
  GREATER_THAN = 'greater_than',
  LESS_THAN = 'less_than',
  IN = 'in',
}

/**
 * Fields that can be evaluated in conditions
 */
export enum ConditionField {
  FROM = 'from',
  TO = 'to',
  SUBJECT = 'subject',
  BODY = 'body',
  AGE_DAYS = 'age_days',
  HAS_ATTACHMENT = 'has_attachment',
  LABELS = 'labels',
}

/**
 * Supported action types
 */
export enum ActionType {
  APPLY_LABEL = 'apply_label',
  REMOVE_LABEL = 'remove_label',
  MOVE_FOLDER = 'move_folder',
  MARK_READ = 'mark_read',
  MARK_UNREAD = 'mark_unread',
  ARCHIVE = 'archive',
  DELETE = 'delete',
  FORWARD = 'forward',
}

/**
 * Zod schema for rule conditions
 */
export const ConditionSchema = z.object({
  field: z.nativeEnum(ConditionField),
  operator: z.nativeEnum(ConditionOperator),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
});

export type Condition = z.infer<typeof ConditionSchema>;

/**
 * Zod schema for rule actions
 */
export const ActionSchema = z.object({
  type: z.nativeEnum(ActionType),
  label: z.string().optional(),
  folder: z.string().optional(),
  to: z.string().email().optional(),
});

export type Action = z.infer<typeof ActionSchema>;

/**
 * Zod schema for safety settings
 */
export const SafetySchema = z.object({
  dry_run_required: z.boolean().default(false),
  audit: z.boolean().default(true),
  max_actions_per_run: z.number().int().positive().default(100),
});

export type Safety = z.infer<typeof SafetySchema>;

/**
 * Zod schema for complete rule
 */
export const RuleSchema = z.object({
  version: z.literal(1),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  enabled: z.boolean().default(true),
  conditions: z.array(ConditionSchema).min(1),
  actions: z.array(ActionSchema).min(1),
  safety: SafetySchema.optional(),
});

export type Rule = z.infer<typeof RuleSchema>;

/**
 * Rule with metadata (stored in database)
 */
export interface StoredRule extends Rule {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  execution_count: number;
  last_executed_at?: string;
}

/**
 * Dry-run plan output
 */
export interface DryRunPlan {
  rule_id: string;
  plan_id: string;
  timestamp: string;
  matched_messages: MatchedMessage[];
  total_matches: number;
  estimated_execution_time_ms: number;
}

export interface MatchedMessage {
  message_id: string;
  subject: string;
  from: string;
  age_days?: number;
  actions: Action[];
}

/**
 * Audit log entry
 */
export interface AuditLog {
  id: string;
  rule_id: string;
  message_id: string;
  action_type: ActionType;
  status: 'success' | 'failed' | 'skipped';
  error?: string;
  timestamp: string;
  execution_time_ms: number;
}

/**
 * Rollback plan
 */
export interface RollbackPlan {
  rule_execution_id: string;
  actions_to_undo: RollbackAction[];
  estimated_time_ms: number;
}

export interface RollbackAction {
  message_id: string;
  undo_action: Action;
}

/**
 * Rule execution result
 */
export interface RuleExecutionResult {
  rule_id: string;
  execution_id: string;
  timestamp: string;
  messages_matched: number;
  actions_executed: number;
  actions_failed: number;
  audit_logs: AuditLog[];
  rollback_plan: RollbackPlan;
}
