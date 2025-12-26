/**
 * Account Storage Service
 *
 * CRUD operations for email accounts.
 */

import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { getDatabase } from '../database.js';
import { StorageError } from '../../types/storage.js';
import {
  Account,
  AccountRow,
  AccountWithStats,
  AuthType,
  CreateAccountInput,
  CreateImapAccountInput,
  EmailProvider,
  UpdateSyncStateInput,
  UpdateTokensInput,
} from '../../types/account.js';

/**
 * Encryption key derivation (use environment variable in production)
 * For Phase 1, use a simple key. In production, integrate with OS keychain.
 */
const ENCRYPTION_KEY = process.env.INTENTMAIL_ENCRYPTION_KEY || 'intentmail-dev-key-32-chars!!';

/**
 * Encrypt password for storage
 */
function encryptPassword(password: string): string {
  const key = createHash('sha256').update(ENCRYPTION_KEY).digest();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt password from storage
 */
function decryptPassword(encrypted: string): string {
  const [ivHex, encryptedData] = encrypted.split(':');
  const key = createHash('sha256').update(ENCRYPTION_KEY).digest();
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Convert database row to domain object
 */
function rowToAccount(row: AccountRow, includeTokens = false): Account {
  const account: Account = {
    id: row.id,
    provider: row.provider as EmailProvider,
    email: row.email,
    displayName: row.display_name || undefined,
    authType: (row.auth_type as AuthType) || AuthType.OAUTH,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  // Include OAuth tokens only if requested (privacy consideration)
  if (includeTokens && row.access_token && row.refresh_token && row.token_expires_at) {
    account.tokens = {
      accessToken: row.access_token,
      refreshToken: row.refresh_token,
      expiresAt: row.token_expires_at,
    };
  }

  // Include IMAP credentials if available (for IMAP auth type)
  if (row.auth_type === 'imap' && row.imap_host && row.imap_port && row.smtp_host && row.smtp_port) {
    account.imapCredentials = {
      imapHost: row.imap_host,
      imapPort: row.imap_port,
      smtpHost: row.smtp_host,
      smtpPort: row.smtp_port,
    };
  }

  // Include sync state if available
  if (row.last_history_id || row.delta_token || row.last_sync_at || row.imap_uid_validity || row.imap_highest_modseq) {
    account.syncState = {
      lastHistoryId: row.last_history_id || undefined,
      deltaToken: row.delta_token || undefined,
      lastSyncAt: row.last_sync_at || undefined,
      imapUidValidity: row.imap_uid_validity || undefined,
      imapHighestModseq: row.imap_highest_modseq || undefined,
    };
  }

  return account;
}

/**
 * Create new OAuth account
 */
export function createAccount(input: CreateAccountInput): Account {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT INTO accounts (
      provider, email, display_name, auth_type,
      access_token, refresh_token, token_expires_at,
      is_active
    ) VALUES (?, ?, ?, 'oauth', ?, ?, ?, 1)
  `);

  try {
    const result = stmt.run(
      input.provider,
      input.email,
      input.displayName || null,
      input.tokens.accessToken,
      input.tokens.refreshToken,
      input.tokens.expiresAt
    );

    const accountId = result.lastInsertRowid as number;
    const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId) as AccountRow;

    return rowToAccount(row, true);
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      throw new StorageError(
        `Account with email ${input.email} already exists`,
        'ACCOUNT_DUPLICATE_EMAIL',
        error
      );
    }
    throw new StorageError(
      `Failed to create account: ${error instanceof Error ? error.message : String(error)}`,
      'ACCOUNT_CREATE_ERROR',
      error
    );
  }
}

/**
 * Create new IMAP account (app password authentication)
 */
export function createImapAccount(input: CreateImapAccountInput): Account {
  const db = getDatabase();

  // Encrypt password before storage
  const encryptedPassword = encryptPassword(input.password);

  const stmt = db.prepare(`
    INSERT INTO accounts (
      provider, email, display_name, auth_type,
      imap_host, imap_port, smtp_host, smtp_port,
      encrypted_password,
      is_active
    ) VALUES (?, ?, ?, 'imap', ?, ?, ?, ?, ?, 1)
  `);

  try {
    const result = stmt.run(
      input.provider,
      input.email,
      input.displayName || null,
      input.imapHost,
      input.imapPort,
      input.smtpHost,
      input.smtpPort,
      encryptedPassword
    );

    const accountId = result.lastInsertRowid as number;
    const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId) as AccountRow;

    console.error(`[IMAP] Created account: ${input.email} (ID: ${accountId})`);

    return rowToAccount(row, false);
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      throw new StorageError(
        `Account with email ${input.email} already exists`,
        'ACCOUNT_DUPLICATE_EMAIL',
        error
      );
    }
    throw new StorageError(
      `Failed to create IMAP account: ${error instanceof Error ? error.message : String(error)}`,
      'ACCOUNT_CREATE_ERROR',
      error
    );
  }
}

/**
 * Get decrypted password for IMAP account
 */
export function getImapPassword(accountId: number): string | null {
  const db = getDatabase();

  const stmt = db.prepare('SELECT encrypted_password, auth_type FROM accounts WHERE id = ?');
  const row = stmt.get(accountId) as { encrypted_password: string | null; auth_type: string } | undefined;

  if (!row || row.auth_type !== 'imap' || !row.encrypted_password) {
    return null;
  }

  try {
    return decryptPassword(row.encrypted_password);
  } catch (error) {
    console.error('[IMAP] Failed to decrypt password:', error);
    return null;
  }
}

/**
 * Get account by ID
 */
export function getAccountById(id: number, includeTokens = false): Account | null {
  const db = getDatabase();

  const stmt = db.prepare('SELECT * FROM accounts WHERE id = ?');
  const row = stmt.get(id) as AccountRow | undefined;

  if (!row) {
    return null;
  }

  return rowToAccount(row, includeTokens);
}

/**
 * Get account by email
 */
export function getAccountByEmail(email: string, includeTokens = false): Account | null {
  const db = getDatabase();

  const stmt = db.prepare('SELECT * FROM accounts WHERE email = ?');
  const row = stmt.get(email) as AccountRow | undefined;

  if (!row) {
    return null;
  }

  return rowToAccount(row, includeTokens);
}

/**
 * List all accounts (active by default)
 */
export function listAccounts(activeOnly = true): Account[] {
  const db = getDatabase();

  const query = activeOnly
    ? 'SELECT * FROM accounts WHERE is_active = 1 ORDER BY created_at ASC'
    : 'SELECT * FROM accounts ORDER BY created_at ASC';

  const stmt = db.prepare(query);
  const rows = stmt.all() as AccountRow[];

  return rows.map((row) => rowToAccount(row, false));
}

/**
 * List accounts with email statistics
 */
export function listAccountsWithStats(activeOnly = true): AccountWithStats[] {
  const db = getDatabase();

  const query = activeOnly
    ? `
      SELECT
        a.*,
        COUNT(e.id) as email_count,
        SUM(CASE WHEN e.flags NOT LIKE '%SEEN%' THEN 1 ELSE 0 END) as unread_count
      FROM accounts a
      LEFT JOIN emails e ON e.account_id = a.id
      WHERE a.is_active = 1
      GROUP BY a.id
      ORDER BY a.created_at ASC
    `
    : `
      SELECT
        a.*,
        COUNT(e.id) as email_count,
        SUM(CASE WHEN e.flags NOT LIKE '%SEEN%' THEN 1 ELSE 0 END) as unread_count
      FROM accounts a
      LEFT JOIN emails e ON e.account_id = a.id
      GROUP BY a.id
      ORDER BY a.created_at ASC
    `;

  const stmt = db.prepare(query);
  const rows = stmt.all() as Array<AccountRow & { email_count: number; unread_count: number }>;

  return rows.map((row) => ({
    ...rowToAccount(row, false),
    emailCount: row.email_count || 0,
    unreadCount: row.unread_count || 0,
  }));
}

/**
 * Update OAuth tokens
 */
export function updateTokens(input: UpdateTokensInput): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    UPDATE accounts
    SET access_token = ?,
        refresh_token = ?,
        token_expires_at = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `);

  const result = stmt.run(
    input.tokens.accessToken,
    input.tokens.refreshToken,
    input.tokens.expiresAt,
    input.accountId
  );

  if (result.changes === 0) {
    throw new StorageError(
      `Account with id ${input.accountId} not found`,
      'ACCOUNT_NOT_FOUND'
    );
  }
}

/**
 * Update sync state
 */
export function updateSyncState(input: UpdateSyncStateInput): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    UPDATE accounts
    SET last_history_id = ?,
        delta_token = ?,
        last_sync_at = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `);

  const result = stmt.run(
    input.syncState.lastHistoryId || null,
    input.syncState.deltaToken || null,
    input.syncState.lastSyncAt || null,
    input.accountId
  );

  if (result.changes === 0) {
    throw new StorageError(
      `Account with id ${input.accountId} not found`,
      'ACCOUNT_NOT_FOUND'
    );
  }
}

/**
 * Deactivate account (soft delete)
 */
export function deactivateAccount(id: number): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    UPDATE accounts
    SET is_active = 0,
        updated_at = datetime('now')
    WHERE id = ?
  `);

  const result = stmt.run(id);

  if (result.changes === 0) {
    throw new StorageError(
      `Account with id ${id} not found`,
      'ACCOUNT_NOT_FOUND'
    );
  }
}

/**
 * Delete account permanently (hard delete - also deletes all emails via CASCADE)
 */
export function deleteAccount(id: number): void {
  const db = getDatabase();

  const stmt = db.prepare('DELETE FROM accounts WHERE id = ?');
  const result = stmt.run(id);

  if (result.changes === 0) {
    throw new StorageError(
      `Account with id ${id} not found`,
      'ACCOUNT_NOT_FOUND'
    );
  }
}
