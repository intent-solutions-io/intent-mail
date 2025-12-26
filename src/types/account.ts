/**
 * Account Type Definitions
 *
 * Zod schemas and TypeScript types for email account entities.
 */

import { z } from 'zod';

/**
 * Supported email providers
 */
export enum EmailProvider {
  GMAIL = 'gmail',
  OUTLOOK = 'outlook',
  YAHOO = 'yahoo',
  ICLOUD = 'icloud',
  FASTMAIL = 'fastmail',
  PROTONMAIL = 'protonmail',
  CUSTOM = 'custom',
}

/**
 * Authentication types
 */
export enum AuthType {
  OAUTH = 'oauth',
  IMAP = 'imap',
}

/**
 * OAuth tokens schema
 */
export const OAuthTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.string(),  // ISO 8601
});

export type OAuthTokens = z.infer<typeof OAuthTokensSchema>;

/**
 * Account sync state schema
 */
export const SyncStateSchema = z.object({
  lastHistoryId: z.string().optional(),  // Gmail History API
  deltaToken: z.string().optional(),      // Outlook Graph API
  lastSyncAt: z.string().optional(),      // ISO 8601
  // IMAP sync state
  imapUidValidity: z.number().optional(),
  imapHighestModseq: z.string().optional(),
});

export type SyncState = z.infer<typeof SyncStateSchema>;

/**
 * IMAP credentials schema (for app password auth)
 */
export const ImapCredentialsSchema = z.object({
  imapHost: z.string(),
  imapPort: z.number().int().positive(),
  smtpHost: z.string(),
  smtpPort: z.number().int().positive(),
  // Password not included in schema - handled separately for security
});

export type ImapCredentials = z.infer<typeof ImapCredentialsSchema>;

/**
 * Account schema (domain object)
 */
export const AccountSchema = z.object({
  id: z.number().int().positive(),
  provider: z.nativeEnum(EmailProvider),
  email: z.string().email(),
  displayName: z.string().optional(),

  // Auth type: oauth or imap
  authType: z.nativeEnum(AuthType).default(AuthType.OAUTH),

  // OAuth tokens (optional - may not be loaded for privacy)
  tokens: OAuthTokensSchema.optional(),

  // IMAP credentials (optional - for IMAP auth only)
  imapCredentials: ImapCredentialsSchema.optional(),

  // Sync state
  syncState: SyncStateSchema.optional(),

  // Status
  isActive: z.boolean(),

  // Timestamps
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Account = z.infer<typeof AccountSchema>;

/**
 * Account row (database representation with snake_case)
 */
export interface AccountRow {
  id: number;
  provider: string;  // 'gmail' | 'outlook' | 'yahoo' | etc.
  email: string;
  display_name: string | null;

  // Auth type
  auth_type: string;  // 'oauth' | 'imap'

  // OAuth tokens
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;

  // IMAP/SMTP credentials
  imap_host: string | null;
  imap_port: number | null;
  smtp_host: string | null;
  smtp_port: number | null;
  encrypted_password: string | null;

  // Delta sync state
  last_history_id: string | null;
  delta_token: string | null;
  last_sync_at: string | null;

  // IMAP sync state
  imap_uid_validity: number | null;
  imap_highest_modseq: string | null;

  // Status
  is_active: number;  // 0 or 1

  // Timestamps
  created_at: string;
  updated_at: string;
}

/**
 * Create OAuth account input
 */
export const CreateAccountInputSchema = z.object({
  provider: z.nativeEnum(EmailProvider),
  email: z.string().email(),
  displayName: z.string().optional(),
  tokens: OAuthTokensSchema,
});

export type CreateAccountInput = z.infer<typeof CreateAccountInputSchema>;

/**
 * Create IMAP account input (app password)
 */
export const CreateImapAccountInputSchema = z.object({
  provider: z.nativeEnum(EmailProvider),
  email: z.string().email(),
  displayName: z.string().optional(),
  password: z.string().min(1), // App password
  imapHost: z.string(),
  imapPort: z.number().int().positive().default(993),
  smtpHost: z.string(),
  smtpPort: z.number().int().positive().default(587),
});

export type CreateImapAccountInput = z.infer<typeof CreateImapAccountInputSchema>;

/**
 * Update tokens input
 */
export const UpdateTokensInputSchema = z.object({
  accountId: z.number().int().positive(),
  tokens: OAuthTokensSchema,
});

export type UpdateTokensInput = z.infer<typeof UpdateTokensInputSchema>;

/**
 * Update sync state input
 */
export const UpdateSyncStateInputSchema = z.object({
  accountId: z.number().int().positive(),
  syncState: SyncStateSchema,
});

export type UpdateSyncStateInput = z.infer<typeof UpdateSyncStateInputSchema>;

/**
 * Account with email count (for list views)
 */
export const AccountWithStatsSchema = AccountSchema.extend({
  emailCount: z.number().int().nonnegative(),
  unreadCount: z.number().int().nonnegative(),
});

export type AccountWithStats = z.infer<typeof AccountWithStatsSchema>;
