/**
 * Mail Apply Rule Tool
 *
 * Apply automation rules to emails with dry-run support.
 */

import { z } from 'zod';
import { EmailProvider } from '../../types/account.js';
import { getAccountById } from '../../storage/services/account-storage.js';
import { getRuleById, getRulesByAccountId } from '../../storage/services/rule-storage.js';
import { getEmailById, searchEmails } from '../../storage/services/email-storage.js';
import { executeRules } from '../../rules/engine.js';
import { RuleExecutionResultSchema } from '../../types/rule.js';

/**
 * Input schema for mail_apply_rule
 */
const MailApplyRuleInputSchema = z.object({
  ruleId: z.number().int().positive().optional().describe('Specific rule ID to apply'),
  accountId: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Account ID (applies all rules if ruleId not specified)'),
  emailId: z.number().int().positive().optional().describe('Specific email ID to apply rule to'),
  query: z
    .string()
    .optional()
    .describe('Search query to find emails (if emailId not specified)'),
  limit: z
    .number()
    .int()
    .positive()
    .default(100)
    .describe('Max emails to process (default: 100)'),
  dryRun: z
    .boolean()
    .default(true)
    .describe('Dry run mode - preview changes without applying (default: true)'),
});

/**
 * Output schema for mail_apply_rule
 */
const MailApplyRuleOutputSchema = z.object({
  success: z.boolean(),
  accountId: z.number().int().positive().optional(),
  email: z.string().optional(),
  provider: z.nativeEnum(EmailProvider).optional(),
  dryRun: z.boolean(),
  results: z.array(RuleExecutionResultSchema),
  totalEmailsProcessed: z.number().int().nonnegative(),
  totalRulesMatched: z.number().int().nonnegative(),
  totalActionsApplied: z.number().int().nonnegative(),
  message: z.string(),
});

/**
 * Mail apply rule tool definition and handler
 */
export const mailApplyRuleTool = {
  definition: {
    name: 'mail_apply_rule',
    description:
      'Apply email automation rules with dry-run support. ' +
      'Can apply a specific rule to specific email(s), or apply all rules for an account. ' +
      'Dry-run mode (default) previews changes without modifying emails.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        ruleId: {
          type: 'number',
          description: 'Specific rule ID to apply (optional)',
        },
        accountId: {
          type: 'number',
          description: 'Account ID (applies all rules if ruleId not specified)',
        },
        emailId: {
          type: 'number',
          description: 'Specific email ID to apply rule to (optional)',
        },
        query: {
          type: 'string',
          description: 'Search query to find emails (if emailId not specified)',
        },
        limit: {
          type: 'number',
          description: 'Max emails to process (default: 100)',
          default: 100,
        },
        dryRun: {
          type: 'boolean',
          description: 'Dry run mode - preview changes without applying (default: true)',
          default: true,
        },
      },
    },
  },

  handler: async (args: unknown) => {
    // Validate input
    const input = MailApplyRuleInputSchema.parse(args);

    try {
      let account = null;
      let rules = [];

      // Get account if specified
      if (input.accountId) {
        console.error(`Fetching account ${input.accountId}...`);
        account = await getAccountById(input.accountId);

        if (!account) {
          throw new Error(`Account with ID ${input.accountId} not found`);
        }
      }

      // Get rule(s)
      if (input.ruleId) {
        console.error(`Fetching rule ${input.ruleId}...`);
        const rule = getRuleById(input.ruleId);

        if (!rule) {
          throw new Error(`Rule with ID ${input.ruleId} not found`);
        }

        if (!rule.isActive) {
          throw new Error(`Rule "${rule.name}" is not active`);
        }

        rules = [rule];

        // Set account from rule if not specified
        if (!account) {
          account = await getAccountById(rule.accountId);
        }
      } else if (input.accountId) {
        console.error(`Fetching rules for account ${input.accountId}...`);
        rules = getRulesByAccountId(input.accountId, true); // activeOnly=true

        if (rules.length === 0) {
          throw new Error(`No active rules found for account ${input.accountId}`);
        }
      } else {
        throw new Error('Either ruleId or accountId must be specified');
      }

      console.error(
        `${input.dryRun ? '[DRY RUN] ' : ''}Applying ${rules.length} rule(s)...`
      );

      // Get email(s) to process
      let emails = [];

      if (input.emailId) {
        console.error(`Fetching email ${input.emailId}...`);
        const email = await getEmailById(input.emailId);

        if (!email) {
          throw new Error(`Email with ID ${input.emailId} not found`);
        }

        emails = [email];
      } else {
        // Search for emails
        console.error('Searching for emails...');
        const searchResult = await searchEmails({
          accountId: input.accountId,
          query: input.query,
          limit: input.limit,
          offset: 0,
        });

        emails = searchResult.items;

        if (emails.length === 0) {
          throw new Error('No emails found matching search criteria');
        }
      }

      console.error(`Processing ${emails.length} email(s)...`);

      // Apply rules to emails
      const allResults = [];

      for (const email of emails) {
        const results = await executeRules(rules, email, input.dryRun);
        allResults.push(...results);
      }

      // Calculate statistics
      const totalRulesMatched = allResults.filter((r) => r.matched).length;
      const totalActionsApplied = allResults.reduce(
        (sum, r) => sum + r.actionsApplied.length,
        0
      );

      console.error(
        `${input.dryRun ? '[DRY RUN] ' : ''}Processed ${emails.length} email(s), ` +
          `${totalRulesMatched} rule(s) matched, ${totalActionsApplied} action(s) applied`
      );

      const output = {
        success: true,
        accountId: account?.id,
        email: account?.email,
        provider: account?.provider,
        dryRun: input.dryRun,
        results: allResults,
        totalEmailsProcessed: emails.length,
        totalRulesMatched,
        totalActionsApplied,
        message:
          `${input.dryRun ? '[DRY RUN] ' : ''}Processed ${emails.length} email(s), ` +
          `${totalRulesMatched} rule(s) matched, ${totalActionsApplied} action(s) ${input.dryRun ? 'would be' : 'were'} applied`,
      };

      // Validate output
      const validated = MailApplyRuleOutputSchema.parse(output);

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

      console.error(`Apply rule failed: ${errorMessage}`);

      // Return error response
      const output = {
        success: false,
        accountId: input.accountId,
        dryRun: input.dryRun,
        results: [],
        totalEmailsProcessed: 0,
        totalRulesMatched: 0,
        totalActionsApplied: 0,
        message: `Apply rule failed: ${errorMessage}`,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(MailApplyRuleOutputSchema.parse(output), null, 2),
          },
        ],
      };
    }
  },
};

export type MailApplyRuleInput = z.infer<typeof MailApplyRuleInputSchema>;
export type MailApplyRuleOutput = z.infer<typeof MailApplyRuleOutputSchema>;
