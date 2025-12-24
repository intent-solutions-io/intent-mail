/**
 * Mail Get Audit Log Tool
 *
 * Retrieve audit log entries for rule executions.
 */

import { z } from 'zod';
import {
  getRecentAuditLogEntries,
  getAuditLogEntriesByRule,
  getAuditLogEntriesByEmail,
  getAuditLogStats,
  countAuditLogEntries,
} from '../../storage/services/audit-log.js';

/**
 * Input schema for mail_get_audit_log
 */
const MailGetAuditLogInputSchema = z.object({
  ruleId: z.number().int().positive().optional().describe('Filter by rule ID'),
  emailId: z.number().int().positive().optional().describe('Filter by email ID'),
  limit: z
    .number()
    .int()
    .positive()
    .default(50)
    .describe('Max entries to return (default: 50)'),
  offset: z.number().int().nonnegative().default(0).describe('Pagination offset (default: 0)'),
  stats: z.boolean().default(false).describe('Return statistics instead of entries'),
});

/**
 * Output schema for mail_get_audit_log
 */
const MailGetAuditLogOutputSchema = z.object({
  success: z.boolean(),
  entries: z
    .array(
      z.object({
        id: z.number().int().positive(),
        ruleId: z.number().int().positive(),
        emailId: z.number().int().positive(),
        executionResult: z.object({
          ruleId: z.number().int().positive(),
          ruleName: z.string(),
          emailId: z.number().int().positive(),
          matched: z.boolean(),
          actionsApplied: z.array(z.string()),
          dryRun: z.boolean(),
          executedAt: z.string(),
          error: z.string().optional(),
        }),
        stateBefore: z.object({
          labels: z.array(z.string()),
          flags: z.array(z.string()),
          lastModified: z.string(),
        }),
        stateAfter: z
          .object({
            labels: z.array(z.string()),
            flags: z.array(z.string()),
            lastModified: z.string(),
          })
          .nullable(),
        executedAt: z.string(),
        rolledBack: z.boolean(),
        rolledBackAt: z.string().nullable(),
      })
    )
    .optional(),
  stats: z
    .object({
      totalEntries: z.number().int().nonnegative(),
      totalRolledBack: z.number().int().nonnegative(),
      entriesByRule: z.array(
        z.object({
          ruleId: z.number().int().positive(),
          ruleName: z.string(),
          count: z.number().int().nonnegative(),
        })
      ),
    })
    .optional(),
  count: z.number().int().nonnegative().describe('Number of entries in current page'),
  totalEntries: z.number().int().nonnegative().describe('Total entries matching query'),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  message: z.string(),
});

/**
 * Mail get audit log tool definition and handler
 */
export const mailGetAuditLogTool = {
  definition: {
    name: 'mail_get_audit_log',
    description:
      'Retrieve audit log entries for rule executions. ' +
      'Shows history of rule applications with before/after states for rollback. ' +
      'Can filter by rule or email, or get statistics.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        ruleId: {
          type: 'number',
          description: 'Filter by rule ID (optional)',
        },
        emailId: {
          type: 'number',
          description: 'Filter by email ID (optional)',
        },
        limit: {
          type: 'number',
          description: 'Max entries to return (default: 50)',
          default: 50,
        },
        offset: {
          type: 'number',
          description: 'Pagination offset (default: 0)',
          default: 0,
        },
        stats: {
          type: 'boolean',
          description: 'Return statistics instead of entries',
          default: false,
        },
      },
    },
  },

  handler: async (args: unknown) => {
    // Validate input
    const input = MailGetAuditLogInputSchema.parse(args);

    try {
      // Return statistics if requested
      if (input.stats) {
        console.error('Fetching audit log statistics...');
        const stats = getAuditLogStats();

        const output = {
          success: true,
          stats,
          count: 0,
          totalEntries: stats.totalEntries,
          limit: input.limit,
          offset: input.offset,
          message: `Audit log statistics: ${stats.totalEntries} total entries, ${stats.totalRolledBack} rolled back`,
        };

        // Validate output
        const validated = MailGetAuditLogOutputSchema.parse(output);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(validated, null, 2),
            },
          ],
        };
      }

      // Fetch entries based on filters
      let entries;
      let totalEntries;

      if (input.ruleId) {
        console.error(`Fetching audit log entries for rule ${input.ruleId}...`);
        entries = getAuditLogEntriesByRule(input.ruleId, input.limit, input.offset);
        totalEntries = countAuditLogEntries(input.ruleId);
      } else if (input.emailId) {
        console.error(`Fetching audit log entries for email ${input.emailId}...`);
        entries = getAuditLogEntriesByEmail(input.emailId, input.limit, input.offset);
        totalEntries = countAuditLogEntries(undefined, input.emailId);
      } else {
        console.error('Fetching recent audit log entries...');
        entries = getRecentAuditLogEntries(input.limit, input.offset);
        totalEntries = countAuditLogEntries();
      }

      console.error(`Found ${entries.length} audit log entries (${totalEntries} total)`);

      const output = {
        success: true,
        entries,
        count: entries.length,
        totalEntries,
        limit: input.limit,
        offset: input.offset,
        message: `Retrieved ${entries.length} of ${totalEntries} audit log entries`,
      };

      // Validate output
      const validated = MailGetAuditLogOutputSchema.parse(output);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(validated, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      console.error(`Get audit log failed: ${errorMessage}`);

      // Return error response with safe defaults
      const output = {
        success: false as const,
        count: 0,
        totalEntries: 0,
        limit: input.limit,
        offset: input.offset,
        message: `Get audit log failed: ${errorMessage}`,
      };

      // Validate output (should never fail with safe defaults above)
      try {
        const validated = MailGetAuditLogOutputSchema.parse(output);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(validated, null, 2),
            },
          ],
        };
      } catch (validationError) {
        // Fallback if validation fails (should never happen)
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                count: 0,
                totalEntries: 0,
                limit: 50,
                offset: 0,
                message: 'Internal error during error handling',
              }, null, 2),
            },
          ],
        };
      }
    }
  },
};

export type MailGetAuditLogInput = z.infer<typeof MailGetAuditLogInputSchema>;
export type MailGetAuditLogOutput = z.infer<typeof MailGetAuditLogOutputSchema>;
