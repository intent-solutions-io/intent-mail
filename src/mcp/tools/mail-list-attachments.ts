/**
 * Mail List Attachments Tool
 *
 * List attachments for an email from Gmail or Outlook.
 */

import { z } from 'zod';
import { EmailProvider } from '../../types/account.js';
import { getAccountById, updateTokens } from '../../storage/services/account-storage.js';
import { getEmailById } from '../../storage/services/email-storage.js';
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

/**
 * Input schema for mail_list_attachments
 */
const MailListAttachmentsInputSchema = z.object({
  emailId: z.number().int().positive().describe('Email ID to list attachments for'),
});

/**
 * Attachment info schema
 */
const AttachmentInfoSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  isInline: z.boolean().optional(),
  contentId: z.string().optional(),
});

/**
 * Output schema for mail_list_attachments
 */
const MailListAttachmentsOutputSchema = z.object({
  success: z.boolean(),
  emailId: z.number().int().positive(),
  accountId: z.number().int().positive(),
  email: z.string(),
  provider: z.nativeEnum(EmailProvider),
  attachments: z.array(AttachmentInfoSchema),
  totalAttachments: z.number().int().nonnegative(),
  totalSizeBytes: z.number().int().nonnegative(),
  message: z.string(),
});

/**
 * Mail list attachments tool definition and handler
 */
export const mailListAttachmentsTool = {
  definition: {
    name: 'mail_list_attachments',
    description:
      'List all attachments for an email. Returns attachment metadata including filename, MIME type, size, and attachment IDs for downloading.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        emailId: {
          type: 'number',
          description: 'Email ID to list attachments for',
        },
      },
      required: ['emailId'],
    },
  },

  handler: async (args: unknown) => {
    // Validate input
    const input = MailListAttachmentsInputSchema.parse(args);

    try {
      // Get email from database
      console.error(`Fetching email ${input.emailId}...`);
      const email = await getEmailById(input.emailId);

      if (!email) {
        throw new Error(`Email with ID ${input.emailId} not found`);
      }

      // Get account with tokens
      const account = await getAccountById(email.accountId, true);

      if (!account) {
        throw new Error(`Account with ID ${email.accountId} not found`);
      }

      if (!account.isActive) {
        throw new Error(`Account ${account.email} is inactive`);
      }

      if (!account.tokens) {
        throw new Error(
          `Account ${account.email} has no OAuth tokens. Run mail_auth_start first.`
        );
      }

      console.error(`Listing attachments for email from ${account.email}...`);

      let attachments: Array<{
        id: string;
        filename: string;
        mimeType: string;
        sizeBytes: number;
        isInline?: boolean;
        contentId?: string;
      }> = [];

      if (account.provider === EmailProvider.GMAIL) {
        // Gmail flow
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

        // Get message with parts to find attachments
        const message = await client.getMessage(email.providerMessageId);

        // Extract attachments from message parts
        const extractAttachments = (parts: any[]): any[] => {
          const atts: any[] = [];
          for (const part of parts || []) {
            if (part.filename && part.body?.attachmentId) {
              atts.push({
                id: part.body.attachmentId,
                filename: part.filename,
                mimeType: part.mimeType || 'application/octet-stream',
                sizeBytes: part.body.size || 0,
                isInline: part.headers?.some((h: any) =>
                  h.name === 'Content-Disposition' && h.value.includes('inline')
                ),
                contentId: part.headers?.find((h: any) => h.name === 'Content-ID')?.value,
              });
            }
            if (part.parts) {
              atts.push(...extractAttachments(part.parts));
            }
          }
          return atts;
        };

        attachments = extractAttachments(message.payload?.parts || []);
      } else if (account.provider === EmailProvider.OUTLOOK) {
        // Outlook flow
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
        const outlookAttachments = await client.listAttachments(email.providerMessageId);

        attachments = outlookAttachments.map((att) => ({
          id: att.id,
          filename: att.name,
          mimeType: att.contentType,
          sizeBytes: att.size,
          isInline: att.isInline,
          contentId: att.contentId,
        }));
      } else {
        throw new Error(`Unsupported provider: ${account.provider}`);
      }

      const totalSizeBytes = attachments.reduce((sum, att) => sum + att.sizeBytes, 0);

      console.error(`Found ${attachments.length} attachment(s), total size: ${totalSizeBytes} bytes`);

      const output = {
        success: true,
        emailId: email.id!,
        accountId: account.id,
        email: account.email,
        provider: account.provider,
        attachments,
        totalAttachments: attachments.length,
        totalSizeBytes,
        message: `Found ${attachments.length} attachment(s) for email ${email.id}`,
      };

      // Validate output
      const validated = MailListAttachmentsOutputSchema.parse(output);

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

      console.error(`List attachments failed: ${errorMessage}`);

      // Return error response
      const output = {
        success: false,
        emailId: input.emailId,
        accountId: 0,
        email: 'unknown',
        provider: EmailProvider.GMAIL,
        attachments: [],
        totalAttachments: 0,
        totalSizeBytes: 0,
        message: `List attachments failed: ${errorMessage}`,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(MailListAttachmentsOutputSchema.parse(output), null, 2),
          },
        ],
      };
    }
  },
};

export type MailListAttachmentsInput = z.infer<typeof MailListAttachmentsInputSchema>;
export type MailListAttachmentsOutput = z.infer<typeof MailListAttachmentsOutputSchema>;
