/**
 * Mail IMAP Auth Tool
 *
 * Authenticate with email using app password (IMAP/SMTP).
 * This is simpler than OAuth - just email + app password.
 */

import { z } from 'zod';
import {
  validateImapCredentials,
  getProviderInfo,
  getProviderConfig,
  detectProvider,
} from '../../connectors/imap/index.js';
import { createImapAccount } from '../../storage/services/account-storage.js';
import { EmailProvider } from '../../types/account.js';

/**
 * Input schema for mail_imap_auth
 */
const MailImapAuthInputSchema = z.object({
  email: z.string().email().describe('Your email address (e.g., user@gmail.com)'),
  password: z.string().min(1).describe('App password (NOT your regular password)'),
  imapHost: z.string().optional().describe('IMAP server (auto-detected for Gmail, Outlook, Yahoo, etc.)'),
  imapPort: z.number().int().positive().optional().describe('IMAP port (default: 993)'),
  smtpHost: z.string().optional().describe('SMTP server (auto-detected for major providers)'),
  smtpPort: z.number().int().positive().optional().describe('SMTP port (default: 587)'),
  displayName: z.string().optional().describe('Display name for the account'),
});

/**
 * Output schema for mail_imap_auth
 */
const MailImapAuthOutputSchema = z.object({
  success: z.boolean(),
  accountId: z.number().int().positive().optional(),
  email: z.string().optional(),
  provider: z.string().optional(),
  message: z.string(),
  imapConnected: z.boolean().optional(),
  smtpConnected: z.boolean().optional(),
  requiresAppPassword: z.boolean().optional(),
  appPasswordInstructions: z.string().optional(),
});

/**
 * Mail IMAP auth tool definition and handler
 */
export const mailImapAuthTool = {
  definition: {
    name: 'mail_imap_auth',
    description:
      'Connect email using app password (IMAP/SMTP). Simpler than OAuth - works with Gmail, Outlook, Yahoo, iCloud. ' +
      'Auto-detects server settings for major providers. Requires app password, NOT your regular password.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        email: {
          type: 'string',
          description: 'Your email address (e.g., user@gmail.com)',
        },
        password: {
          type: 'string',
          description: 'App password (NOT your regular password). For Gmail: https://myaccount.google.com/apppasswords',
        },
        imapHost: {
          type: 'string',
          description: 'IMAP server (optional, auto-detected for major providers)',
        },
        imapPort: {
          type: 'number',
          description: 'IMAP port (default: 993)',
        },
        smtpHost: {
          type: 'string',
          description: 'SMTP server (optional, auto-detected for major providers)',
        },
        smtpPort: {
          type: 'number',
          description: 'SMTP port (default: 587)',
        },
        displayName: {
          type: 'string',
          description: 'Display name for the account',
        },
      },
      required: ['email', 'password'],
    },
  },

  handler: async (args: unknown) => {
    // Validate input
    const input = MailImapAuthInputSchema.parse(args);

    try {
      // Get provider info
      const providerInfo = getProviderInfo(input.email);
      const providerConfig = getProviderConfig(input.email);
      const detectedProvider = detectProvider(input.email) || 'custom';

      console.error(`\n=== IMAP Authentication ===`);
      console.error(`Email: ${input.email}`);
      console.error(`Detected Provider: ${providerInfo.provider || 'Unknown'}`);

      // Determine server settings
      const imapHost = input.imapHost || providerConfig?.imapHost;
      const imapPort = input.imapPort || providerConfig?.imapPort || 993;
      const smtpHost = input.smtpHost || providerConfig?.smtpHost;
      const smtpPort = input.smtpPort || providerConfig?.smtpPort || 587;

      if (!imapHost || !smtpHost) {
        // Cannot auto-detect, need manual settings
        const output = {
          success: false,
          message: `Cannot auto-detect server settings for ${input.email}. Please provide imapHost and smtpHost manually.`,
          requiresAppPassword: providerInfo.requiresAppPassword,
          appPasswordInstructions: providerInfo.instructions,
        };

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(MailImapAuthOutputSchema.parse(output), null, 2),
            },
          ],
        };
      }

      console.error(`IMAP: ${imapHost}:${imapPort}`);
      console.error(`SMTP: ${smtpHost}:${smtpPort}`);
      console.error('Validating credentials...');

      // Validate credentials by connecting
      const validation = await validateImapCredentials(
        input.email,
        input.password,
        imapHost,
        imapPort
      );

      if (!validation.valid) {
        const output = {
          success: false,
          message: validation.error || 'Connection failed',
          imapConnected: validation.imapConnected,
          smtpConnected: validation.smtpConnected,
          requiresAppPassword: providerInfo.requiresAppPassword,
          appPasswordInstructions: providerInfo.instructions,
        };

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(MailImapAuthOutputSchema.parse(output), null, 2),
            },
          ],
        };
      }

      console.error('Credentials validated! Creating account...');

      // Map detected provider to EmailProvider enum
      let emailProvider: EmailProvider;
      switch (detectedProvider) {
        case 'gmail':
          emailProvider = EmailProvider.GMAIL;
          break;
        case 'outlook':
          emailProvider = EmailProvider.OUTLOOK;
          break;
        case 'yahoo':
          emailProvider = EmailProvider.YAHOO;
          break;
        case 'icloud':
          emailProvider = EmailProvider.ICLOUD;
          break;
        case 'fastmail':
          emailProvider = EmailProvider.FASTMAIL;
          break;
        case 'protonmail':
          emailProvider = EmailProvider.PROTONMAIL;
          break;
        default:
          emailProvider = EmailProvider.CUSTOM;
      }

      // Create account in database
      const account = createImapAccount({
        provider: emailProvider,
        email: input.email,
        displayName: input.displayName,
        password: input.password,
        imapHost,
        imapPort,
        smtpHost,
        smtpPort,
      });

      console.error(`Account created successfully: ${account.email} (ID: ${account.id})`);

      const output = {
        success: true,
        accountId: account.id,
        email: account.email,
        provider: account.provider,
        message: `Successfully connected ${account.email}. Account ID: ${account.id}`,
        imapConnected: validation.imapConnected,
        smtpConnected: validation.smtpConnected,
      };

      // Validate output
      const validated = MailImapAuthOutputSchema.parse(output);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(validated, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check for common errors and provide helpful messages
      let helpfulMessage = errorMessage;
      if (errorMessage.includes('UNIQUE constraint')) {
        helpfulMessage = `Account ${input.email} already exists. Use mail_list_accounts to see existing accounts.`;
      }

      const output = {
        success: false,
        message: `Authentication failed: ${helpfulMessage}`,
        requiresAppPassword: true,
        appPasswordInstructions: getProviderInfo(input.email).instructions,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(MailImapAuthOutputSchema.parse(output), null, 2),
          },
        ],
      };
    }
  },
};

export type MailImapAuthInput = z.infer<typeof MailImapAuthInputSchema>;
export type MailImapAuthOutput = z.infer<typeof MailImapAuthOutputSchema>;
