/**
 * Mail Send Tool
 *
 * Send emails via Gmail with threading and HTML/text support.
 */

import { z } from 'zod';
import { EmailProvider } from '../../types/account.js';
import { getAccountById, updateTokens } from '../../storage/services/account-storage.js';
import {
  createGmailOAuth,
  getGmailOAuthConfigFromEnv,
} from '../../connectors/gmail/oauth.js';
import { createGmailClient } from '../../connectors/gmail/client.js';

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
 * Compose RFC 2822 email message
 */
function composeMessage(
  from: string,
  input: z.infer<typeof MailSendInputSchema>
): string {
  const lines: string[] = [];

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

  // MIME headers
  if (input.bodyHtml && input.bodyText) {
    // Multipart: both HTML and text
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    lines.push(`MIME-Version: 1.0`);
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
    lines.push(`MIME-Version: 1.0`);
    lines.push('Content-Type: text/html; charset=UTF-8');
    lines.push('Content-Transfer-Encoding: quoted-printable');
    lines.push('');
    lines.push(input.bodyHtml);
  } else {
    // Plain text only
    lines.push(`MIME-Version: 1.0`);
    lines.push('Content-Type: text/plain; charset=UTF-8');
    lines.push('Content-Transfer-Encoding: quoted-printable');
    lines.push('');
    lines.push(input.bodyText!);
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
      'Send an email via Gmail. Supports HTML and plain text, threading (replies), and multiple recipients (to/cc/bcc).',
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

      if (account.provider !== EmailProvider.GMAIL) {
        throw new Error('Only Gmail accounts are currently supported for sending');
      }

      if (!account.tokens) {
        throw new Error(
          `Account ${account.email} has no OAuth tokens. Run mail_auth_start first.`
        );
      }

      console.error(`Sending from: ${account.email}`);

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

      // Compose RFC 2822 message
      const rawMessage = composeMessage(account.email, input);

      // Encode as base64url (required by Gmail API)
      const encodedMessage = Buffer.from(rawMessage)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      // Create Gmail client
      const client = createGmailClient(oauth);

      console.error('Sending email...');

      // Send message
      const sentMessage = await client.sendMessage(encodedMessage);

      console.error(`Email sent successfully. Message ID: ${sentMessage.id}`);

      const output = {
        success: true,
        accountId: account.id,
        email: account.email,
        provider: account.provider,
        messageId: sentMessage.id,
        threadId: sentMessage.threadId,
        sentAt: new Date().toISOString(),
        message: `Successfully sent email from ${account.email}. Message ID: ${sentMessage.id}`,
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
