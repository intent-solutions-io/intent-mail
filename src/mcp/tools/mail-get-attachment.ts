/**
 * Mail Get Attachment Tool
 *
 * Download attachment content from Gmail or Outlook.
 */

import { z } from 'zod';
import { EmailProvider } from '../../types/account.js';
import { getAccountById, updateTokens } from '../../storage/services/account-storage.js';
import { getEmailById } from '../../storage/services/email-storage.js';
import { getAttachmentsByEmailId } from '../../storage/services/attachment-storage.js';
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
import {
  isAttachmentCached,
  cacheAttachment,
  readCachedAttachment,
} from '../../storage/services/attachment-cache.js';

/**
 * Input schema for mail_get_attachment
 */
const MailGetAttachmentInputSchema = z.object({
  emailId: z.number().int().positive().describe('Email ID containing the attachment'),
  attachmentId: z.string().describe('Attachment ID from mail_list_attachments'),
  saveToFile: z
    .string()
    .optional()
    .describe('Optional file path to save attachment (absolute path)'),
});

/**
 * Output schema for mail_get_attachment
 */
const MailGetAttachmentOutputSchema = z.object({
  success: z.boolean(),
  emailId: z.number().int().positive(),
  attachmentId: z.string(),
  filename: z.string().optional(),
  mimeType: z.string().optional(),
  sizeBytes: z.number().int().nonnegative(),
  content: z.string().optional().describe('Base64-encoded attachment content'),
  savedToFile: z.string().optional(),
  message: z.string(),
});

/**
 * Mail get attachment tool definition and handler
 */
export const mailGetAttachmentTool = {
  definition: {
    name: 'mail_get_attachment',
    description:
      'Download attachment content from an email. Returns base64-encoded content that can be saved to a file. ' +
      'Use mail_list_attachments first to get attachment IDs.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        emailId: {
          type: 'number',
          description: 'Email ID containing the attachment',
        },
        attachmentId: {
          type: 'string',
          description: 'Attachment ID from mail_list_attachments',
        },
        saveToFile: {
          type: 'string',
          description: 'Optional file path to save attachment (absolute path)',
        },
      },
      required: ['emailId', 'attachmentId'],
    },
  },

  handler: async (args: unknown) => {
    // Validate input
    const input = MailGetAttachmentInputSchema.parse(args);

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

      // Get attachment record from database
      const attachments = getAttachmentsByEmailId(email.id!);
      const attachment = attachments.find(
        (att) => att.providerAttachmentId === input.attachmentId
      );

      if (!attachment) {
        throw new Error(
          `Attachment ${input.attachmentId} not found for email ${input.emailId}`
        );
      }

      let attachmentData: {
        data: string;
        size: number;
        name?: string;
        contentType?: string;
      };

      // Check if attachment is cached
      const isCached = await isAttachmentCached(attachment.id);

      if (isCached) {
        console.error(`Loading attachment ${input.attachmentId} from cache...`);
        const cachedData = await readCachedAttachment(attachment.id);

        attachmentData = {
          data: cachedData,
          size: attachment.sizeBytes,
          name: attachment.filename,
          contentType: attachment.mimeType,
        };
      } else {
        console.error(
          `Downloading attachment ${input.attachmentId} from ${account.email}...`
        );

        // Download from provider
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
          attachmentData = await client.getAttachment(
            email.providerMessageId,
            input.attachmentId
          );
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
          attachmentData = await client.getAttachment(
            email.providerMessageId,
            input.attachmentId
          );
        } else {
          throw new Error(`Unsupported provider: ${account.provider}`);
        }

        console.error(`Downloaded ${attachmentData.size} bytes`);

        // Cache the downloaded attachment
        await cacheAttachment(attachment.id, attachmentData.data);
        console.error('Attachment cached');
      }

      // Optionally save to file
      let savedToFile: string | undefined;
      if (input.saveToFile) {
        const fs = await import('fs/promises');
        const buffer = Buffer.from(attachmentData.data, 'base64');
        await fs.writeFile(input.saveToFile, buffer);
        savedToFile = input.saveToFile;
        console.error(`Saved to file: ${savedToFile}`);
      }

      const output = {
        success: true,
        emailId: email.id!,
        attachmentId: input.attachmentId,
        filename: attachmentData.name,
        mimeType: attachmentData.contentType,
        sizeBytes: attachmentData.size,
        content: savedToFile ? undefined : attachmentData.data,
        savedToFile,
        message: savedToFile
          ? `Attachment saved to ${savedToFile}`
          : `Downloaded attachment (${attachmentData.size} bytes)`,
      };

      // Validate output
      const validated = MailGetAttachmentOutputSchema.parse(output);

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

      console.error(`Get attachment failed: ${errorMessage}`);

      // Return error response
      const output = {
        success: false,
        emailId: input.emailId,
        attachmentId: input.attachmentId,
        sizeBytes: 0,
        message: `Get attachment failed: ${errorMessage}`,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(MailGetAttachmentOutputSchema.parse(output), null, 2),
          },
        ],
      };
    }
  },
};

export type MailGetAttachmentInput = z.infer<typeof MailGetAttachmentInputSchema>;
export type MailGetAttachmentOutput = z.infer<typeof MailGetAttachmentOutputSchema>;
