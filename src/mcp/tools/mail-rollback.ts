/**
 * Mail Rollback Tool
 *
 * Rollback rule executions to restore email states.
 */

import { z } from 'zod';
import {
  executeRollback,
  rollbackRule,
  rollbackEmail,
  previewRollback,
  getRollbackStats,
} from '../../storage/services/rollback.js';

/**
 * Input schema for mail_rollback
 */
const MailRollbackInputSchema = z.object({
  auditLogId: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Specific audit log entry ID to rollback'),
  ruleId: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Rollback all executions for this rule'),
  emailId: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Rollback all executions for this email'),
  preview: z
    .boolean()
    .default(false)
    .describe('Preview rollback changes without applying (requires auditLogId)'),
  dryRun: z
    .boolean()
    .default(true)
    .describe('Dry run mode - preview changes without applying (default: true)'),
  stats: z.boolean().default(false).describe('Return rollback statistics'),
  limit: z
    .number()
    .int()
    .positive()
    .default(100)
    .describe('Max entries to rollback (for ruleId/emailId)'),
});

/**
 * Output schema for mail_rollback
 */
const MailRollbackOutputSchema = z.object({
  success: z.boolean(),
  preview: z
    .object({
      auditLogId: z.number().int().positive(),
      emailId: z.number().int().positive(),
      ruleId: z.number().int().positive(),
      ruleName: z.string(),
      currentState: z.object({
        labels: z.array(z.string()),
        flags: z.array(z.string()),
      }),
      targetState: z.object({
        labels: z.array(z.string()),
        flags: z.array(z.string()),
        lastModified: z.string(),
      }),
      changes: z.object({
        labelsToAdd: z.array(z.string()),
        labelsToRemove: z.array(z.string()),
        flagsToSet: z.array(z.string()),
      }),
      executedAt: z.string(),
    })
    .optional(),
  results: z
    .array(
      z.object({
        success: z.boolean(),
        auditLogId: z.number().int().positive(),
        emailId: z.number().int().positive(),
        ruleId: z.number().int().positive(),
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
        restoredState: z.object({
          labels: z.array(z.string()),
          flags: z.array(z.string()),
          lastModified: z.string(),
        }),
        message: z.string(),
        error: z.string().optional(),
      })
    )
    .optional(),
  stats: z
    .object({
      totalRollbackable: z.number().int().nonnegative(),
      byRule: z.array(
        z.object({
          ruleId: z.number().int().positive(),
          count: z.number().int().nonnegative(),
        })
      ),
      byEmail: z.array(
        z.object({
          emailId: z.number().int().positive(),
          count: z.number().int().nonnegative(),
        })
      ),
    })
    .optional(),
  dryRun: z.boolean(),
  totalRolledBack: z.number().int().nonnegative().optional(),
  message: z.string(),
});

/**
 * Mail rollback tool definition and handler
 */
export const mailRollbackTool = {
  definition: {
    name: 'mail_rollback',
    description:
      'Rollback rule executions to restore email states. ' +
      'Supports rollback by audit log ID, rule ID, or email ID. ' +
      'Use preview mode to see changes before applying. ' +
      'Dry run enabled by default for safety.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        auditLogId: {
          type: 'number',
          description: 'Specific audit log entry ID to rollback',
        },
        ruleId: {
          type: 'number',
          description: 'Rollback all executions for this rule',
        },
        emailId: {
          type: 'number',
          description: 'Rollback all executions for this email',
        },
        preview: {
          type: 'boolean',
          description: 'Preview rollback changes without applying (requires auditLogId)',
          default: false,
        },
        dryRun: {
          type: 'boolean',
          description: 'Dry run mode - preview changes without applying (default: true)',
          default: true,
        },
        stats: {
          type: 'boolean',
          description: 'Return rollback statistics',
          default: false,
        },
        limit: {
          type: 'number',
          description: 'Max entries to rollback (for ruleId/emailId)',
          default: 100,
        },
      },
    },
  },

  handler: async (args: unknown) => {
    // Validate input
    const input = MailRollbackInputSchema.parse(args);

    try {
      // Return statistics if requested
      if (input.stats) {
        console.error('Fetching rollback statistics...');
        const stats = getRollbackStats();

        const output = {
          success: true,
          stats,
          dryRun: input.dryRun,
          message: `Rollback statistics: ${stats.totalRollbackable} entries can be rolled back`,
        };

        // Validate output
        const validated = MailRollbackOutputSchema.parse(output);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(validated, null, 2),
            },
          ],
        };
      }

      // Preview mode - show what would be changed
      if (input.preview) {
        if (!input.auditLogId) {
          throw new Error('Preview mode requires auditLogId');
        }

        console.error(`Previewing rollback for audit log entry ${input.auditLogId}...`);
        const preview = await previewRollback(input.auditLogId);

        if (!preview) {
          throw new Error(`Audit log entry ${input.auditLogId} not found`);
        }

        const output = {
          success: true,
          preview,
          dryRun: true,
          message: `Preview shows ${preview.changes.labelsToAdd.length + preview.changes.labelsToRemove.length} label changes and flag reset`,
        };

        // Validate output
        const validated = MailRollbackOutputSchema.parse(output);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(validated, null, 2),
            },
          ],
        };
      }

      // Execute rollback based on what was specified
      let results;

      if (input.auditLogId) {
        console.error(
          `${input.dryRun ? '[DRY RUN] ' : ''}Rolling back audit log entry ${input.auditLogId}...`
        );
        const result = await executeRollback(input.auditLogId, input.dryRun);
        results = [result];
      } else if (input.ruleId) {
        console.error(
          `${input.dryRun ? '[DRY RUN] ' : ''}Rolling back all executions for rule ${input.ruleId}...`
        );
        results = await rollbackRule(input.ruleId, input.dryRun, input.limit);
      } else if (input.emailId) {
        console.error(
          `${input.dryRun ? '[DRY RUN] ' : ''}Rolling back all executions for email ${input.emailId}...`
        );
        results = await rollbackEmail(input.emailId, input.dryRun, input.limit);
      } else {
        throw new Error('Either auditLogId, ruleId, or emailId must be specified');
      }

      const successCount = results.filter((r) => r.success).length;
      const totalRolledBack = successCount;

      console.error(
        `${input.dryRun ? '[DRY RUN] ' : ''}Rollback complete: ${successCount}/${results.length} successful`
      );

      const output = {
        success: true,
        results,
        dryRun: input.dryRun,
        totalRolledBack,
        message:
          `${input.dryRun ? '[DRY RUN] ' : ''}Rollback complete: ${successCount}/${results.length} successful. ` +
          (input.dryRun
            ? 'Run with dryRun: false to apply changes.'
            : 'Email states have been restored.'),
      };

      // Validate output
      const validated = MailRollbackOutputSchema.parse(output);

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

      console.error(`Rollback failed: ${errorMessage}`);

      // Return error response
      const output = {
        success: false,
        dryRun: input.dryRun,
        message: `Rollback failed: ${errorMessage}`,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(MailRollbackOutputSchema.parse(output), null, 2),
          },
        ],
      };
    }
  },
};

export type MailRollbackInput = z.infer<typeof MailRollbackInputSchema>;
export type MailRollbackOutput = z.infer<typeof MailRollbackOutputSchema>;
