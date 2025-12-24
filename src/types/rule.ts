/**
 * Rule Types
 *
 * Email automation rules with conditions and actions.
 */

import { z } from 'zod';

/**
 * Rule condition operators
 */
export enum RuleConditionOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  CONTAINS = 'contains',
  NOT_CONTAINS = 'not_contains',
  MATCHES_REGEX = 'matches_regex',
  GREATER_THAN = 'greater_than',
  LESS_THAN = 'less_than',
  IN = 'in',
  NOT_IN = 'not_in',
}

/**
 * Rule condition field
 */
export enum RuleConditionField {
  FROM = 'from',
  TO = 'to',
  CC = 'cc',
  SUBJECT = 'subject',
  BODY = 'body',
  LABEL = 'label',
  HAS_ATTACHMENT = 'has_attachment',
  THREAD_SIZE = 'thread_size',
  DATE = 'date',
}

/**
 * Rule action type
 */
export enum RuleActionType {
  ADD_LABEL = 'add_label',
  REMOVE_LABEL = 'remove_label',
  MARK_READ = 'mark_read',
  MARK_UNREAD = 'mark_unread',
  ARCHIVE = 'archive',
  DELETE = 'delete',
  FORWARD = 'forward',
  MOVE_TO_TRASH = 'move_to_trash',
}

/**
 * Rule trigger type
 */
export enum RuleTrigger {
  ON_NEW_EMAIL = 'on_new_email',
  MANUAL = 'manual',
  SCHEDULED = 'scheduled',
}

/**
 * Zod schema for rule condition
 */
export const RuleConditionSchema = z.object({
  field: z.nativeEnum(RuleConditionField),
  operator: z.nativeEnum(RuleConditionOperator),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
});

/**
 * Zod schema for rule action
 */
export const RuleActionSchema = z.object({
  type: z.nativeEnum(RuleActionType),
  value: z.string().optional().describe('Action parameter (e.g., label name, forward address)'),
});

/**
 * Zod schema for rule
 */
export const RuleSchema = z.object({
  id: z.number().int().positive().optional(),
  accountId: z.number().int().positive(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  trigger: z.nativeEnum(RuleTrigger),
  conditions: z.array(RuleConditionSchema).min(1),
  actions: z.array(RuleActionSchema).min(1),
  isActive: z.boolean().default(true),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

/**
 * Rule condition interface
 */
export interface RuleCondition {
  field: RuleConditionField;
  operator: RuleConditionOperator;
  value: string | number | boolean | string[];
}

/**
 * Rule action interface
 */
export interface RuleAction {
  type: RuleActionType;
  value?: string;
}

/**
 * Rule interface
 */
export interface Rule {
  id?: number;
  accountId: number;
  name: string;
  description?: string;
  trigger: RuleTrigger;
  conditions: RuleCondition[];
  actions: RuleAction[];
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Database row for rules table
 */
export interface RuleRow {
  id: number;
  account_id: number;
  name: string;
  description: string | null;
  trigger: string;
  conditions: string; // JSON
  actions: string; // JSON
  is_active: number; // 0 or 1
  created_at: string;
  updated_at: string;
}

/**
 * Rule execution result
 */
export const RuleExecutionResultSchema = z.object({
  ruleId: z.number().int().positive(),
  ruleName: z.string(),
  emailId: z.number().int().positive(),
  matched: z.boolean(),
  actionsApplied: z.array(z.string()),
  dryRun: z.boolean(),
  executedAt: z.string(),
  error: z.string().optional(),
});

export interface RuleExecutionResult {
  ruleId: number;
  ruleName: string;
  emailId: number;
  matched: boolean;
  actionsApplied: string[];
  dryRun: boolean;
  executedAt: string;
  error?: string;
}
