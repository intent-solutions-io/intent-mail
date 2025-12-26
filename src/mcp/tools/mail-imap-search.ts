/**
 * Mail IMAP Search Tool
 *
 * Search emails directly on IMAP server without requiring full sync.
 * Only works with IMAP-authenticated accounts (app passwords).
 */

import { z } from 'zod';
import { AuthType } from '../../types/account.js';
import { getAccountById, getImapPassword } from '../../storage/services/account-storage.js';
import { ImapConnection, createImapSearch } from '../../connectors/imap/index.js';

/**
 * Input schema for mail_imap_search
 */
const MailImapSearchInputSchema = z.object({
  accountId: z.number().int().positive().describe('Account ID to search'),
  folder: z.string().optional().describe('Folder to search (default: INBOX)'),
  query: z.string().optional().describe('Text to search in subject/body'),
  from: z.string().optional().describe('Filter by sender email address'),
  to: z.string().optional().describe('Filter by recipient email address'),
  subject: z.string().optional().describe('Filter by subject'),
  since: z.string().optional().describe('Messages since date (ISO 8601)'),
  before: z.string().optional().describe('Messages before date (ISO 8601)'),
  seen: z.boolean().optional().describe('Filter by read status (true=read, false=unread)'),
  flagged: z.boolean().optional().describe('Filter by flagged/starred status'),
  limit: z.number().int().positive().max(100).default(50).describe('Max results to return'),
});

/**
 * Output schema for mail_imap_search
 */
const MailImapSearchOutputSchema = z.object({
  success: z.boolean(),
  accountId: z.number().int().positive(),
  email: z.string(),
  folder: z.string(),
  results: z.array(z.object({
    uid: z.number().int().positive(),
    messageId: z.string(),
    from: z.object({
      address: z.string(),
      name: z.string().optional(),
    }),
    to: z.array(z.object({
      address: z.string(),
      name: z.string().optional(),
    })),
    subject: z.string(),
    date: z.string(),
    snippet: z.string(),
    flags: z.array(z.string()),
    hasAttachments: z.boolean(),
    size: z.number().int().nonnegative(),
  })),
  total: z.number().int().nonnegative(),
  message: z.string(),
});

/**
 * Mail IMAP search tool definition and handler
 */
export const mailImapSearchTool = {
  definition: {
    name: 'mail_imap_search',
    description:
      'Search emails directly on IMAP server without full sync. Only works with IMAP-authenticated accounts (using app passwords). Useful for quick searches in large mailboxes.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        accountId: {
          type: 'number',
          description: 'Account ID to search',
        },
        folder: {
          type: 'string',
          description: 'Folder to search (default: INBOX)',
        },
        query: {
          type: 'string',
          description: 'Text to search in subject/body',
        },
        from: {
          type: 'string',
          description: 'Filter by sender email address',
        },
        to: {
          type: 'string',
          description: 'Filter by recipient email address',
        },
        subject: {
          type: 'string',
          description: 'Filter by subject',
        },
        since: {
          type: 'string',
          description: 'Messages since date (ISO 8601)',
        },
        before: {
          type: 'string',
          description: 'Messages before date (ISO 8601)',
        },
        seen: {
          type: 'boolean',
          description: 'Filter by read status (true=read, false=unread)',
        },
        flagged: {
          type: 'boolean',
          description: 'Filter by flagged/starred status',
        },
        limit: {
          type: 'number',
          description: 'Max results to return (default: 50, max: 100)',
          default: 50,
        },
      },
      required: ['accountId'],
    },
  },

  handler: async (args: unknown) => {
    const input = MailImapSearchInputSchema.parse(args);

    try {
      const account = await getAccountById(input.accountId, true);

      if (!account) {
        throw new Error(`Account with ID ${input.accountId} not found`);
      }

      if (!account.isActive) {
        throw new Error(`Account ${account.email} is inactive`);
      }

      if (account.authType !== AuthType.IMAP) {
        throw new Error(
          `mail_imap_search only works with IMAP accounts. Account ${account.email} uses ${account.authType} authentication. Use mail_search for local database search.`
        );
      }

      const password = getImapPassword(account.id);
      if (!password) {
        throw new Error(`Account ${account.email} has no stored password.`);
      }

      if (!account.imapCredentials) {
        throw new Error(`Account ${account.email} has no IMAP credentials.`);
      }

      console.error(`[IMAP Search] Connecting to ${account.imapCredentials.imapHost}...`);

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

        const search = createImapSearch(imapConnection);
        const folder = input.folder || 'INBOX';

        const searchResults = await search.search({
          folder,
          query: input.query,
          from: input.from,
          to: input.to,
          subject: input.subject,
          since: input.since ? new Date(input.since) : undefined,
          before: input.before ? new Date(input.before) : undefined,
          seen: input.seen,
          flagged: input.flagged,
          limit: input.limit,
        });

        const output = {
          success: true,
          accountId: account.id,
          email: account.email,
          folder,
          results: searchResults.map((r) => ({
            uid: r.uid,
            messageId: r.messageId,
            from: r.from,
            to: r.to,
            subject: r.subject,
            date: r.date.toISOString(),
            snippet: r.snippet,
            flags: r.flags,
            hasAttachments: r.hasAttachments,
            size: r.size,
          })),
          total: searchResults.length,
          message: `Found ${searchResults.length} matching emails in ${folder}`,
        };

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(MailImapSearchOutputSchema.parse(output), null, 2),
            },
          ],
        };
      } finally {
        await imapConnection.disconnect();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      const output = {
        success: false,
        accountId: input.accountId,
        email: 'unknown',
        folder: input.folder || 'INBOX',
        results: [],
        total: 0,
        message: `IMAP search failed: ${errorMessage}`,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(MailImapSearchOutputSchema.parse(output), null, 2),
          },
        ],
      };
    }
  },
};

export type MailImapSearchInput = z.infer<typeof MailImapSearchInputSchema>;
export type MailImapSearchOutput = z.infer<typeof MailImapSearchOutputSchema>;
