/**
 * Mail Create Rule Tool
 *
 * Create a new email automation rule.
 */

import { z } from 'zod';
import { EmailProvider } from '../../types/account.js';
import { getAccountById } from '../../storage/services/account-storage.js';
import { createRule } from '../../storage/services/rule-storage.js';
import {
  RuleSchema,
  RuleConditionSchema,
  RuleActionSchema,
  RuleTrigger,
} from '../../types/rule.js';

/**
 * Input schema for mail_create_rule
 */
const MailCreateRuleInputSchema = z.object({
  accountId: z.number().int().positive().describe('Account ID to create rule for'),
  name: z.string().min(1).max(255).describe('Rule name'),
  description: z.string().optional().describe('Rule description'),
  trigger: z.nativeEnum(RuleTrigger).describe('When to trigger the rule'),
  conditions: z
    .array(RuleConditionSchema)
    .min(1)
    .describe('Conditions that must match (AND logic)'),
  actions: z.array(RuleActionSchema).min(1).describe('Actions to apply when conditions match'),
  isActive: z.boolean().default(true).describe('Whether rule is active'),
});

/**
 * Output schema for mail_create_rule
 */
const MailCreateRuleOutputSchema = z.object({
  success: z.boolean(),
  accountId: z.number().int().positive(),
  email: z.string(),
  provider: z.nativeEnum(EmailProvider),
  rule: RuleSchema.optional(),
  message: z.string(),
});

/**
 * Mail create rule tool definition and handler
 */
export const mailCreateRuleTool = {
  definition: {
    name: 'mail_create_rule',
    description:
      'Create a new email automation rule with conditions and actions. ' +
      'Conditions are evaluated with AND logic (all must match). ' +
      'Actions are applied in order when conditions match.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        accountId: {
          type: 'number',
          description: 'Account ID to create rule for',
        },
        name: {
          type: 'string',
          description: 'Rule name',
        },
        description: {
          type: 'string',
          description: 'Rule description',
        },
        trigger: {
          type: 'string',
          enum: Object.values(RuleTrigger),
          description: 'When to trigger the rule (on_new_email, manual, scheduled)',
        },
        conditions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: {
                type: 'string',
                description: 'Email field to check (from, to, subject, body, label, etc.)',
              },
              operator: {
                type: 'string',
                description:
                  'Comparison operator (equals, contains, matches_regex, greater_than, etc.)',
              },
              value: {
                description: 'Value to compare against',
              },
            },
            required: ['field', 'operator', 'value'],
          },
          description: 'Conditions that must match (AND logic)',
        },
        actions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                description: 'Action type (add_label, mark_read, archive, etc.)',
              },
              value: {
                type: 'string',
                description: 'Action parameter (e.g., label name for add_label)',
              },
            },
            required: ['type'],
          },
          description: 'Actions to apply when conditions match',
        },
        isActive: {
          type: 'boolean',
          description: 'Whether rule is active (default: true)',
          default: true,
        },
      },
      required: ['accountId', 'name', 'trigger', 'conditions', 'actions'],
    },
  },

  handler: async (args: unknown) => {
    // Validate input
    const input = MailCreateRuleInputSchema.parse(args);

    try {
      // Get account
      console.error(`Fetching account ${input.accountId}...`);
      const account = await getAccountById(input.accountId);

      if (!account) {
        throw new Error(`Account with ID ${input.accountId} not found`);
      }

      if (!account.isActive) {
        throw new Error(`Account ${account.email} is inactive`);
      }

      console.error(`Creating rule "${input.name}" for ${account.email}...`);

      // Create rule
      const rule = createRule({
        accountId: input.accountId,
        name: input.name,
        description: input.description,
        trigger: input.trigger,
        conditions: input.conditions,
        actions: input.actions,
        isActive: input.isActive,
      });

      console.error(`Rule created successfully. ID: ${rule.id}`);

      const output = {
        success: true,
        accountId: account.id,
        email: account.email,
        provider: account.provider,
        rule,
        message: `Successfully created rule "${rule.name}" for ${account.email}. Rule ID: ${rule.id}`,
      };

      // Validate output
      const validated = MailCreateRuleOutputSchema.parse(output);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(validated, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      console.error(`Create rule failed: ${errorMessage}`);

      // Return error response
      const output = {
        success: false,
        accountId: input.accountId,
        email: 'unknown',
        provider: EmailProvider.GMAIL,
        message: `Create rule failed: ${errorMessage}`,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(MailCreateRuleOutputSchema.parse(output), null, 2),
          },
        ],
      };
    }
  },
};

export type MailCreateRuleInput = z.infer<typeof MailCreateRuleInputSchema>;
export type MailCreateRuleOutput = z.infer<typeof MailCreateRuleOutputSchema>;
