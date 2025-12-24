/**
 * Mail Sync Tool
 *
 * Trigger email sync for Gmail or Outlook account (initial or delta).
 */

import { z } from 'zod';
import { EmailProvider } from '../../types/account.js';
import {
  getAccountById,
  updateSyncState,
  updateTokens,
} from '../../storage/services/account-storage.js';
import {
  createGmailOAuth,
  getGmailOAuthConfigFromEnv,
} from '../../connectors/gmail/oauth.js';
import {
  createOutlookOAuth,
  getOutlookOAuthConfigFromEnv,
} from '../../connectors/outlook/oauth.js';
import { createGmailClient } from '../../connectors/gmail/client.js';
import { createOutlookClient } from '../../connectors/outlook/client.js';
import { createGmailSync } from '../../connectors/gmail/sync.js';
import { createOutlookSync } from '../../connectors/outlook/sync.js';
import { recordSyncMetrics } from '../../storage/services/sync-metrics.js';

/**
 * Input schema for mail_sync
 */
const MailSyncInputSchema = z.object({
  accountId: z.number().int().positive().describe('Account ID to sync'),
  maxMessages: z
    .number()
    .int()
    .positive()
    .default(1000)
    .describe('Max messages for initial sync (default: 1000)'),
  forceInitial: z
    .boolean()
    .default(false)
    .describe('Force initial sync even if history exists'),
});

/**
 * Output schema for mail_sync
 */
const MailSyncOutputSchema = z.object({
  success: z.boolean(),
  accountId: z.number().int().positive(),
  email: z.string(),
  provider: z.nativeEnum(EmailProvider),
  syncType: z.enum(['initial', 'delta']),
  messagesAdded: z.number().int().nonnegative(),
  messagesDeleted: z.number().int().nonnegative(),
  labelsChanged: z.number().int().nonnegative(),
  newHistoryId: z.string(),
  syncedAt: z.string(),
  message: z.string(),
});

/**
 * Mail sync tool definition and handler
 */
export const mailSyncTool = {
  definition: {
    name: 'mail_sync',
    description:
      'Sync emails for a Gmail or Outlook account. Performs initial sync (up to maxMessages) if no history, or delta sync (only changes) if history/deltaLink exists.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        accountId: {
          type: 'number',
          description: 'Account ID to sync',
        },
        maxMessages: {
          type: 'number',
          description: 'Max messages for initial sync (default: 1000)',
          default: 1000,
        },
        forceInitial: {
          type: 'boolean',
          description: 'Force initial sync even if history exists',
          default: false,
        },
      },
      required: ['accountId'],
    },
  },

  handler: async (args: unknown) => {
    // Validate input
    const input = MailSyncInputSchema.parse(args);

    let syncStartTime = Date.now();

    try {
      // Get account with tokens
      console.error(`Fetching account ${input.accountId}...`);
      const account = await getAccountById(input.accountId, true); // includeTokens=true

      if (!account) {
        throw new Error(`Account with ID ${input.accountId} not found`);
      }

      if (!account.isActive) {
        throw new Error(`Account ${account.email} is inactive`);
      }

      if (!account.tokens) {
        throw new Error(
          `Account ${account.email} has no OAuth tokens. Run mail_auth_start first.`
        );
      }

      console.error(`Account: ${account.email} (${account.provider})`);

      let result: any;
      let syncType: string;
      syncStartTime = Date.now(); // Update start time after account validation

      if (account.provider === EmailProvider.GMAIL) {
        // Gmail sync flow
        const config = getGmailOAuthConfigFromEnv();
        const oauth = createGmailOAuth(config);
        oauth.setCredentials(account.tokens);

        // Check and refresh tokens if needed
        if (oauth.isTokenExpired(account.tokens)) {
          console.error('Tokens expired, refreshing...');
          const newTokens = await oauth.refreshAccessToken(account.tokens.refreshToken);
          await updateTokens({ accountId: account.id, tokens: newTokens });
          oauth.setCredentials(newTokens);
          console.error('Tokens refreshed successfully');
        }

        const client = createGmailClient(oauth);
        const sync = createGmailSync(client, account.id);

        const hasHistory = account.syncState?.lastHistoryId && !input.forceInitial;
        syncType = hasHistory ? 'delta' : 'initial';

        console.error(`Starting ${syncType} Gmail sync for ${account.email}...`);

        result = hasHistory
          ? await sync.deltaSync(account.syncState!.lastHistoryId!)
          : await sync.initialSync(input.maxMessages);

        // Update sync state with lastHistoryId for Gmail
        await updateSyncState({
          accountId: account.id,
          syncState: {
            lastHistoryId: result.newHistoryId,
            lastSyncAt: result.syncedAt,
          },
        });
      } else if (account.provider === EmailProvider.OUTLOOK) {
        // Outlook sync flow
        const config = getOutlookOAuthConfigFromEnv();
        const oauth = createOutlookOAuth(config);
        oauth.setCredentials(account.tokens);

        // Check and refresh tokens if needed
        if (oauth.isTokenExpired(account.tokens)) {
          console.error('Tokens expired, refreshing...');
          const newTokens = await oauth.refreshAccessToken(account.tokens.refreshToken);
          await updateTokens({ accountId: account.id, tokens: newTokens });
          oauth.setCredentials(newTokens);
          console.error('Tokens refreshed successfully');
        }

        const client = createOutlookClient(oauth);
        const sync = createOutlookSync(client, account.id);

        const hasDeltaLink = account.syncState?.deltaToken && !input.forceInitial;
        syncType = hasDeltaLink ? 'delta' : 'initial';

        console.error(`Starting ${syncType} Outlook sync for ${account.email}...`);

        result = hasDeltaLink
          ? await sync.deltaSync(account.syncState!.deltaToken!)
          : await sync.initialSync(input.maxMessages);

        // Update sync state with deltaLink for Outlook
        await updateSyncState({
          accountId: account.id,
          syncState: {
            deltaToken: result.deltaLink,
            lastSyncAt: result.syncedAt,
          },
        });
      } else {
        throw new Error(`Unsupported provider: ${account.provider}`);
      }

      console.error(
        `Sync complete: +${result.messagesAdded} -${result.messagesDeleted || 0} ~${result.labelsChanged || 0} messages`
      );

      console.error('Sync state updated in database');

      // Record sync metrics
      const syncDuration = Date.now() - syncStartTime;
      recordSyncMetrics({
        accountId: account.id,
        provider: account.provider,
        syncType: syncType as 'initial' | 'delta',
        messagesAdded: result.messagesAdded,
        messagesDeleted: result.messagesDeleted || 0,
        labelsChanged: result.labelsChanged || 0,
        durationMs: syncDuration,
        success: true,
        syncedAt: result.syncedAt,
      });

      console.error(`Sync metrics recorded (duration: ${syncDuration}ms)`);

      const output = {
        success: true,
        accountId: account.id,
        email: account.email,
        provider: account.provider,
        syncType,
        messagesAdded: result.messagesAdded,
        messagesDeleted: result.messagesDeleted || 0,
        labelsChanged: result.labelsChanged || 0,
        newHistoryId: result.newHistoryId || result.deltaLink || '',
        syncedAt: result.syncedAt,
        message: `Successfully synced ${account.email}. ${syncType === 'initial' ? 'Initial' : 'Delta'} sync: +${result.messagesAdded} -${result.messagesDeleted || 0} ~${result.labelsChanged || 0} messages`,
      };

      // Validate output
      const validated = MailSyncOutputSchema.parse(output);

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

      // Try to record failure metrics if we have account info
      try {
        const account = await getAccountById(input.accountId);
        if (account) {
          const syncDuration = Date.now() - (syncStartTime || Date.now());
          recordSyncMetrics({
            accountId: account.id,
            provider: account.provider,
            syncType: 'delta',
            messagesAdded: 0,
            messagesDeleted: 0,
            labelsChanged: 0,
            durationMs: syncDuration,
            success: false,
            errorMessage,
            syncedAt: new Date().toISOString(),
          });
        }
      } catch (metricsError) {
        console.error('Failed to record failure metrics:', metricsError);
      }

      // Return error response
      const output = {
        success: false,
        accountId: input.accountId,
        email: 'unknown',
        provider: EmailProvider.GMAIL,
        syncType: 'initial' as const,
        messagesAdded: 0,
        messagesDeleted: 0,
        labelsChanged: 0,
        newHistoryId: '',
        syncedAt: new Date().toISOString(),
        message: `Sync failed: ${errorMessage}`,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(MailSyncOutputSchema.parse(output), null, 2),
          },
        ],
      };
    }
  },
};

export type MailSyncInput = z.infer<typeof MailSyncInputSchema>;
export type MailSyncOutput = z.infer<typeof MailSyncOutputSchema>;
