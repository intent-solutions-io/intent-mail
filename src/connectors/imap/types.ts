/**
 * IMAP Connector Types
 */

/**
 * IMAP provider configuration
 */
export interface ImapProviderConfig {
  name: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  // Special handling flags
  requiresAppPassword: boolean;
  supportsIdle: boolean;
}

/**
 * IMAP connection configuration
 */
export interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  logger?: boolean;
  // Connection options
  connectionTimeout?: number;
  greetingTimeout?: number;
  socketTimeout?: number;
}

/**
 * SMTP connection configuration
 */
export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  // TLS options
  requireTLS?: boolean;
  tls?: {
    rejectUnauthorized?: boolean;
  };
}

/**
 * IMAP credentials for storage
 */
export interface ImapCredentials {
  email: string;
  password: string;
  provider: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
}

/**
 * Connection state enum
 */
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  AUTHENTICATING = 'authenticating',
  AUTHENTICATED = 'authenticated',
  ERROR = 'error',
}

/**
 * IMAP folder info
 */
export interface ImapFolder {
  name: string;
  path: string;
  delimiter: string;
  flags: string[];
  specialUse?: 'inbox' | 'sent' | 'drafts' | 'trash' | 'junk' | 'archive' | 'all';
  messageCount: number;
  unseenCount: number;
  highestModseq?: bigint;
  uidValidity?: bigint;
  uidNext?: number;
}

/**
 * IMAP message envelope (headers)
 */
export interface ImapMessageEnvelope {
  uid: number;
  messageId: string;
  from: ImapAddress;
  to: ImapAddress[];
  cc?: ImapAddress[];
  bcc?: ImapAddress[];
  subject: string;
  date: Date;
  inReplyTo?: string;
  references?: string[];
  flags: string[];
  size: number;
}

/**
 * IMAP address
 */
export interface ImapAddress {
  name?: string;
  address: string;
}

/**
 * IMAP message with body
 */
export interface ImapMessage extends ImapMessageEnvelope {
  bodyText?: string;
  bodyHtml?: string;
  hasAttachments: boolean;
  attachments?: ImapAttachment[];
}

/**
 * IMAP attachment info
 */
export interface ImapAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  contentId?: string;
  disposition: 'attachment' | 'inline';
}

/**
 * Credential validation result
 */
export interface CredentialValidationResult {
  valid: boolean;
  imapConnected: boolean;
  smtpConnected: boolean;
  error?: string;
  errorCode?: string;
}
