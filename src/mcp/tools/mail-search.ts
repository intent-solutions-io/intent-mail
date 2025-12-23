/**
 * Mail Search Tool
 *
 * Search emails across all accounts with filters and full-text search.
 */

import { z } from 'zod';
import { EmailFlag, EmailSearchFilters } from '../../types/email.js';
import { searchEmails } from '../../storage/services/email-storage.js';

/**
 * Input schema for mail_search
 */
const MailSearchInputSchema = z.object({
  // Full-text search query (FTS5)
  query: z.string().optional().describe('Full-text search query (searches subject, body, from name/address)'),

  // Filter by account
  accountId: z.number().int().positive().optional().describe('Filter by specific account ID'),

  // Field filters
  from: z.string().optional().describe('Filter by sender email address (partial match)'),
  subject: z.string().optional().describe('Filter by subject (partial match)'),
  hasAttachments: z.boolean().optional().describe('Filter by attachment presence'),

  // Flags and labels
  flags: z.array(z.nativeEnum(EmailFlag)).optional().describe('Filter by email flags (SEEN, FLAGGED, etc.)'),
  labels: z.array(z.string()).optional().describe('Filter by labels/folders'),
  threadId: z.string().optional().describe('Filter by thread ID'),

  // Date range
  dateFrom: z.string().optional().describe('Filter emails from this date (ISO 8601)'),
  dateTo: z.string().optional().describe('Filter emails up to this date (ISO 8601)'),

  // Pagination
  limit: z.number().int().positive().max(100).default(50).describe('Number of results to return (max 100)'),
  offset: z.number().int().nonnegative().default(0).describe('Number of results to skip'),
});

/**
 * Output schema for mail_search
 */
const MailSearchOutputSchema = z.object({
  emails: z.array(
    z.object({
      id: z.number().int().positive(),
      accountId: z.number().int().positive(),
      providerMessageId: z.string(),
      threadId: z.string().optional(),
      from: z.object({
        address: z.string(),
        name: z.string().optional(),
      }),
      to: z.array(
        z.object({
          address: z.string(),
          name: z.string().optional(),
        })
      ),
      subject: z.string(),
      snippet: z.string().optional(),
      date: z.string(),
      flags: z.array(z.nativeEnum(EmailFlag)),
      labels: z.array(z.string()),
      hasAttachments: z.boolean(),
    })
  ),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});

/**
 * Mail search tool definition and handler
 */
export const mailSearchTool = {
  definition: {
    name: 'mail_search',
    description: 'Search emails with filters and full-text search. Supports filtering by sender, subject, date range, labels, and more.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Full-text search query (searches subject, body, from name/address)',
        },
        accountId: {
          type: 'number',
          description: 'Filter by specific account ID',
        },
        from: {
          type: 'string',
          description: 'Filter by sender email address (partial match)',
        },
        subject: {
          type: 'string',
          description: 'Filter by subject (partial match)',
        },
        hasAttachments: {
          type: 'boolean',
          description: 'Filter by attachment presence',
        },
        flags: {
          type: 'array',
          items: {
            type: 'string',
            enum: Object.values(EmailFlag),
          },
          description: 'Filter by email flags (SEEN, FLAGGED, DRAFT, ANSWERED, DELETED)',
        },
        labels: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Filter by labels/folders',
        },
        threadId: {
          type: 'string',
          description: 'Filter by thread ID',
        },
        dateFrom: {
          type: 'string',
          description: 'Filter emails from this date (ISO 8601)',
        },
        dateTo: {
          type: 'string',
          description: 'Filter emails up to this date (ISO 8601)',
        },
        limit: {
          type: 'number',
          description: 'Number of results to return (max 100, default 50)',
          default: 50,
        },
        offset: {
          type: 'number',
          description: 'Number of results to skip (for pagination, default 0)',
          default: 0,
        },
      },
    },
  },

  handler: async (args: unknown) => {
    // Validate input
    const input = MailSearchInputSchema.parse(args);

    // Build search filters
    const filters: EmailSearchFilters = {
      query: input.query,
      accountId: input.accountId,
      from: input.from,
      subject: input.subject,
      hasAttachments: input.hasAttachments,
      flags: input.flags,
      labels: input.labels,
      threadId: input.threadId,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      limit: input.limit,
      offset: input.offset,
    };

    // Search emails
    const result = await searchEmails(filters);

    // Map to simplified output format (exclude body content for search results)
    const output = {
      emails: result.items.map((email) => ({
        id: email.id,
        accountId: email.accountId,
        providerMessageId: email.providerMessageId,
        threadId: email.threadId,
        from: email.from,
        to: email.to,
        subject: email.subject,
        snippet: email.snippet,
        date: email.date,
        flags: email.flags,
        labels: email.labels,
        hasAttachments: email.hasAttachments,
      })),
      total: result.total,
      hasMore: result.hasMore,
      limit: input.limit,
      offset: input.offset,
    };

    // Validate output
    const validated = MailSearchOutputSchema.parse(output);

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

export type MailSearchInput = z.infer<typeof MailSearchInputSchema>;
export type MailSearchOutput = z.infer<typeof MailSearchOutputSchema>;
