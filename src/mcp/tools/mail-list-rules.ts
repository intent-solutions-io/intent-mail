/**
 * Mail List Rules Tool
 *
 * List email automation rules for an account.
 */

import { z } from 'zod';
import { EmailProvider } from '../../types/account.js';
import { getAccountById } from '../../storage/services/account-storage.js';
import { getRulesByAccountId, getAllRules } from '../../storage/services/rule-storage.js';
import { RuleSchema } from '../../types/rule.js';

/**
 * Input schema for mail_list_rules
 */
const MailListRulesInputSchema = z.object({
  accountId: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Account ID to list rules for (optional, lists all if omitted)'),
  activeOnly: z
    .boolean()
    .default(false)
    .describe('Only return active rules (default: false)'),
});

/**
 * Output schema for mail_list_rules
 */
const MailListRulesOutputSchema = z.object({
  success: z.boolean(),
  accountId: z.number().int().positive().optional(),
  email: z.string().optional(),
  provider: z.nativeEnum(EmailProvider).optional(),
  rules: z.array(RuleSchema),
  totalRules: z.number().int().nonnegative(),
  activeRules: z.number().int().nonnegative(),
  message: z.string(),
});

/**
 * Mail list rules tool definition and handler
 */
export const mailListRulesTool = {
  definition: {
    name: 'mail_list_rules',
    description:
      'List email automation rules. Returns all rules for a specific account, or all rules across all accounts.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        accountId: {
          type: 'number',
          description: 'Account ID to list rules for (optional, lists all if omitted)',
        },
        activeOnly: {
          type: 'boolean',
          description: 'Only return active rules (default: false)',
          default: false,
        },
      },
    },
  },

  handler: async (args: unknown) => {
    // Validate input
    const input = MailListRulesInputSchema.parse(args);

    try {
      let rules;
      let account = null;

      if (input.accountId) {
        // Get specific account
        console.error(`Fetching account ${input.accountId}...`);
        account = await getAccountById(input.accountId);

        if (!account) {
          throw new Error(`Account with ID ${input.accountId} not found`);
        }

        console.error(`Listing rules for ${account.email}...`);
        rules = getRulesByAccountId(input.accountId, input.activeOnly);
      } else {
        // Get all rules
        console.error('Listing all rules...');
        rules = getAllRules(input.activeOnly);
      }

      const activeRules = rules.filter((rule) => rule.isActive).length;

      console.error(`Found ${rules.length} rule(s) (${activeRules} active)`);

      const output = {
        success: true,
        accountId: account?.id,
        email: account?.email,
        provider: account?.provider,
        rules,
        totalRules: rules.length,
        activeRules,
        message: input.accountId
          ? `Found ${rules.length} rule(s) for ${account?.email}`
          : `Found ${rules.length} rule(s) across all accounts`,
      };

      // Validate output
      const validated = MailListRulesOutputSchema.parse(output);

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

      console.error(`List rules failed: ${errorMessage}`);

      // Return error response
      const output = {
        success: false,
        accountId: input.accountId,
        rules: [],
        totalRules: 0,
        activeRules: 0,
        message: `List rules failed: ${errorMessage}`,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(MailListRulesOutputSchema.parse(output), null, 2),
          },
        ],
      };
    }
  },
};

export type MailListRulesInput = z.infer<typeof MailListRulesInputSchema>;
export type MailListRulesOutput = z.infer<typeof MailListRulesOutputSchema>;
