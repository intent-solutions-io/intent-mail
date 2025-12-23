/**
 * Mail List Accounts Tool
 *
 * List all configured email accounts with statistics.
 */

import { z } from 'zod';
import { EmailProvider } from '../../types/account.js';
import { listAccountsWithStats } from '../../storage/services/account-storage.js';

/**
 * Input schema for mail_list_accounts
 */
const MailListAccountsInputSchema = z.object({
  activeOnly: z.boolean().default(true).describe('Only show active accounts'),
});

/**
 * Output schema for mail_list_accounts
 */
const MailListAccountsOutputSchema = z.object({
  accounts: z.array(
    z.object({
      id: z.number().int().positive(),
      provider: z.nativeEnum(EmailProvider),
      email: z.string(),
      displayName: z.string().optional(),
      isActive: z.boolean(),
      emailCount: z.number().int().nonnegative(),
      unreadCount: z.number().int().nonnegative(),
      lastSyncAt: z.string().optional(),
      createdAt: z.string(),
    })
  ),
  totalAccounts: z.number().int().nonnegative(),
});

/**
 * Mail list accounts tool definition and handler
 */
export const mailListAccountsTool = {
  definition: {
    name: 'mail_list_accounts',
    description:
      'List all configured email accounts with statistics (total emails, unread count, last sync time). Useful for multi-account operations.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        activeOnly: {
          type: 'boolean',
          description: 'Only show active accounts (default: true)',
          default: true,
        },
      },
    },
  },

  handler: async (args: unknown) => {
    // Validate input
    const input = MailListAccountsInputSchema.parse(args);

    // Get accounts with stats
    const accounts = await listAccountsWithStats(input.activeOnly);

    // Build output
    const output = {
      accounts: accounts.map((account) => ({
        id: account.id,
        provider: account.provider,
        email: account.email,
        displayName: account.displayName,
        isActive: account.isActive,
        emailCount: account.emailCount,
        unreadCount: account.unreadCount,
        lastSyncAt: account.syncState?.lastSyncAt,
        createdAt: account.createdAt,
      })),
      totalAccounts: accounts.length,
    };

    // Validate output
    const validated = MailListAccountsOutputSchema.parse(output);

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(validated, null, 2),
        },
      ],
    };
  },
};

export type MailListAccountsInput = z.infer<typeof MailListAccountsInputSchema>;
export type MailListAccountsOutput = z.infer<typeof MailListAccountsOutputSchema>;
