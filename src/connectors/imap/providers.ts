/**
 * IMAP Provider Configurations
 *
 * Pre-configured settings for popular email providers.
 */

import { ImapProviderConfig } from './types.js';

/**
 * Known IMAP providers with their server configurations
 */
export const IMAP_PROVIDERS: Record<string, ImapProviderConfig> = {
  gmail: {
    name: 'Gmail',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    smtpSecure: false, // STARTTLS
    requiresAppPassword: true,
    supportsIdle: true,
  },
  outlook: {
    name: 'Outlook/Hotmail',
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpSecure: false, // STARTTLS
    requiresAppPassword: true,
    supportsIdle: true,
  },
  yahoo: {
    name: 'Yahoo Mail',
    imapHost: 'imap.mail.yahoo.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.mail.yahoo.com',
    smtpPort: 587,
    smtpSecure: false, // STARTTLS
    requiresAppPassword: true,
    supportsIdle: true,
  },
  icloud: {
    name: 'iCloud Mail',
    imapHost: 'imap.mail.me.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.mail.me.com',
    smtpPort: 587,
    smtpSecure: false, // STARTTLS
    requiresAppPassword: true,
    supportsIdle: true,
  },
  fastmail: {
    name: 'Fastmail',
    imapHost: 'imap.fastmail.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.fastmail.com',
    smtpPort: 587,
    smtpSecure: false, // STARTTLS
    requiresAppPassword: false,
    supportsIdle: true,
  },
  protonmail: {
    name: 'ProtonMail Bridge',
    imapHost: '127.0.0.1',
    imapPort: 1143,
    imapSecure: false,
    smtpHost: '127.0.0.1',
    smtpPort: 1025,
    smtpSecure: false,
    requiresAppPassword: false, // Uses bridge
    supportsIdle: true,
  },
};

/**
 * Detect provider from email address
 */
export function detectProvider(email: string): string | null {
  const domain = email.split('@')[1]?.toLowerCase();

  if (!domain) return null;

  // Gmail
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return 'gmail';
  }

  // Outlook/Microsoft
  if (
    domain === 'outlook.com' ||
    domain === 'hotmail.com' ||
    domain === 'live.com' ||
    domain === 'msn.com' ||
    domain.endsWith('.outlook.com')
  ) {
    return 'outlook';
  }

  // Yahoo
  if (domain === 'yahoo.com' || domain.startsWith('yahoo.')) {
    return 'yahoo';
  }

  // iCloud
  if (domain === 'icloud.com' || domain === 'me.com' || domain === 'mac.com') {
    return 'icloud';
  }

  // Fastmail
  if (domain === 'fastmail.com' || domain === 'fastmail.fm') {
    return 'fastmail';
  }

  return null;
}

/**
 * Get provider config by name or email
 */
export function getProviderConfig(providerOrEmail: string): ImapProviderConfig | null {
  // Direct provider name lookup
  if (IMAP_PROVIDERS[providerOrEmail]) {
    return IMAP_PROVIDERS[providerOrEmail];
  }

  // Try to detect from email
  if (providerOrEmail.includes('@')) {
    const detected = detectProvider(providerOrEmail);
    if (detected) {
      return IMAP_PROVIDERS[detected];
    }
  }

  return null;
}

/**
 * Create custom provider config
 */
export function createCustomProvider(config: {
  imapHost: string;
  imapPort?: number;
  smtpHost: string;
  smtpPort?: number;
}): ImapProviderConfig {
  return {
    name: 'Custom',
    imapHost: config.imapHost,
    imapPort: config.imapPort || 993,
    imapSecure: true,
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort || 587,
    smtpSecure: false,
    requiresAppPassword: false,
    supportsIdle: true,
  };
}
