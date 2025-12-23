/**
 * Gmail OAuth 2.0 Handler
 *
 * Implements OAuth 2.0 with PKCE for Gmail authentication.
 */

import { randomBytes, createHash } from 'crypto';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { GmailOAuthConfig, GmailTokens } from './types.js';

/**
 * Required Gmail API scopes
 * https://developers.google.com/gmail/api/auth/scopes
 */
export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly', // Read emails
  'https://www.googleapis.com/auth/gmail.modify', // Modify labels
  'https://www.googleapis.com/auth/gmail.send', // Send emails
  'https://www.googleapis.com/auth/gmail.labels', // Manage labels
];

/**
 * PKCE code verifier generator
 * Generates cryptographically random string for PKCE flow
 */
function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * PKCE code challenge generator
 * SHA256 hash of code verifier, base64url encoded
 */
function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/**
 * Gmail OAuth client wrapper
 */
export class GmailOAuth {
  private oauth2Client: OAuth2Client;
  private codeVerifier?: string;

  constructor(private config: GmailOAuthConfig) {
    this.oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      config.redirectUri
    );
  }

  /**
   * Generate authorization URL with PKCE
   * User should be redirected to this URL to grant access
   */
  getAuthorizationUrl(): { url: string; codeVerifier: string } {
    // Generate PKCE parameters
    this.codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(this.codeVerifier);

    const url = this.oauth2Client.generateAuthUrl({
      access_type: 'offline', // Request refresh token
      scope: this.config.scopes,
      prompt: 'consent', // Force consent screen to get refresh token
      code_challenge: codeChallenge,
      code_challenge_method: 'S256' as any, // PKCE SHA-256 (type not properly exported by google-auth-library)
    });

    return {
      url,
      codeVerifier: this.codeVerifier,
    };
  }

  /**
   * Exchange authorization code for tokens
   * Called after user grants access and is redirected back
   */
  async getTokensFromCode(
    code: string,
    codeVerifier: string
  ): Promise<GmailTokens> {
    const { tokens } = await this.oauth2Client.getToken({
      code,
      codeVerifier,
    });

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('Failed to obtain access token or refresh token');
    }

    // Calculate expiration time
    const expiresAt = new Date(
      Date.now() + (tokens.expiry_date || 3600 * 1000)
    ).toISOString();

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<GmailTokens> {
    this.oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    const { credentials } = await this.oauth2Client.refreshAccessToken();

    if (!credentials.access_token) {
      throw new Error('Failed to refresh access token');
    }

    // Calculate expiration time
    const expiresAt = new Date(
      Date.now() + (credentials.expiry_date || 3600 * 1000)
    ).toISOString();

    return {
      accessToken: credentials.access_token,
      refreshToken: refreshToken, // Refresh token doesn't change
      expiresAt,
    };
  }

  /**
   * Set credentials on the OAuth client
   * Used before making API calls
   */
  setCredentials(tokens: GmailTokens): void {
    this.oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expiry_date: new Date(tokens.expiresAt).getTime(),
    });
  }

  /**
   * Get the OAuth2Client instance
   * Used by Gmail API client
   */
  getClient(): OAuth2Client {
    return this.oauth2Client;
  }

  /**
   * Check if tokens are expired or about to expire
   * Returns true if tokens expire within next 5 minutes
   */
  isTokenExpired(tokens: GmailTokens): boolean {
    const expiresAt = new Date(tokens.expiresAt).getTime();
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    return expiresAt - now < fiveMinutes;
  }

  /**
   * Revoke access token
   * Called when user disconnects account
   */
  async revokeToken(accessToken: string): Promise<void> {
    await this.oauth2Client.revokeToken(accessToken);
  }
}

/**
 * Create Gmail OAuth client from config
 */
export function createGmailOAuth(config: GmailOAuthConfig): GmailOAuth {
  return new GmailOAuth(config);
}

/**
 * Get OAuth config from environment variables
 */
export function getGmailOAuthConfigFromEnv(): GmailOAuthConfig {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const redirectUri = process.env.GMAIL_REDIRECT_URI || 'http://localhost:3000/oauth/callback';

  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing Gmail OAuth configuration. Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET environment variables.'
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes: GMAIL_SCOPES,
  };
}
