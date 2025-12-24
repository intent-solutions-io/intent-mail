/**
 * Mail List Labels Tool
 *
 * List all available labels for an account.
 */

import { z } from 'zod';
import { getDatabase } from '../../storage/database.js';

/**
 * Input schema for mail_list_labels
 */
const MailListLabelsInputSchema = z.object({
  accountId: z.number().int().positive().optional().describe('Filter by specific account ID'),
});

/**
 * Output schema for mail_list_labels
 */
const MailListLabelsOutputSchema = z.object({
  labels: z.array(
    z.object({
      label: z.string(),
      count: z.number().int().nonnegative(),
      accountId: z.number().int().positive().optional(),
    })
  ),
  totalLabels: z.number().int().nonnegative(),
});

/**
 * Mail list labels tool definition and handler
 */
export const mailListLabelsTool = {
  definition: {
    name: 'mail_list_labels',
    description:
      'List all available labels/folders across accounts with message counts. Useful for discovering what labels exist before applying them.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        accountId: {
          type: 'number',
          description: 'Filter by specific account ID (optional)',
        },
      },
    },
  },

  handler: async (args: unknown) => {
    // Validate input
    const input = MailListLabelsInputSchema.parse(args);

    const db = getDatabase();

    // Query to get all unique labels with counts
    const query = input.accountId
      ? `
        SELECT
          json_each.value as label,
          COUNT(*) as count,
          account_id as accountId
        FROM emails, json_each(emails.labels)
        WHERE account_id = ?
        GROUP BY json_each.value, account_id
        ORDER BY count DESC, json_each.value ASC
      `
      : `
        SELECT
          json_each.value as label,
          COUNT(*) as count,
          account_id as accountId
        FROM emails, json_each(emails.labels)
        GROUP BY json_each.value, account_id
        ORDER BY count DESC, json_each.value ASC
      `;

    const stmt = db.prepare(query);
    const rows = input.accountId
      ? (stmt.all(input.accountId) as Array<{
          label: string;
          count: number;
          accountId: number;
        }>)
      : (stmt.all() as Array<{ label: string; count: number; accountId: number }>);

    // Build output
    const output = {
      labels: rows.map((row) => ({
        label: row.label,
        count: row.count,
        accountId: row.accountId,
      })),
      totalLabels: rows.length,
    };

    // Validate output
    const validated = MailListLabelsOutputSchema.parse(output);

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

export type MailListLabelsInput = z.infer<typeof MailListLabelsInputSchema>;
export type MailListLabelsOutput = z.infer<typeof MailListLabelsOutputSchema>;
