/**
 * Mail Send Tool
 *
 * Send emails via Gmail with threading and HTML/text support.
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
import { AttachmentInputSchema } from '../../types/email.js';
import { SmtpConnection } from '../../connectors/imap/index.js';

/**
 * Email address schema for recipients
 */
const EmailAddressInputSchema = z.object({
  address: z.string().email().describe('Email address'),
  name: z.string().optional().describe('Display name'),
});

/**
 * Input schema for mail_send
 */
const MailSendInputSchema = z.object({
  accountId: z.number().int().positive().describe('Account ID to send from'),
  to: z
    .array(EmailAddressInputSchema)
    .min(1)
    .describe('Recipient email addresses (at least one required)'),
  cc: z.array(EmailAddressInputSchema).optional().describe('CC recipients'),
  bcc: z.array(EmailAddressInputSchema).optional().describe('BCC recipients'),
  subject: z.string().min(1).describe('Email subject'),
  bodyText: z.string().optional().describe('Plain text body'),
  bodyHtml: z.string().optional().describe('HTML body'),
  inReplyTo: z.string().optional().describe('Message ID this is replying to'),
  references: z.string().optional().describe('References header for threading'),
  threadId: z.string().optional().describe('Gmail thread ID to add message to'),
  attachments: z.array(AttachmentInputSchema).optional().describe('File attachments'),
}).refine(
  (data) => data.bodyText || data.bodyHtml,
  {
    message: 'Either bodyText or bodyHtml must be provided',
  }
);

/**
 * Output schema for mail_send
 */
const MailSendOutputSchema = z.object({
  success: z.boolean(),
  accountId: z.number().int().positive(),
  email: z.string(),
  provider: z.nativeEnum(EmailProvider),
  messageId: z.string().optional(),
  threadId: z.string().optional(),
  sentAt: z.string(),
  message: z.string(),
});

/**
 * Format email address for headers
 */
function formatEmailAddress(addr: { address: string; name?: string }): string {
  if (addr.name) {
    return `${addr.name} <${addr.address}>`;
  }
  return addr.address;
}

/**
 * Compose RFC 2822 email message with optional attachments
 */
function composeMessage(
  from: string,
  input: z.infer<typeof MailSendInputSchema>
): string {
  const lines: string[] = [];
  const hasAttachments = input.attachments && input.attachments.length > 0;

  // From header
  lines.push(`From: ${from}`);

  // To header
  lines.push(`To: ${input.to.map(formatEmailAddress).join(', ')}`);

  // CC header
  if (input.cc && input.cc.length > 0) {
    lines.push(`Cc: ${input.cc.map(formatEmailAddress).join(', ')}`);
  }

  // BCC header
  if (input.bcc && input.bcc.length > 0) {
    lines.push(`Bcc: ${input.bcc.map(formatEmailAddress).join(', ')}`);
  }

  // Subject header
  lines.push(`Subject: ${input.subject}`);

  // Threading headers
  if (input.inReplyTo) {
    lines.push(`In-Reply-To: ${input.inReplyTo}`);
  }

  if (input.references) {
    lines.push(`References: ${input.references}`);
  }

  // Date header
  lines.push(`Date: ${new Date().toUTCString()}`);

  lines.push(`MIME-Version: 1.0`);

  if (hasAttachments) {
    // Multipart/mixed for attachments
    const mixedBoundary = `----=_Mixed_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    lines.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
    lines.push('');

    // Message body part
    lines.push(`--${mixedBoundary}`);

    if (input.bodyHtml && input.bodyText) {
      // Multipart/alternative for text + HTML
      const altBoundary = `----=_Alt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
      lines.push('');

      // Plain text part
      lines.push(`--${altBoundary}`);
      lines.push('Content-Type: text/plain; charset=UTF-8');
      lines.push('Content-Transfer-Encoding: quoted-printable');
      lines.push('');
      lines.push(input.bodyText);
      lines.push('');

      // HTML part
      lines.push(`--${altBoundary}`);
      lines.push('Content-Type: text/html; charset=UTF-8');
      lines.push('Content-Transfer-Encoding: quoted-printable');
      lines.push('');
      lines.push(input.bodyHtml);
      lines.push('');

      lines.push(`--${altBoundary}--`);
    } else if (input.bodyHtml) {
      // HTML only
      lines.push('Content-Type: text/html; charset=UTF-8');
      lines.push('Content-Transfer-Encoding: quoted-printable');
      lines.push('');
      lines.push(input.bodyHtml);
    } else {
      // Plain text only
      lines.push('Content-Type: text/plain; charset=UTF-8');
      lines.push('Content-Transfer-Encoding: quoted-printable');
      lines.push('');
      lines.push(input.bodyText!);
    }
    lines.push('');

    // Attachment parts
    for (const attachment of input.attachments!) {
      lines.push(`--${mixedBoundary}`);
      lines.push(`Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`);
      lines.push('Content-Transfer-Encoding: base64');
      lines.push(`Content-Disposition: attachment; filename="${attachment.filename}"`);
      if (attachment.contentId) {
        lines.push(`Content-ID: <${attachment.contentId}>`);
      }
      lines.push('');
      // Split base64 into 76-character lines (RFC 2045)
      const base64Lines = attachment.content.match(/.{1,76}/g) || [];
      lines.push(...base64Lines);
      lines.push('');
    }

    lines.push(`--${mixedBoundary}--`);
  } else {
    // No attachments - same as before
    if (input.bodyHtml && input.bodyText) {
      // Multipart: both HTML and text
      const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
      lines.push('');

      // Plain text part
      lines.push(`--${boundary}`);
      lines.push('Content-Type: text/plain; charset=UTF-8');
      lines.push('Content-Transfer-Encoding: quoted-printable');
      lines.push('');
      lines.push(input.bodyText);
      lines.push('');

      // HTML part
      lines.push(`--${boundary}`);
      lines.push('Content-Type: text/html; charset=UTF-8');
      lines.push('Content-Transfer-Encoding: quoted-printable');
      lines.push('');
      lines.push(input.bodyHtml);
      lines.push('');

      lines.push(`--${boundary}--`);
    } else if (input.bodyHtml) {
      // HTML only
      lines.push('Content-Type: text/html; charset=UTF-8');
      lines.push('Content-Transfer-Encoding: quoted-printable');
      lines.push('');
      lines.push(input.bodyHtml);
    } else {
      // Plain text only
      lines.push('Content-Type: text/plain; charset=UTF-8');
      lines.push('Content-Transfer-Encoding: quoted-printable');
      lines.push('');
      lines.push(input.bodyText!);
    }
  }

  return lines.join('\r\n');
}

/**
 * Mail send tool definition and handler
 */
export const mailSendTool = {
  definition: {
    name: 'mail_send',
    description:
      'Send an email via Gmail or Outlook. Supports HTML and plain text, threading (replies), multiple recipients (to/cc/bcc), and file attachments.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        accountId: {
          type: 'number',
          description: 'Account ID to send from',
        },
        to: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              address: { type: 'string', description: 'Email address' },
              name: { type: 'string', description: 'Display name (optional)' },
            },
            required: ['address'],
          },
          description: 'Recipient email addresses (at least one required)',
        },
        cc: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              address: { type: 'string' },
              name: { type: 'string' },
            },
            required: ['address'],
          },
          description: 'CC recipients',
        },
        bcc: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              address: { type: 'string' },
              name: { type: 'string' },
            },
            required: ['address'],
          },
          description: 'BCC recipients',
        },
        subject: {
          type: 'string',
          description: 'Email subject',
        },
        bodyText: {
          type: 'string',
          description: 'Plain text body',
        },
        bodyHtml: {
          type: 'string',
          description: 'HTML body',
        },
        inReplyTo: {
          type: 'string',
          description: 'Message ID this is replying to (for threading)',
        },
        references: {
          type: 'string',
          description: 'References header for threading',
        },
        threadId: {
          type: 'string',
          description: 'Gmail thread ID to add message to',
        },
        attachments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              filename: { type: 'string', description: 'File name with extension' },
              mimeType: { type: 'string', description: 'MIME type (e.g., application/pdf)' },
              content: { type: 'string', description: 'Base64-encoded file content' },
              contentId: { type: 'string', description: 'Content ID for inline images' },
            },
            required: ['filename', 'mimeType', 'content'],
          },
          description: 'File attachments (base64-encoded)',
        },
      },
      required: ['accountId', 'to', 'subject'],
    },
  },

  handler: async (args: unknown) => {
    // Validate input
    const input = MailSendInputSchema.parse(args);

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

      console.error(`Sending from: ${account.email} (${account.provider}, auth: ${account.authType})`);

      let messageId: string;
      let threadId: string | undefined;

      // Handle IMAP accounts (send via SMTP)
      if (account.authType === AuthType.IMAP) {
        // Get password for SMTP connection
        const password = getImapPassword(account.id);
        if (!password) {
          throw new Error(
            `Account ${account.email} has no stored password. Re-authenticate with mail_imap_auth.`
          );
        }

        if (!account.imapCredentials) {
          throw new Error(
            `Account ${account.email} has no SMTP credentials. Re-authenticate with mail_imap_auth.`
          );
        }

        console.error(`[SMTP] Connecting to ${account.imapCredentials.smtpHost}:${account.imapCredentials.smtpPort}...`);

        const smtpConnection = new SmtpConnection({
          host: account.imapCredentials.smtpHost,
          port: account.imapCredentials.smtpPort,
          secure: account.imapCredentials.smtpPort === 465,
          auth: {
            user: account.email,
            pass: password,
          },
          requireTLS: account.imapCredentials.smtpPort !== 465,
        });

        try {
          await smtpConnection.connect();

          console.error('[SMTP] Sending email...');

          // Prepare recipients
          const toAddresses = input.to.map((addr) =>
            addr.name ? `${addr.name} <${addr.address}>` : addr.address
          );
          const ccAddresses = input.cc?.map((addr) =>
            addr.name ? `${addr.name} <${addr.address}>` : addr.address
          );
          const bccAddresses = input.bcc?.map((addr) =>
            addr.name ? `${addr.name} <${addr.address}>` : addr.address
          );

          // Prepare attachments
          const attachments = input.attachments?.map((att) => ({
            filename: att.filename,
            content: Buffer.from(att.content, 'base64'),
            contentType: att.mimeType,
          }));

          // Send via SMTP
          const result = await smtpConnection.sendMail({
            from: account.email,
            to: toAddresses,
            cc: ccAddresses,
            bcc: bccAddresses,
            subject: input.subject,
            text: input.bodyText,
            html: input.bodyHtml,
            replyTo: undefined,
            inReplyTo: input.inReplyTo,
            references: input.references,
            attachments,
          });

          messageId = result.messageId;
          console.error(`[SMTP] Email sent successfully. Message ID: ${messageId}`);
        } finally {
          await smtpConnection.disconnect();
        }
      } else if (!account.tokens) {
        // OAuth accounts need tokens
        throw new Error(
          `Account ${account.email} has no OAuth tokens. Run mail_auth_start first.`
        );
      } else if (account.provider === EmailProvider.GMAIL) {
        // Gmail sending flow
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

        // Compose RFC 2822 message
        const rawMessage = composeMessage(account.email, input);

        // Encode as base64url (required by Gmail API)
        const encodedMessage = Buffer.from(rawMessage)
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');

        // Create Gmail client and send
        const client = createGmailClient(oauth);
        console.error('Sending email via Gmail...');
        const sentMessage = await client.sendMessage(encodedMessage);

        messageId = sentMessage.id!;
        threadId = sentMessage.threadId;
        console.error(`Email sent successfully. Message ID: ${messageId}`);
      } else if (account.provider === EmailProvider.OUTLOOK) {
        // Outlook sending flow
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

        // Build Graph API message
        const message: any = {
          subject: input.subject,
          body: {
            contentType: input.bodyHtml ? 'HTML' : 'Text',
            content: input.bodyHtml || input.bodyText!,
          },
          toRecipients: input.to.map((addr) => ({
            emailAddress: { address: addr.address, name: addr.name },
          })),
        };

        if (input.cc && input.cc.length > 0) {
          message.ccRecipients = input.cc.map((addr) => ({
            emailAddress: { address: addr.address, name: addr.name },
          }));
        }

        if (input.bcc && input.bcc.length > 0) {
          message.bccRecipients = input.bcc.map((addr) => ({
            emailAddress: { address: addr.address, name: addr.name },
          }));
        }

        if (input.inReplyTo) {
          message.internetMessageId = input.inReplyTo;
        }

        // Add attachments if present
        if (input.attachments && input.attachments.length > 0) {
          message.attachments = input.attachments.map((att) => ({
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: att.filename,
            contentType: att.mimeType,
            contentBytes: att.content,
            contentId: att.contentId,
          }));
        }

        // Create Outlook client and send
        const client = createOutlookClient(oauth);
        console.error('Sending email via Outlook...');
        await client.sendMessage(message);

        messageId = 'sent'; // Outlook sendMail doesn't return message ID
        console.error('Email sent successfully via Outlook');
      } else {
        throw new Error(`Unsupported provider: ${account.provider}`);
      }

      const output = {
        success: true,
        accountId: account.id,
        email: account.email,
        provider: account.provider,
        messageId,
        threadId,
        sentAt: new Date().toISOString(),
        message: `Successfully sent email from ${account.email}. Message ID: ${messageId}`,
      };

      // Validate output
      const validated = MailSendOutputSchema.parse(output);

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

      console.error(`Send failed: ${errorMessage}`);

      // Return error response
      const output = {
        success: false,
        accountId: input.accountId,
        email: 'unknown',
        provider: EmailProvider.GMAIL,
        sentAt: new Date().toISOString(),
        message: `Send failed: ${errorMessage}`,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(MailSendOutputSchema.parse(output), null, 2),
          },
        ],
      };
    }
  },
};

export type MailSendInput = z.infer<typeof MailSendInputSchema>;
export type MailSendOutput = z.infer<typeof MailSendOutputSchema>;
