/**
 * Mail Auth Complete Tool
 *
 * Complete Gmail OAuth 2.0 flow with manual authorization code entry.
 */

import { z } from 'zod';
import {
  createGmailOAuth,
  getGmailOAuthConfigFromEnv,
} from '../../connectors/gmail/oauth.js';
import { createGmailClient } from '../../connectors/gmail/client.js';
import { createAccount } from '../../storage/services/account-storage.js';
import { EmailProvider } from '../../types/account.js';

/**
 * Input schema for mail_auth_complete
 */
const MailAuthCompleteInputSchema = z.object({
  code: z.string().describe('Authorization code from OAuth callback'),
  codeVerifier: z.string().describe('PKCE code verifier from mail_auth_start'),
  provider: z
    .nativeEnum(EmailProvider)
    .default(EmailProvider.GMAIL)
    .describe('Email provider (currently only Gmail supported)'),
  displayName: z.string().optional().describe('Display name for the account'),
});

/**
 * Output schema for mail_auth_complete
 */
const MailAuthCompleteOutputSchema = z.object({
  success: z.boolean(),
  accountId: z.number().int().positive().optional(),
  email: z.string().optional(),
  provider: z.nativeEnum(EmailProvider),
  message: z.string(),
});

/**
 * Mail auth complete tool definition and handler
 */
export const mailAuthCompleteTool = {
  definition: {
    name: 'mail_auth_complete',
    description:
      'Complete Gmail OAuth 2.0 authorization with manual code entry. Use after mail_auth_start in manual mode.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        code: {
          type: 'string',
          description: 'Authorization code from OAuth callback URL',
        },
        codeVerifier: {
          type: 'string',
          description: 'PKCE code verifier from mail_auth_start response',
        },
        provider: {
          type: 'string',
          enum: Object.values(EmailProvider),
          description: 'Email provider (currently only Gmail supported)',
          default: 'gmail',
        },
        displayName: {
          type: 'string',
          description: 'Display name for the account',
        },
      },
      required: ['code', 'codeVerifier'],
    },
  },

  handler: async (args: unknown) => {
    // Validate input
    const input = MailAuthCompleteInputSchema.parse(args);

    // Currently only Gmail is supported
    if (input.provider !== EmailProvider.GMAIL) {
      throw new Error('Only Gmail provider is currently supported');
    }

    try {
      // Get OAuth config from environment
      const config = getGmailOAuthConfigFromEnv();

      // Create OAuth client
      const oauth = createGmailOAuth(config);

      console.error('Exchanging authorization code for tokens...');

      // Exchange code for tokens
      const tokens = await oauth.getTokensFromCode(input.code, input.codeVerifier);

      console.error('Tokens received, fetching user profile...');

      // Create OAuth client with tokens to get user info
      oauth.setCredentials(tokens);
      const client = createGmailClient(oauth);
      const profile = await client.getUserProfile();

      console.error('Creating account in database...');

      // Create account in database
      const account = await createAccount({
        provider: input.provider,
        email: profile.emailAddress,
        displayName: input.displayName,
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
        },
      });

      console.error(`Account created successfully: ${account.email}`);

      const output = {
        success: true,
        accountId: account.id,
        email: account.email,
        provider: account.provider,
        message: `Successfully authorized ${account.email}. Account ID: ${account.id}`,
      };

      // Validate output
      const validated = MailAuthCompleteOutputSchema.parse(output);

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

      const output = {
        success: false,
        provider: input.provider,
        message: `Authorization failed: ${errorMessage}`,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(MailAuthCompleteOutputSchema.parse(output), null, 2),
          },
        ],
      };
    }
  },
};

export type MailAuthCompleteInput = z.infer<typeof MailAuthCompleteInputSchema>;
export type MailAuthCompleteOutput = z.infer<typeof MailAuthCompleteOutputSchema>;
