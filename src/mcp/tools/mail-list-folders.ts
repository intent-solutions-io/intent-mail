/**
 * Mail List Folders Tool
 *
 * List all folders/mailboxes for an email account.
 * Works with both OAuth (Gmail/Outlook) and IMAP accounts.
 */

import { z } from 'zod';
import { AuthType, EmailProvider } from '../../types/account.js';
import { getAccountById, getImapPassword, updateTokens } from '../../storage/services/account-storage.js';
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
import { ImapConnection } from '../../connectors/imap/index.js';

/**
 * Input schema for mail_list_folders
 */
const MailListFoldersInputSchema = z.object({
  accountId: z.number().int().positive().describe('Account ID to list folders for'),
});

/**
 * Folder info schema
 */
const FolderInfoSchema = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(['inbox', 'sent', 'drafts', 'trash', 'junk', 'archive', 'all', 'custom']).optional(),
  messageCount: z.number().int().nonnegative().optional(),
  unreadCount: z.number().int().nonnegative().optional(),
  canSelect: z.boolean().optional(),
});

/**
 * Output schema for mail_list_folders
 */
const MailListFoldersOutputSchema = z.object({
  success: z.boolean(),
  accountId: z.number().int().positive(),
  email: z.string(),
  provider: z.string(),
  folders: z.array(FolderInfoSchema),
  message: z.string(),
});

/**
 * Mail list folders tool definition and handler
 */
export const mailListFoldersTool = {
  definition: {
    name: 'mail_list_folders',
    description:
      'List all folders/mailboxes for an email account. Returns folder names, paths, types (inbox, sent, etc.), and message counts.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        accountId: {
          type: 'number',
          description: 'Account ID to list folders for',
        },
      },
      required: ['accountId'],
    },
  },

  handler: async (args: unknown) => {
    const input = MailListFoldersInputSchema.parse(args);

    try {
      const account = await getAccountById(input.accountId, true);

      if (!account) {
        throw new Error(`Account with ID ${input.accountId} not found`);
      }

      if (!account.isActive) {
        throw new Error(`Account ${account.email} is inactive`);
      }

      console.error(`Listing folders for: ${account.email} (${account.provider}, auth: ${account.authType})`);

      let folders: z.infer<typeof FolderInfoSchema>[] = [];

      // Handle IMAP accounts
      if (account.authType === AuthType.IMAP) {
        const password = getImapPassword(account.id);
        if (!password) {
          throw new Error(`Account ${account.email} has no stored password.`);
        }

        if (!account.imapCredentials) {
          throw new Error(`Account ${account.email} has no IMAP credentials.`);
        }

        const imapConnection = new ImapConnection({
          host: account.imapCredentials.imapHost,
          port: account.imapCredentials.imapPort,
          secure: account.imapCredentials.imapPort === 993,
          auth: {
            user: account.email,
            pass: password,
          },
        });

        try {
          await imapConnection.connect();
          const imapFolders = await imapConnection.listFolders();

          folders = imapFolders.map((f) => ({
            name: f.name,
            path: f.path,
            type: f.specialUse || 'custom',
            messageCount: f.messageCount,
            unreadCount: f.unseenCount,
            canSelect: !f.flags.includes('\\Noselect'),
          }));
        } finally {
          await imapConnection.disconnect();
        }
      } else if (!account.tokens) {
        throw new Error(`Account ${account.email} has no OAuth tokens.`);
      } else if (account.provider === EmailProvider.GMAIL) {
        // Gmail - list labels
        const config = getGmailOAuthConfigFromEnv();
        const oauth = createGmailOAuth(config);
        oauth.setCredentials(account.tokens);

        if (oauth.isTokenExpired(account.tokens)) {
          const newTokens = await oauth.refreshAccessToken(account.tokens.refreshToken);
          await updateTokens({ accountId: account.id, tokens: newTokens });
          oauth.setCredentials(newTokens);
        }

        const client = createGmailClient(oauth);
        const labels = await client.listLabels();

        // Map Gmail labels to folder format
        const typeMapping: Record<string, 'inbox' | 'sent' | 'drafts' | 'trash' | 'junk' | 'all'> = {
          'INBOX': 'inbox',
          'SENT': 'sent',
          'DRAFT': 'drafts',
          'TRASH': 'trash',
          'SPAM': 'junk',
        };

        folders = labels.map((label: any) => ({
          name: label.name,
          path: label.id,
          type: typeMapping[label.id] || 'custom',
          messageCount: label.messagesTotal,
          unreadCount: label.messagesUnread,
          canSelect: true,
        }));
      } else if (account.provider === EmailProvider.OUTLOOK) {
        // Outlook - list mail folders
        const config = getOutlookOAuthConfigFromEnv();
        const oauth = createOutlookOAuth(config);
        oauth.setCredentials(account.tokens);

        if (oauth.isTokenExpired(account.tokens)) {
          const newTokens = await oauth.refreshAccessToken(account.tokens.refreshToken);
          await updateTokens({ accountId: account.id, tokens: newTokens });
          oauth.setCredentials(newTokens);
        }

        const client = createOutlookClient(oauth);
        const outlookFolders = await client.listFolders();

        // Map Outlook folders
        const typeMapping: Record<string, 'inbox' | 'sent' | 'drafts' | 'trash' | 'junk' | 'archive'> = {
          'inbox': 'inbox',
          'sentitems': 'sent',
          'drafts': 'drafts',
          'deleteditems': 'trash',
          'junkemail': 'junk',
          'archive': 'archive',
        };

        folders = outlookFolders.map((folder: any) => ({
          name: folder.displayName,
          path: folder.id,
          type: typeMapping[folder.displayName.toLowerCase().replace(/\s/g, '')] || 'custom',
          messageCount: folder.totalItemCount,
          unreadCount: folder.unreadItemCount,
          canSelect: true,
        }));
      } else {
        throw new Error(`Unsupported provider: ${account.provider}`);
      }

      // Sort folders: system folders first, then custom
      const systemOrder = ['inbox', 'sent', 'drafts', 'archive', 'trash', 'junk', 'all'];
      folders.sort((a, b) => {
        const aIndex = systemOrder.indexOf(a.type || 'custom');
        const bIndex = systemOrder.indexOf(b.type || 'custom');
        if (aIndex === -1 && bIndex === -1) return a.name.localeCompare(b.name);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });

      const output = {
        success: true,
        accountId: account.id,
        email: account.email,
        provider: account.provider,
        folders,
        message: `Found ${folders.length} folders for ${account.email}`,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(MailListFoldersOutputSchema.parse(output), null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      const output = {
        success: false,
        accountId: input.accountId,
        email: 'unknown',
        provider: 'unknown',
        folders: [],
        message: `Failed to list folders: ${errorMessage}`,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(MailListFoldersOutputSchema.parse(output), null, 2),
          },
        ],
      };
    }
  },
};

export type MailListFoldersInput = z.infer<typeof MailListFoldersInputSchema>;
export type MailListFoldersOutput = z.infer<typeof MailListFoldersOutputSchema>;
