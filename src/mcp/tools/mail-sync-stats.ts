/**
 * Mail Sync Statistics Tool
 *
 * Get sync metrics and statistics for monitoring and diagnostics.
 */

import { z } from 'zod';
import {
  getSyncMetricsByAccount,
  getSyncStats,
  getRecentSyncErrors,
} from '../../storage/services/sync-metrics.js';
import { getCacheStats as getAttachmentCacheStats } from '../../storage/services/attachment-cache.js';

/**
 * Input schema for mail_sync_stats
 */
const MailSyncStatsInputSchema = z.object({
  accountId: z.number().int().positive().optional().describe('Account ID for account-specific stats'),
  includeHistory: z
    .boolean()
    .default(false)
    .describe('Include recent sync history'),
  includeErrors: z.boolean().default(true).describe('Include recent sync errors'),
  includeCacheStats: z.boolean().default(true).describe('Include attachment cache statistics'),
});

/**
 * Output schema for mail_sync_stats
 */
const MailSyncStatsOutputSchema = z.object({
  accountStats: z
    .object({
      accountId: z.number(),
      totalSyncs: z.number(),
      successfulSyncs: z.number(),
      failedSyncs: z.number(),
      totalMessagesAdded: z.number(),
      totalMessagesDeleted: z.number(),
      averageDurationMs: z.number(),
      lastSyncAt: z.string().nullable(),
      lastSyncSuccess: z.boolean().nullable(),
    })
    .optional(),
  recentHistory: z
    .array(
      z.object({
        id: z.number(),
        provider: z.string(),
        syncType: z.enum(['initial', 'delta']),
        messagesAdded: z.number(),
        messagesDeleted: z.number(),
        labelsChanged: z.number(),
        durationMs: z.number(),
        success: z.boolean(),
        syncedAt: z.string(),
      })
    )
    .optional(),
  recentErrors: z
    .array(
      z.object({
        id: z.number(),
        provider: z.string(),
        syncType: z.enum(['initial', 'delta']),
        errorMessage: z.string().optional(),
        syncedAt: z.string(),
      })
    )
    .optional(),
  cacheStats: z
    .object({
      totalFiles: z.number(),
      totalSizeBytes: z.number(),
      totalSizeMB: z.number(),
      limitMB: z.number(),
      usagePercent: z.number(),
    })
    .optional(),
});

/**
 * Mail sync statistics tool definition and handler
 */
export const mailSyncStatsTool = {
  definition: {
    name: 'mail_sync_stats',
    description:
      'Get sync statistics and metrics for monitoring email sync operations. ' +
      'Shows sync history, error rates, performance metrics, and cache usage.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        accountId: {
          type: 'number',
          description: 'Account ID for account-specific stats',
        },
        includeHistory: {
          type: 'boolean',
          description: 'Include recent sync history',
          default: false,
        },
        includeErrors: {
          type: 'boolean',
          description: 'Include recent sync errors',
          default: true,
        },
        includeCacheStats: {
          type: 'boolean',
          description: 'Include attachment cache statistics',
          default: true,
        },
      },
    },
  },

  handler: async (args: unknown) => {
    // Validate input
    const input = MailSyncStatsInputSchema.parse(args);

    try {
      const output: any = {};

      // Get account-specific stats if accountId provided
      if (input.accountId !== undefined) {
        const stats = getSyncStats(input.accountId);
        output.accountStats = {
          accountId: input.accountId,
          ...stats,
        };

        // Include sync history for this account
        if (input.includeHistory) {
          const history = getSyncMetricsByAccount(input.accountId, 20);
          output.recentHistory = history.map((h) => ({
            id: h.id,
            provider: h.provider,
            syncType: h.syncType,
            messagesAdded: h.messagesAdded,
            messagesDeleted: h.messagesDeleted,
            labelsChanged: h.labelsChanged,
            durationMs: h.durationMs,
            success: h.success,
            syncedAt: h.syncedAt,
          }));
        }
      }

      // Include recent sync errors (all accounts)
      if (input.includeErrors) {
        const errors = getRecentSyncErrors(10);
        output.recentErrors = errors.map((e) => ({
          id: e.id,
          provider: e.provider,
          syncType: e.syncType,
          errorMessage: e.errorMessage,
          syncedAt: e.syncedAt,
        }));
      }

      // Include attachment cache stats
      if (input.includeCacheStats) {
        output.cacheStats = await getAttachmentCacheStats();
      }

      // Validate output
      const validated = MailSyncStatsOutputSchema.parse(output);

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

      console.error(`Get sync stats failed: ${errorMessage}`);

      // Return minimal error response
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: `Failed to get sync stats: ${errorMessage}`,
            }),
          },
        ],
      };
    }
  },
};

export type MailSyncStatsInput = z.infer<typeof MailSyncStatsInputSchema>;
export type MailSyncStatsOutput = z.infer<typeof MailSyncStatsOutputSchema>;
