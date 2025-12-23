/**
 * Email Storage Service
 *
 * CRUD operations for emails with FTS5 full-text search.
 */

import { getDatabase } from '../database.js';
import { SearchResult, StorageError } from '../../types/storage.js';
import {
  Email,
  EmailAddress,
  EmailFlag,
  EmailRow,
  EmailSearchFilters,
  EmailUpsertInput,
} from '../../types/email.js';

/**
 * Convert database row to domain object
 */
function rowToEmail(row: EmailRow): Email {
  // Parse JSON arrays
  const toAddresses: EmailAddress[] = JSON.parse(row.to_addresses);
  const ccAddresses: EmailAddress[] = row.cc_addresses ? JSON.parse(row.cc_addresses) : [];
  const bccAddresses: EmailAddress[] = row.bcc_addresses ? JSON.parse(row.bcc_addresses) : [];
  const labels: string[] = JSON.parse(row.labels || '[]');
  const rawHeaders = row.raw_headers ? JSON.parse(row.raw_headers) : undefined;

  // Parse flags from comma-separated string
  const flags: EmailFlag[] = row.flags
    ? row.flags.split(',').filter(Boolean).map((f) => f.trim() as EmailFlag)
    : [];

  const email: Email = {
    id: row.id,
    accountId: row.account_id,
    providerMessageId: row.provider_message_id,
    threadId: row.thread_id || undefined,

    // Core fields
    from: {
      address: row.from_address,
      name: row.from_name || undefined,
    },
    to: toAddresses,
    cc: ccAddresses.length > 0 ? ccAddresses : undefined,
    bcc: bccAddresses.length > 0 ? bccAddresses : undefined,
    subject: row.subject,
    bodyText: row.body_text || undefined,
    bodyHtml: row.body_html || undefined,
    snippet: row.snippet || undefined,

    // Metadata
    date: row.date,
    receivedAt: row.received_at || undefined,

    // Flags and labels
    flags,
    labels,

    // Threading
    inReplyTo: row.in_reply_to || undefined,
    references: row.reference_headers || undefined,

    // Sync metadata
    rawHeaders,
    sizeBytes: row.size_bytes || undefined,
    hasAttachments: row.has_attachments === 1,

    // Timestamps
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  return email;
}

/**
 * Upsert email (insert or update if exists)
 */
export function upsertEmail(input: EmailUpsertInput): Email {
  const db = getDatabase();

  // Serialize arrays to JSON
  const toAddresses = JSON.stringify(input.to);
  const ccAddresses = input.cc ? JSON.stringify(input.cc) : null;
  const bccAddresses = input.bcc ? JSON.stringify(input.bcc) : null;
  const labels = JSON.stringify(input.labels || []);
  const rawHeaders = input.rawHeaders ? JSON.stringify(input.rawHeaders) : null;

  // Serialize flags to comma-separated string
  const flags = input.flags ? input.flags.join(',') : '';

  const stmt = db.prepare(`
    INSERT INTO emails (
      account_id, provider_message_id, thread_id,
      from_address, from_name,
      to_addresses, cc_addresses, bcc_addresses,
      subject, body_text, body_html, snippet,
      date, received_at,
      flags, labels,
      in_reply_to, reference_headers,
      raw_headers, size_bytes, has_attachments
    ) VALUES (
      ?, ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?,
      ?, ?,
      ?, ?,
      ?, ?, ?
    )
    ON CONFLICT (account_id, provider_message_id) DO UPDATE SET
      thread_id = excluded.thread_id,
      from_address = excluded.from_address,
      from_name = excluded.from_name,
      to_addresses = excluded.to_addresses,
      cc_addresses = excluded.cc_addresses,
      bcc_addresses = excluded.bcc_addresses,
      subject = excluded.subject,
      body_text = excluded.body_text,
      body_html = excluded.body_html,
      snippet = excluded.snippet,
      date = excluded.date,
      received_at = excluded.received_at,
      flags = excluded.flags,
      labels = excluded.labels,
      in_reply_to = excluded.in_reply_to,
      reference_headers = excluded.reference_headers,
      raw_headers = excluded.raw_headers,
      size_bytes = excluded.size_bytes,
      has_attachments = excluded.has_attachments,
      updated_at = datetime('now')
  `);

  try {
    const result = stmt.run(
      input.accountId,
      input.providerMessageId,
      input.threadId || null,
      input.from.address,
      input.from.name || null,
      toAddresses,
      ccAddresses,
      bccAddresses,
      input.subject,
      input.bodyText || null,
      input.bodyHtml || null,
      input.snippet || null,
      input.date,
      input.receivedAt || null,
      flags,
      labels,
      input.inReplyTo || null,
      input.references || null,
      rawHeaders,
      input.sizeBytes || null,
      input.hasAttachments ? 1 : 0
    );

    // Get the inserted/updated email
    const emailId = result.lastInsertRowid as number;
    const row = db
      .prepare('SELECT * FROM emails WHERE id = ?')
      .get(emailId) as EmailRow;

    return rowToEmail(row);
  } catch (error) {
    throw new StorageError(
      `Failed to upsert email: ${error instanceof Error ? error.message : String(error)}`,
      'EMAIL_SAVE_ERROR',
      error
    );
  }
}

/**
 * Get email by ID
 */
export function getEmailById(id: number): Email | null {
  const db = getDatabase();

  const stmt = db.prepare('SELECT * FROM emails WHERE id = ?');
  const row = stmt.get(id) as EmailRow | undefined;

  if (!row) {
    return null;
  }

  return rowToEmail(row);
}

/**
 * Get email by provider message ID
 */
export function getEmailByProviderMessageId(
  accountId: number,
  providerMessageId: string
): Email | null {
  const db = getDatabase();

  const stmt = db.prepare(
    'SELECT * FROM emails WHERE account_id = ? AND provider_message_id = ?'
  );
  const row = stmt.get(accountId, providerMessageId) as EmailRow | undefined;

  if (!row) {
    return null;
  }

  return rowToEmail(row);
}

/**
 * Search emails with filters and FTS5 full-text search
 */
export function searchEmails(filters: EmailSearchFilters): SearchResult<Email> {
  const db = getDatabase();

  const conditions: string[] = [];
  const params: unknown[] = [];

  // Account filter
  if (filters.accountId !== undefined) {
    conditions.push('e.account_id = ?');
    params.push(filters.accountId);
  }

  // Full-text search (FTS5)
  if (filters.query) {
    conditions.push(`e.id IN (
      SELECT rowid FROM emails_fts WHERE emails_fts MATCH ?
    )`);
    params.push(filters.query);
  }

  // From filter
  if (filters.from) {
    conditions.push('e.from_address LIKE ?');
    params.push(`%${filters.from}%`);
  }

  // Subject filter
  if (filters.subject) {
    conditions.push('e.subject LIKE ?');
    params.push(`%${filters.subject}%`);
  }

  // Attachments filter
  if (filters.hasAttachments !== undefined) {
    conditions.push('e.has_attachments = ?');
    params.push(filters.hasAttachments ? 1 : 0);
  }

  // Flags filter
  if (filters.flags && filters.flags.length > 0) {
    const flagConditions = filters.flags.map(() => 'e.flags LIKE ?');
    conditions.push(`(${flagConditions.join(' AND ')})`);
    filters.flags.forEach((flag) => params.push(`%${flag}%`));
  }

  // Labels filter
  if (filters.labels && filters.labels.length > 0) {
    const labelConditions = filters.labels.map(() => 'e.labels LIKE ?');
    conditions.push(`(${labelConditions.join(' AND ')})`);
    filters.labels.forEach((label) => params.push(`%${label}%`));
  }

  // Thread ID filter
  if (filters.threadId) {
    conditions.push('e.thread_id = ?');
    params.push(filters.threadId);
  }

  // Date range filters
  if (filters.dateFrom) {
    conditions.push('e.date >= ?');
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    conditions.push('e.date <= ?');
    params.push(filters.dateTo);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count total matches
  const countQuery = `SELECT COUNT(*) as total FROM emails e ${whereClause}`;
  const countStmt = db.prepare(countQuery);
  const countResult = countStmt.get(...params) as { total: number };
  const total = countResult.total;

  // Fetch paginated results
  const query = `
    SELECT * FROM emails e
    ${whereClause}
    ORDER BY e.date DESC
    LIMIT ? OFFSET ?
  `;

  const stmt = db.prepare(query);
  const rows = stmt.all(...params, filters.limit, filters.offset) as EmailRow[];

  const items = rows.map(rowToEmail);
  const hasMore = filters.offset + items.length < total;

  return {
    items,
    total,
    hasMore,
  };
}

/**
 * Update email flags
 */
export function updateEmailFlags(id: number, flags: EmailFlag[]): void {
  const db = getDatabase();

  const flagsStr = flags.join(',');

  const stmt = db.prepare(`
    UPDATE emails
    SET flags = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `);

  const result = stmt.run(flagsStr, id);

  if (result.changes === 0) {
    throw new StorageError(`Email with id ${id} not found`, 'EMAIL_NOT_FOUND');
  }
}

/**
 * Add labels to email (merge with existing)
 */
export function addLabels(id: number, newLabels: string[]): void {
  const db = getDatabase();

  // Get current labels
  const row = db.prepare('SELECT labels FROM emails WHERE id = ?').get(id) as
    | { labels: string }
    | undefined;

  if (!row) {
    throw new StorageError(`Email with id ${id} not found`, 'EMAIL_NOT_FOUND');
  }

  const currentLabels: string[] = JSON.parse(row.labels || '[]');
  const mergedLabels = Array.from(new Set([...currentLabels, ...newLabels]));

  const stmt = db.prepare(`
    UPDATE emails
    SET labels = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `);

  stmt.run(JSON.stringify(mergedLabels), id);
}

/**
 * Delete email
 */
export function deleteEmail(id: number): void {
  const db = getDatabase();

  const stmt = db.prepare('DELETE FROM emails WHERE id = ?');
  const result = stmt.run(id);

  if (result.changes === 0) {
    throw new StorageError(`Email with id ${id} not found`, 'EMAIL_NOT_FOUND');
  }
}

/**
 * Get emails by thread ID
 */
export function getEmailsByThreadId(threadId: string): Email[] {
  const db = getDatabase();

  const stmt = db.prepare('SELECT * FROM emails WHERE thread_id = ? ORDER BY date ASC');
  const rows = stmt.all(threadId) as EmailRow[];

  return rows.map(rowToEmail);
}
