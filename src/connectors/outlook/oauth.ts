/**
 * Outlook OAuth 2.0 Client
 *
 * Microsoft Identity Platform OAuth with PKCE for secure token acquisition.
 */

import { randomBytes, createHash } from 'crypto';
import { OAuthTokens } from '../../types/account.js';

/**
 * Outlook OAuth configuration
 */
export interface OutlookOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tenantId: string; // 'common', 'organizations', or specific tenant ID
}

/**
 * Get Outlook OAuth config from environment variables
 */
export function getOutlookOAuthConfigFromEnv(): OutlookOAuthConfig {
  const clientId = process.env.OUTLOOK_CLIENT_ID;
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET;
  const redirectUri = process.env.OUTLOOK_REDIRECT_URI || 'http://localhost:3000/oauth/callback';
  const tenantId = process.env.OUTLOOK_TENANT_ID || 'common';

  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing Outlook OAuth credentials. Set OUTLOOK_CLIENT_ID and OUTLOOK_CLIENT_SECRET in .env'
    );
  }

  return { clientId, clientSecret, redirectUri, tenantId };
}

/**
 * Outlook OAuth client
 */
export class OutlookOAuth {
  private config: OutlookOAuthConfig;
  private credentials: OAuthTokens | null = null;

  constructor(config: OutlookOAuthConfig) {
    this.config = config;
  }

  /**
   * Generate PKCE code verifier (random string)
   */
  generateCodeVerifier(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Generate PKCE code challenge from verifier
   */
  generateCodeChallenge(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
  }

  /**
   * Get authorization URL for user consent
   */
  getAuthorizationUrl(): { url: string; codeVerifier: string } {
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      redirect_uri: this.config.redirectUri,
      scope: [
        'openid',
        'profile',
        'email',
        'offline_access',
        'Mail.ReadWrite',
        'Mail.Send',
        'User.Read',
      ].join(' '),
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      response_mode: 'query',
    });

    const authUrl = `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/authorize?${params}`;

    return { url: authUrl, codeVerifier };
  }

  /**
   * Exchange authorization code for tokens
   */
  async getTokensFromCode(code: string, codeVerifier: string): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code,
      redirect_uri: this.config.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    });

    const tokenUrl = `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`;

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Outlook OAuth token exchange failed: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    const tokens: OAuthTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    };

    return tokens;
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: [
        'openid',
        'profile',
        'email',
        'offline_access',
        'Mail.ReadWrite',
        'Mail.Send',
        'User.Read',
      ].join(' '),
    });

    const tokenUrl = `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`;

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Outlook token refresh failed: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    const tokens: OAuthTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken, // Reuse old refresh token if not provided
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    };

    return tokens;
  }

  /**
   * Set credentials for API calls
   */
  setCredentials(tokens: OAuthTokens): void {
    this.credentials = tokens;
  }

  /**
   * Get current credentials
   */
  getCredentials(): OAuthTokens | null {
    return this.credentials;
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(tokens: OAuthTokens): boolean {
    const expiresAt = new Date(tokens.expiresAt);
    const now = new Date();
    const bufferMs = 5 * 60 * 1000; // 5 minute buffer

    return expiresAt.getTime() - now.getTime() < bufferMs;
  }

  /**
   * Get access token (throws if not set)
   */
  getAccessToken(): string {
    if (!this.credentials) {
      throw new Error('OAuth credentials not set. Call setCredentials() first.');
    }
    return this.credentials.accessToken;
  }
}

/**
 * Create Outlook OAuth client
 */
export function createOutlookOAuth(config: OutlookOAuthConfig): OutlookOAuth {
  return new OutlookOAuth(config);
}
