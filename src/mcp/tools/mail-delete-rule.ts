/**
 * Mail Delete Rule Tool
 *
 * Delete an email automation rule.
 */

import { z } from 'zod';
import { getRuleById, deleteRule } from '../../storage/services/rule-storage.js';

/**
 * Input schema for mail_delete_rule
 */
const MailDeleteRuleInputSchema = z.object({
  ruleId: z.number().int().positive().describe('Rule ID to delete'),
});

/**
 * Output schema for mail_delete_rule
 */
const MailDeleteRuleOutputSchema = z.object({
  success: z.boolean(),
  ruleId: z.number().int().positive(),
  ruleName: z.string().optional(),
  message: z.string(),
});

/**
 * Mail delete rule tool definition and handler
 */
export const mailDeleteRuleTool = {
  definition: {
    name: 'mail_delete_rule',
    description: 'Delete an email automation rule permanently.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        ruleId: {
          type: 'number',
          description: 'Rule ID to delete',
        },
      },
      required: ['ruleId'],
    },
  },

  handler: async (args: unknown) => {
    // Validate input
    const input = MailDeleteRuleInputSchema.parse(args);

    try {
      // Get rule to verify it exists
      console.error(`Fetching rule ${input.ruleId}...`);
      const rule = getRuleById(input.ruleId);

      if (!rule) {
        throw new Error(`Rule with ID ${input.ruleId} not found`);
      }

      console.error(`Deleting rule "${rule.name}"...`);

      // Delete rule
      const deleted = deleteRule(input.ruleId);

      if (!deleted) {
        throw new Error(`Failed to delete rule with ID ${input.ruleId}`);
      }

      console.error(`Rule deleted successfully`);

      const output = {
        success: true,
        ruleId: input.ruleId,
        ruleName: rule.name,
        message: `Successfully deleted rule "${rule.name}" (ID: ${input.ruleId})`,
      };

      // Validate output
      const validated = MailDeleteRuleOutputSchema.parse(output);

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

      console.error(`Delete rule failed: ${errorMessage}`);

      // Return error response
      const output = {
        success: false,
        ruleId: input.ruleId,
        message: `Delete rule failed: ${errorMessage}`,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(MailDeleteRuleOutputSchema.parse(output), null, 2),
          },
        ],
      };
    }
  },
};

export type MailDeleteRuleInput = z.infer<typeof MailDeleteRuleInputSchema>;
export type MailDeleteRuleOutput = z.infer<typeof MailDeleteRuleOutputSchema>;
