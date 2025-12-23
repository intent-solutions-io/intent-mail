/**
 * Mail Sync Tool
 *
 * Trigger email sync for a Gmail account (initial or delta).
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
import { createGmailClient } from '../../connectors/gmail/client.js';
import { createGmailSync } from '../../connectors/gmail/sync.js';

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
      'Sync emails for a Gmail account. Performs initial sync (up to maxMessages) if no history, or delta sync (only changes) if history exists.',
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

      if (account.provider !== EmailProvider.GMAIL) {
        throw new Error('Only Gmail accounts are currently supported for sync');
      }

      if (!account.tokens) {
        throw new Error(
          `Account ${account.email} has no OAuth tokens. Run mail_auth_start first.`
        );
      }

      console.error(`Account: ${account.email} (${account.provider})`);

      // Get OAuth config
      const config = getGmailOAuthConfigFromEnv();
      const oauth = createGmailOAuth(config);

      // Set credentials
      oauth.setCredentials(account.tokens);

      // Check if tokens are expired and refresh if needed
      if (oauth.isTokenExpired(account.tokens)) {
        console.error('Tokens expired, refreshing...');
        const newTokens = await oauth.refreshAccessToken(account.tokens.refreshToken);

        // Update tokens in database
        await updateTokens({
          accountId: account.id,
          tokens: newTokens,
        });

        // Update local reference
        oauth.setCredentials(newTokens);
        console.error('Tokens refreshed successfully');
      }

      // Create Gmail client
      const client = createGmailClient(oauth);

      // Create sync service
      const sync = createGmailSync(client, account.id);

      // Determine sync type
      const hasHistory = account.syncState?.lastHistoryId && !input.forceInitial;
      const syncType = hasHistory ? 'delta' : 'initial';

      console.error(
        `Starting ${syncType} sync for ${account.email}...`
      );

      // Perform sync
      const result = hasHistory
        ? await sync.deltaSync(account.syncState!.lastHistoryId!)
        : await sync.initialSync(input.maxMessages);

      console.error(
        `Sync complete: +${result.messagesAdded} -${result.messagesDeleted} ~${result.labelsChanged} messages`
      );

      // Update sync state in database
      await updateSyncState({
        accountId: account.id,
        syncState: {
          lastHistoryId: result.newHistoryId,
          lastSyncAt: result.syncedAt,
        },
      });

      console.error('Sync state updated in database');

      const output = {
        success: true,
        accountId: account.id,
        email: account.email,
        provider: account.provider,
        syncType,
        messagesAdded: result.messagesAdded,
        messagesDeleted: result.messagesDeleted,
        labelsChanged: result.labelsChanged,
        newHistoryId: result.newHistoryId,
        syncedAt: result.syncedAt,
        message: `Successfully synced ${account.email}. ${syncType === 'initial' ? 'Initial' : 'Delta'} sync: +${result.messagesAdded} -${result.messagesDeleted} ~${result.labelsChanged} messages`,
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
