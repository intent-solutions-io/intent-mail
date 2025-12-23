/**
 * Mail Get Thread Tool
 *
 * Retrieve all emails in a thread with full content.
 */

import { z } from 'zod';
import { EmailFlag } from '../../types/email.js';
import { getEmailsByThreadId } from '../../storage/services/email-storage.js';

/**
 * Input schema for mail_get_thread
 */
const MailGetThreadInputSchema = z.object({
  threadId: z.string().describe('Thread ID to retrieve'),
});

/**
 * Output schema for mail_get_thread
 */
const MailGetThreadOutputSchema = z.object({
  threadId: z.string(),
  emails: z.array(
    z.object({
      id: z.number().int().positive(),
      accountId: z.number().int().positive(),
      providerMessageId: z.string(),
      threadId: z.string().optional(),

      // Core fields
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
      cc: z
        .array(
          z.object({
            address: z.string(),
            name: z.string().optional(),
          })
        )
        .optional(),
      bcc: z
        .array(
          z.object({
            address: z.string(),
            name: z.string().optional(),
          })
        )
        .optional(),
      subject: z.string(),
      bodyText: z.string().optional(),
      bodyHtml: z.string().optional(),
      snippet: z.string().optional(),

      // Metadata
      date: z.string(),
      receivedAt: z.string().optional(),

      // Flags and labels
      flags: z.array(z.nativeEnum(EmailFlag)),
      labels: z.array(z.string()),

      // Threading
      inReplyTo: z.string().optional(),
      references: z.string().optional(),

      // Sync metadata
      sizeBytes: z.number().int().nonnegative().optional(),
      hasAttachments: z.boolean(),

      // Timestamps
      createdAt: z.string(),
      updatedAt: z.string(),
    })
  ),
  messageCount: z.number().int().nonnegative(),
});

/**
 * Mail get thread tool definition and handler
 */
export const mailGetThreadTool = {
  definition: {
    name: 'mail_get_thread',
    description:
      'Retrieve all emails in a thread with full content (body text/HTML, headers, etc.). Returns messages in chronological order.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        threadId: {
          type: 'string',
          description: 'Thread ID to retrieve',
        },
      },
      required: ['threadId'],
    },
  },

  handler: async (args: unknown) => {
    // Validate input
    const input = MailGetThreadInputSchema.parse(args);

    // Get emails in thread
    const emails = await getEmailsByThreadId(input.threadId);

    if (emails.length === 0) {
      throw new Error(`No emails found for thread ID: ${input.threadId}`);
    }

    // Build output
    const output = {
      threadId: input.threadId,
      emails: emails.map((email) => ({
        id: email.id,
        accountId: email.accountId,
        providerMessageId: email.providerMessageId,
        threadId: email.threadId,

        // Core fields
        from: email.from,
        to: email.to,
        cc: email.cc,
        bcc: email.bcc,
        subject: email.subject,
        bodyText: email.bodyText,
        bodyHtml: email.bodyHtml,
        snippet: email.snippet,

        // Metadata
        date: email.date,
        receivedAt: email.receivedAt,

        // Flags and labels
        flags: email.flags,
        labels: email.labels,

        // Threading
        inReplyTo: email.inReplyTo,
        references: email.references,

        // Sync metadata
        sizeBytes: email.sizeBytes,
        hasAttachments: email.hasAttachments,

        // Timestamps
        createdAt: email.createdAt,
        updatedAt: email.updatedAt,
      })),
      messageCount: emails.length,
    };

    // Validate output
    const validated = MailGetThreadOutputSchema.parse(output);

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

export type MailGetThreadInput = z.infer<typeof MailGetThreadInputSchema>;
export type MailGetThreadOutput = z.infer<typeof MailGetThreadOutputSchema>;
