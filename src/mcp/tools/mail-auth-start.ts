/**
 * Mail Auth Start Tool
 *
 * Initiate Gmail OAuth 2.0 flow with PKCE.
 */

import { z } from 'zod';
import {
  createGmailOAuth,
  getGmailOAuthConfigFromEnv,
} from '../../connectors/gmail/oauth.js';
import { startCallbackServer } from '../../connectors/gmail/callback-server.js';
import { createAccount } from '../../storage/services/account-storage.js';
import { EmailProvider } from '../../types/account.js';

/**
 * Input schema for mail_auth_start
 */
const MailAuthStartInputSchema = z.object({
  provider: z
    .nativeEnum(EmailProvider)
    .default(EmailProvider.GMAIL)
    .describe('Email provider (currently only Gmail supported)'),
  displayName: z.string().optional().describe('Display name for the account'),
  port: z
    .number()
    .int()
    .positive()
    .default(3000)
    .describe('Local port for OAuth callback (default: 3000)'),
  manualMode: z
    .boolean()
    .default(false)
    .describe('Manual mode: return auth URL without starting server'),
});

/**
 * Output schema for mail_auth_start
 */
const MailAuthStartOutputSchema = z.object({
  success: z.boolean(),
  authUrl: z.string().optional(),
  accountId: z.number().int().positive().optional(),
  email: z.string().optional(),
  provider: z.nativeEnum(EmailProvider),
  message: z.string(),
  manualMode: z.boolean().optional(),
  codeVerifier: z.string().optional(),
});

/**
 * Mail auth start tool definition and handler
 */
export const mailAuthStartTool = {
  definition: {
    name: 'mail_auth_start',
    description:
      'Start Gmail OAuth 2.0 authorization flow. Opens authorization URL in browser and waits for callback. Use manualMode=true to get URL without starting server.',
    inputSchema: {
      type: 'object' as const,
      properties: {
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
        port: {
          type: 'number',
          description: 'Local port for OAuth callback (default: 3000)',
          default: 3000,
        },
        manualMode: {
          type: 'boolean',
          description:
            'Manual mode: return auth URL without starting server (user must use mail_auth_complete)',
          default: false,
        },
      },
    },
  },

  handler: async (args: unknown) => {
    // Validate input
    const input = MailAuthStartInputSchema.parse(args);

    // Currently only Gmail is supported
    if (input.provider !== EmailProvider.GMAIL) {
      throw new Error('Only Gmail provider is currently supported');
    }

    try {
      // Get OAuth config from environment
      const config = getGmailOAuthConfigFromEnv();

      // Update redirect URI with specified port
      config.redirectUri = `http://localhost:${input.port}/oauth/callback`;

      // Create OAuth client
      const oauth = createGmailOAuth(config);

      // Generate authorization URL with PKCE
      const { url, codeVerifier } = oauth.getAuthorizationUrl();

      console.error('\n=== Gmail OAuth Authorization ===');
      console.error('Authorization URL:', url);
      console.error('\nPlease visit this URL in your browser to authorize IntentMail.');

      // Manual mode: just return the URL
      if (input.manualMode) {
        const output = {
          success: false,
          authUrl: url,
          provider: input.provider,
          message:
            'Authorization URL generated. Visit the URL, authorize, and use mail_auth_complete with the code.',
          manualMode: true,
          codeVerifier,
        };

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(MailAuthStartOutputSchema.parse(output), null, 2),
            },
          ],
        };
      }

      // Automatic mode: start callback server
      console.error(`\nStarting OAuth callback server on port ${input.port}...`);
      console.error('Waiting for authorization...\n');

      // Start callback server and wait for response
      const callbackPromise = startCallbackServer(input.port);

      // Wait for callback
      const callbackResult = await callbackPromise;

      if (callbackResult.error) {
        throw new Error(
          `OAuth authorization failed: ${callbackResult.error}${
            callbackResult.errorDescription ? ` - ${callbackResult.errorDescription}` : ''
          }`
        );
      }

      if (!callbackResult.code) {
        throw new Error('No authorization code received');
      }

      console.error('Authorization code received, exchanging for tokens...');

      // Exchange code for tokens
      const tokens = await oauth.getTokensFromCode(callbackResult.code, codeVerifier);

      console.error('Tokens received, creating account...');

      // Create OAuth client with tokens to get user info
      oauth.setCredentials(tokens);
      const { createGmailClient } = await import('../../connectors/gmail/client.js');
      const client = createGmailClient(oauth);
      const profile = await client.getUserProfile();

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
      const validated = MailAuthStartOutputSchema.parse(output);

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
            text: JSON.stringify(MailAuthStartOutputSchema.parse(output), null, 2),
          },
        ],
      };
    }
  },
};

export type MailAuthStartInput = z.infer<typeof MailAuthStartInputSchema>;
export type MailAuthStartOutput = z.infer<typeof MailAuthStartOutputSchema>;
