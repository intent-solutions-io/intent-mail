/**
 * IMAP Authentication
 *
 * Credential validation and storage for IMAP/SMTP connections.
 */

import { ImapConnection } from './connection.js';
import { SmtpConnection } from './smtp.js';
import { getProviderConfig, detectProvider } from './providers.js';
import { CredentialValidationResult, ImapCredentials, ImapProviderConfig } from './types.js';

/**
 * Validate IMAP credentials by attempting connection
 */
export async function validateImapCredentials(
  email: string,
  password: string,
  host?: string,
  port?: number
): Promise<CredentialValidationResult> {
  const result: CredentialValidationResult = {
    valid: false,
    imapConnected: false,
    smtpConnected: false,
  };

  // Get provider config or use custom settings
  let providerConfig: ImapProviderConfig | null = null;

  if (host && port) {
    // Custom settings provided
    providerConfig = {
      name: 'Custom',
      imapHost: host,
      imapPort: port,
      imapSecure: port === 993,
      smtpHost: host.replace('imap.', 'smtp.'),
      smtpPort: 587,
      smtpSecure: false,
      requiresAppPassword: false,
      supportsIdle: true,
    };
  } else {
    // Detect from email
    providerConfig = getProviderConfig(email);
    if (!providerConfig) {
      return {
        ...result,
        error: `Unable to detect email provider for ${email}. Please provide IMAP host and port manually.`,
        errorCode: 'PROVIDER_NOT_DETECTED',
      };
    }
  }

  // Test IMAP connection
  const imapConnection = new ImapConnection({
    host: providerConfig.imapHost,
    port: providerConfig.imapPort,
    secure: providerConfig.imapSecure,
    auth: { user: email, pass: password },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
  });

  try {
    await imapConnection.connect();
    result.imapConnected = true;
    await imapConnection.disconnect();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...result,
      error: message,
      errorCode: 'IMAP_CONNECTION_FAILED',
    };
  }

  // Test SMTP connection
  try {
    const smtpConnection = new SmtpConnection({
      host: providerConfig.smtpHost,
      port: providerConfig.smtpPort,
      secure: providerConfig.smtpSecure,
      auth: { user: email, pass: password },
    });

    await smtpConnection.connect();
    result.smtpConnected = true;
    await smtpConnection.disconnect();
  } catch (error) {
    // SMTP failure is not critical for read-only use
    console.error('[IMAP Auth] SMTP validation failed (continuing):', error);
  }

  result.valid = result.imapConnected;

  return result;
}

/**
 * Build IMAP credentials object for storage
 */
export function buildImapCredentials(
  email: string,
  password: string,
  host?: string,
  port?: number,
  smtpHost?: string,
  smtpPort?: number
): ImapCredentials {
  const providerConfig = getProviderConfig(email);
  const detectedProvider = detectProvider(email);

  return {
    email,
    password,
    provider: detectedProvider || 'custom',
    imapHost: host || providerConfig?.imapHost || '',
    imapPort: port || providerConfig?.imapPort || 993,
    smtpHost: smtpHost || providerConfig?.smtpHost || '',
    smtpPort: smtpPort || providerConfig?.smtpPort || 587,
  };
}

/**
 * Mask password for display/logging
 */
export function maskPassword(password: string): string {
  if (password.length <= 4) {
    return '****';
  }
  return password.slice(0, 2) + '****' + password.slice(-2);
}

/**
 * Get provider info from email or provider name
 */
export function getProviderInfo(emailOrProvider: string): {
  provider: string;
  config: ImapProviderConfig | null;
  requiresAppPassword: boolean;
  instructions?: string;
} {
  const config = getProviderConfig(emailOrProvider);
  const provider = detectProvider(emailOrProvider) || emailOrProvider;

  const appPasswordInstructions: Record<string, string> = {
    gmail: 'Create an app password at https://myaccount.google.com/apppasswords',
    outlook: 'Use your regular password or create an app password in security settings',
    yahoo: 'Create an app password at https://login.yahoo.com/account/security',
    icloud: 'Create an app-specific password at https://appleid.apple.com/account/manage',
  };

  return {
    provider,
    config,
    requiresAppPassword: config?.requiresAppPassword || false,
    instructions: appPasswordInstructions[provider],
  };
}
